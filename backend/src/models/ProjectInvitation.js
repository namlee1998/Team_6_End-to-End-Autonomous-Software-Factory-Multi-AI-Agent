const supabase = require('../config/database');

class ProjectInvitationModel {
  static async create(data) {
    const { data: record, error } = await supabase
      .from('project_invitations')
      .insert([{
        id: data.id,
        project_id: data.projectId,
        email: data.email,
        role: data.role,
        token: data.token,
        status: data.status || 'pending',
        invited_by: data.invitedBy,
        expires_at: data.expiresAt,
      }])
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('project_invitations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static async findByToken(token) {
    const { data, error } = await supabase
      .from('project_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static async listByProject(projectId) {
    const { data, error } = await supabase
      .from('project_invitations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async countPendingByProject(projectId) {
    const { count, error } = await supabase
      .from('project_invitations')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'pending');
    if (error) throw error;
    return count || 0;
  }

  static async listPendingByEmail(email) {
    const { data, error } = await supabase
      .from('project_invitations')
      .select('*')
      .ilike('email', email)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async updateStatus(id, status) {
    const { data, error } = await supabase
      .from('project_invitations')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this._map(data);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      email: row.email,
      role: row.role,
      token: row.token,
      status: row.status,
      invitedBy: row.invited_by,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }
}

module.exports = ProjectInvitationModel;
