const ProjectService = require('../services/ProjectService');

class ProjectController {
  async list(req, res, next) {
    try {
      const rows = await ProjectService.listProjects(req.user);
      return res.json({
        status: 'success',
        data: rows.map((p) => ({
          project_id: p.id,
          name: p.name,
          role: p.role,
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const project = await ProjectService.createProject(req.body?.name, req.user);
      return res.status(201).json({
        status: 'success',
        data: {
          project_id: project.id,
          name: project.name,
          role: project.role,
          created_at: project.createdAt,
          updated_at: project.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async rename(req, res, next) {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const project = await ProjectService.renameProject(id, name, req.user);
      return res.json({
        status: 'success',
        data: {
          project_id: project.id,
          name: project.name,
          role: project.role,
          created_at: project.createdAt,
          updated_at: project.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      await ProjectService.deleteProject(id, req.user);
      return res.json({
        status: 'success',
        message: 'Project deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProjectController();
