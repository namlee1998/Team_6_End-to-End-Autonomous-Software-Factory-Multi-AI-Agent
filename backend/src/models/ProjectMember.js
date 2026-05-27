const supabase = require('../config/database');

class ProjectMemberModel {
  static async create(data) {
    const { data: record, error } = await supabase
      .from('project_members')
      .insert([{
        project_id: data.projectId,
        user_id: data.userId,
        role: data.role,
        invited_by: data.invitedBy || null,
      }])
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async find(projectId, userId) {
    const { data, error } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static async listByProject(projectId) {
    const { data, error } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async listByUser(userId) {
    const { data, error } = await supabase
      .from('project_members')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async countByProject(projectId) {
    const { count, error } = await supabase
      .from('project_members')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    if (error) throw error;
    return count || 0;
  }

  static async countOwnedByUser(userId) {
    const { count, error } = await supabase
      .from('project_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'owner');
    if (error) throw error;
    return count || 0;
  }

  static async countOwners(projectId) {
    const { count, error } = await supabase
      .from('project_members')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('role', 'owner');

    if (error) throw error;
    return count || 0;
  }

  static async updateRole(projectId, userId, role) {
    const { data, error } = await supabase
      .from('project_members')
      .update({ role })
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return this._map(data);
  }

  static async delete(projectId, userId) {
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  static _map(row) {
    if (!row) return null;
    return {
      projectId: row.project_id,
      userId: row.user_id,
      role: row.role,
      invitedBy: row.invited_by,
      joinedAt: row.joined_at,
      createdAt: row.created_at,
    };
  }
}

module.exports = ProjectMemberModel;
