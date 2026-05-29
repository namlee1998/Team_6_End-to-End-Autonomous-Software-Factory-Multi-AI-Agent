const supabase = require('../config/supabase');

class FeatureBacklog {
  static async create(data) {
    const { data: record, error } = await supabase
      .from('feature_backlogs')
      .insert([data])
      .select()
      .single();

    if (error) throw error;
    return record;
  }

  static async findByProjectId(projectId) {
    const { data, error } = await supabase
      .from('feature_backlogs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async updateStatus(id, status) {
    const { data, error } = await supabase
      .from('feature_backlogs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async linkTask(id, taskId) {
    const { data, error } = await supabase
      .from('feature_backlogs')
      .update({ task_id: taskId, status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = FeatureBacklog;
