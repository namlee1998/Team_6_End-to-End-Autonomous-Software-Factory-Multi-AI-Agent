const supabase = require('../config/database');

class UsageLogModel {
  static async create({ userId, projectId, taskId, agentType, status, tokenInput, tokenOutput, creditsCharged }) {
    const tokenTotal = (tokenInput || 0) + (tokenOutput || 0);
    const { data, error } = await supabase
      .from('usage_logs')
      .insert([{
        user_id: userId,
        project_id: projectId || null,
        task_id: taskId || null,
        agent_type: agentType,
        status,
        token_input: tokenInput || 0,
        token_output: tokenOutput || 0,
        token_total: tokenTotal,
        credits_charged: creditsCharged || 0,
        executed_at: new Date().toISOString(),
      }])
      .select()
      .single();
    if (error) throw error;
    return this._map(data);
  }

  static async listByUser(userId, { limit = 50, offset = 0 } = {}) {
    const { data, error } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('user_id', userId)
      .order('executed_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async listByUserPaginated(userId, { limit = 50, offset = 0 } = {}) {
    const { data, error, count } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('executed_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return {
      rows: (data || []).map(this._map),
      count: count || 0,
      limit,
      offset,
    };
  }

  /** Aggregate token & credit totals for a user within a date window. */
  static async sumByUser(userId, since) {
    const { data, error } = await supabase
      .from('usage_logs')
      .select('token_total, credits_charged')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('executed_at', since.toISOString());
    if (error) throw error;
    return (data || []).reduce(
      (acc, row) => ({
        tokenTotal: acc.tokenTotal + (row.token_total || 0),
        creditsCharged: acc.creditsCharged + (row.credits_charged || 0),
      }),
      { tokenTotal: 0, creditsCharged: 0 },
    );
  }

  /** Delete logs older than cutoffDate (90-day retention). */
  static async deleteOlderThan(cutoffDate) {
    const { error } = await supabase
      .from('usage_logs')
      .delete()
      .lt('executed_at', cutoffDate.toISOString());
    if (error) throw error;
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      taskId: row.task_id,
      agentType: row.agent_type,
      status: row.status,
      tokenInput: row.token_input,
      tokenOutput: row.token_output,
      tokenTotal: row.token_total,
      creditsCharged: row.credits_charged,
      executedAt: row.executed_at,
    };
  }
}

module.exports = UsageLogModel;
