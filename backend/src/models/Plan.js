const supabase = require('../config/database');

class PlanModel {
  static async findAll() {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('credits_limit', { ascending: true });
    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      creditsLimit: row.credits_limit,
      maxProjects: row.max_projects ?? null,
      maxMembersPerProject: row.max_members_per_project ?? null,
      taskHistoryDays: row.task_history_days ?? null,
      description: row.description,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }
}

module.exports = PlanModel;
