const { Project, Folder, Document } = require('../models');
const MembershipService = require('./MembershipService');

class TreeService {
  async getTree(user) {
    const projectIds = await MembershipService.listAccessibleProjectIds(user.id);
    if (projectIds.length === 0) {
      return { projects: [], folders: [], documents: [] };
    }

    const projects = await Project.listByIds(projectIds);
    const folders = (await Promise.all(projectIds.map((projectId) => Folder.listByProjectId(projectId)))).flat();
    const docResults = await Promise.all(
      projectIds.map((projectId) => Document.list({ projectId, limit: 5000, offset: 0 })),
    );

    return {
      projects: await Promise.all(projects.map(async (project) => ({
        ...project,
        role: await MembershipService.getUserProjectRole(user.id, project.id),
      }))),
      folders,
      documents: docResults.flatMap((result) => result.rows),
    };
  }
}

module.exports = new TreeService();
