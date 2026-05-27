const supabase = require('../config/database');

class FolderModel {
  static async create(data) {
    const { data: record, error } = await supabase
      .from('folders')
      .insert([{
        id: data.id,
        project_id: data.projectId,
        parent_id: data.parentId || null,
        name: data.name,
        sort_order: data.sortOrder ?? 0,
      }])
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static async listByProjectId(projectId) {
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async listAll() {
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async update(id, payload) {
    const { data: record, error } = await supabase
      .from('folders')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async delete(id) {
    const { error } = await supabase
      .from('folders')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id,
      name: row.name,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = FolderModel;
