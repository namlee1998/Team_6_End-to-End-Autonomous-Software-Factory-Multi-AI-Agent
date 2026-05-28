const FolderService = require('../services/FolderService');

class FolderController {
  async list(req, res, next) {
    try {
      const { project_id: projectId } = req.query;
      const rows = await FolderService.listFolders(projectId, req.user);
      return res.json({
        status: 'success',
        data: rows.map((f) => ({
          folder_id: f.id,
          project_id: f.projectId,
          parent_id: f.parentId,
          name: f.name,
          sort_order: f.sortOrder,
          created_at: f.createdAt,
          updated_at: f.updatedAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const folder = await FolderService.createFolder({
        projectId: req.body?.project_id,
        parentId: req.body?.parent_id || null,
        name: req.body?.name,
        user: req.user,
      });
      return res.status(201).json({
        status: 'success',
        data: {
          folder_id: folder.id,
          project_id: folder.projectId,
          parent_id: folder.parentId,
          name: folder.name,
          sort_order: folder.sortOrder,
          created_at: folder.createdAt,
          updated_at: folder.updatedAt,
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
      const folder = await FolderService.renameFolder(id, name, req.user);
      return res.json({
        status: 'success',
        data: {
          folder_id: folder.id,
          project_id: folder.projectId,
          parent_id: folder.parentId,
          name: folder.name,
          sort_order: folder.sortOrder,
          created_at: folder.createdAt,
          updated_at: folder.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async move(req, res, next) {
    try {
      const { id } = req.params;
      const folder = await FolderService.moveFolder(id, {
        parentId: req.body?.parent_id || null,
        projectId: req.body?.project_id || undefined,
        sortOrder: req.body?.sort_order,
        user: req.user,
      });
      return res.json({
        status: 'success',
        data: {
          folder_id: folder.id,
          project_id: folder.projectId,
          parent_id: folder.parentId,
          name: folder.name,
          sort_order: folder.sortOrder,
          created_at: folder.createdAt,
          updated_at: folder.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      await FolderService.deleteFolder(id, req.user);
      return res.json({
        status: 'success',
        message: 'Folder deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FolderController();
