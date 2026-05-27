const supabase = require('../config/database');

const TOKENS_PER_CREDIT = 1000;

class UserSubscriptionModel {
  static get TOKENS_PER_CREDIT() { return TOKENS_PER_CREDIT; }

  static async findByUserId(userId) {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static async upsert({ userId, planId, creditsTotal, periodStart, periodEnd = null }) {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .upsert(
        {
          user_id: userId,
          plan_id: planId,
          credits_total: creditsTotal,
          credits_used: 0,
          status: 'active',
          period_start: periodStart || new Date().toISOString(),
          period_end: periodEnd,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();
    if (error) throw error;
    return this._map(data);
  }

  /**
   * Atomically increment credits_used.
   * Returns the updated row, or null if user has no subscription.
   */
  static async incrementCreditsUsed(userId, creditsToAdd) {
    const { data, error } = await supabase.rpc('increment_credits_used', {
      p_user_id: userId,
      p_credits: creditsToAdd,
    });
    if (error) throw error;
    return data ? this._map(data) : null;
  }

  static async updateStatus(userId, status) {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return this._map(data);
  }

  static async assignPlan(userId, planId, creditsTotal, periodEnd = null) {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .upsert(
        {
          user_id: userId,
          plan_id: planId,
          credits_total: creditsTotal,
          credits_used: 0,
          status: 'active',
          period_start: new Date().toISOString(),
          period_end: periodEnd,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();
    if (error) throw error;
    return this._map(data);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      status: row.status,
      creditsUsed: row.credits_used,
      creditsTotal: row.credits_total,
      creditsRemaining: row.credits_total - row.credits_used,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = UserSubscriptionModel;
