const supabase = require('../config/database');

class ProjectModel {
  static async create(data) {
    const { data: record, error } = await supabase
      .from('projects')
      .insert([{
        id: data.id,
        name: data.name,
        created_by: data.createdBy || null,
      }])
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static async list() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async listByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async update(id, payload) {
    const { data: record, error } = await supabase
      .from('projects')
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
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = ProjectModel;
