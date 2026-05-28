const { v4: uuidv4 } = require('uuid');
const { Project, Folder, Document, ProjectMember } = require('../models');
const DocumentService = require('./DocumentService');
const MembershipService = require('./MembershipService');
const QuotaService = require('./QuotaService');
const { ApiError } = require('../middleware/errorHandler');

class ProjectService {
  async listProjects(user) {
    const projectIds = await MembershipService.listAccessibleProjectIds(user.id);
    const projects = await Project.listByIds(projectIds);
    return Promise.all(projects.map(async (project) => ({
      ...project,
      role: await MembershipService.getUserProjectRole(user.id, project.id),
    })));
  }

  async createProject(name, user) {
    if (!name || !name.trim()) {
      throw new ApiError(400, 'Project name is required');
    }
    if (!user?.id) throw new ApiError(401, 'Authenticated user is required');

    const sub = await QuotaService.getOrProvisionSubscription(user.id);
    const { Plan } = require('../models');
    const plan = await Plan.findById(sub.planId);
    if (plan?.maxProjects !== null && plan?.maxProjects !== undefined) {
      const ownedCount = await ProjectMember.countOwnedByUser(user.id);
      if (ownedCount >= plan.maxProjects) {
        throw new ApiError(403, `Gói ${plan.name} chỉ cho phép tạo tối đa ${plan.maxProjects} project. Hãy nâng cấp lên Pro để tạo thêm.`);
      }
    }

    const project = await Project.create({
      id: uuidv4(),
      name: name.trim(),
      createdBy: user.id,
    });
    await MembershipService.createOwnerMembership(project.id, user.id);
    return { ...project, role: 'owner' };
  }

  async renameProject(projectId, name, user) {
    await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin']);
    const project = await Project.findById(projectId);
    if (!project) throw new ApiError(404, 'Project not found');
    if (!name || !name.trim()) throw new ApiError(400, 'Project name is required');
    const updated = await Project.update(projectId, { name: name.trim() });
    const role = await MembershipService.getUserProjectRole(user.id, projectId);
    return { ...updated, role };
  }

  async deleteProject(projectId, user) {
    await MembershipService.requireProjectRole(user.id, projectId, ['owner']);
    const project = await Project.findById(projectId);
    if (!project) throw new ApiError(404, 'Project not found');

    const projectDocs = await Document.list({ projectId, limit: 1000, offset: 0 });
    const docIds = projectDocs.rows.map((d) => d.id);
    for (const docId of docIds) {
      await DocumentService.deleteDocument(docId, user, { skipAccessCheck: true });
    }

    await Project.delete(projectId);
    return true;
  }

  async getProjectTree(projectId, user) {
    await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    const project = await Project.findById(projectId);
    if (!project) throw new ApiError(404, 'Project not found');

    const [folders, docsResult] = await Promise.all([
      Folder.listByProjectId(projectId),
      Document.list({ projectId, limit: 1000, offset: 0 }),
    ]);

    return {
      project,
      folders,
      documents: docsResult.rows,
    };
  }
}

module.exports = new ProjectService();
