const supabase = require('../config/database');

class TaskModel {
  static async create(data) {
    const { data: record, error } = await supabase
      .from('tasks')
      .insert([{
        id: data.id,
        project_id: data.projectId,
        type: data.type,
        status: data.status || 'pending',
        prompt_profile: data.promptProfile,
        result: data.result,
        error: data.error,
        input_content_hash: data.inputContentHash || null,
        output_content_hash: data.outputContentHash || null,
        source_run_id: data.sourceRunId || null,
        version_status: data.versionStatus || 'draft',
        observability: data.observability || {},
      }])
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static async findByIdWithDocument(id) {
    return this.findById(id);
  }

  static async update(id, data) {
    const { data: record, error } = await supabase
      .from('tasks')
      .update({
        ...data,
        updated_at: data.updated_at || new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async findByProjectId(projectId) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async list(filters = {}) {
    const limit = Number.isFinite(filters.limit) ? filters.limit : 50;
    let query = supabase
      .from('tasks')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));

    if (filters.type)      query = query.eq('type', filters.type);
    if (filters.status)    query = query.eq('status', filters.status);
    if (filters.projectId) query = query.eq('project_id', filters.projectId);
    if (filters.sinceDate) query = query.gte('created_at', filters.sinceDate);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async deleteById(id) {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async findLatestByProject(projectId, type, status = null, versionStatus = null) {
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);
    if (versionStatus) query = query.eq('version_status', versionStatus);

    const { data, error } = await query;
    if (error) throw error;
    return data?.[0] ? this._map(data[0]) : null;
  }

  static async commitTask(id) {
    const { data: record, error } = await supabase
      .from('tasks')
      .update({ version_status: 'committed' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      status: row.status,
      promptProfile: row.prompt_profile,
      result: row.result,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      inputContentHash: row.input_content_hash || null,
      outputContentHash: row.output_content_hash || null,
      sourceRunId: row.source_run_id || null,
      versionStatus: row.version_status || 'committed',
      observability: row.observability || {},
    };
  }
}

module.exports = TaskModel;
