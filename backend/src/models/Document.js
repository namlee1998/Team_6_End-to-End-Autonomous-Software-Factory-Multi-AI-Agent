const supabase = require('../config/database');

class DocumentModel {
  /**
   * Create a new document record
   */
  static async create(data) {
    const { data: record, error } = await supabase
      .from('documents')
      .insert([{
        id: data.id,
        project_id: data.projectId,
        file_name: data.fileName,
        file_type: data.fileType,
        file_path: data.filePath,
        file_size: data.fileSize,
        folder_id: data.folderId,
        status: data.status || 'uploaded',
      }])
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  /**
   * Find document by ID
   */
  static async findById(id) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      throw error;
    }
    return this._map(data);
  }

  /**
   * Update document
   */
  static async update(id, data) {
    const { data: record, error } = await supabase
      .from('documents')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  /**
   * List documents with pagination
   */
  static async list({ limit = 50, offset = 0, projectId } = {}) {
    let query = supabase
      .from('documents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return { rows: (data || []).map(this._map), count };
  }

  /**
   * Delete document
   */
  static async delete(id) {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async rename(id, fileName) {
    const { data: record, error } = await supabase
      .from('documents')
      .update({
        file_name: fileName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async move(id, { projectId, folderId }) {
    const { data: record, error } = await supabase
      .from('documents')
      .update({
        project_id: projectId,
        folder_id: folderId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  /**
   * Map DB columns to camelCase
   */
  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      fileName: row.file_name,
      fileType: row.file_type,
      filePath: row.file_path,
      fileSize: row.file_size,
      folderId: row.folder_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = DocumentModel;
