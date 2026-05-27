const TreeService = require("../services/TreeService");

class TreeController {
  async getTree(req, res, next) {
    try {
      const { projects, folders, documents } = await TreeService.getTree(
        req.user,
      );

      return res.json({
        status: "success",
        data: {
          projects: projects.map((p) => ({
            project_id: p.id,
            name: p.name,
            role: p.role,
            created_at: p.createdAt,
            updated_at: p.updatedAt,
          })),
          folders: folders.map((f) => ({
            folder_id: f.id,
            project_id: f.projectId,
            parent_id: f.parentId,
            name: f.name,
            sort_order: f.sortOrder,
            created_at: f.createdAt,
            updated_at: f.updatedAt,
          })),
          documents: documents.map((d) => ({
            document_id: d.id,
            project_id: d.projectId,
            folder_id: d.folderId,
            file_name: d.fileName,
            file_type: d.fileType,
            file_size: d.fileSize,
            status: d.status,
            created_at: d.createdAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TreeController();
