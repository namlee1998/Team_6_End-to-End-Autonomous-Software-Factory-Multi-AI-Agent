const supabase = require('../config/database');

const TIME_WINDOWS = ['1d', '7d', '30d'];

function windowToMs(window) {
  const days = parseInt(window, 10);
  return days * 24 * 60 * 60 * 1000;
}

class DashboardService {
  async computeSnapshot(timeWindow) {
    const since = new Date(Date.now() - windowToMs(timeWindow)).toISOString();

    const [
      usersResult,
      subscriptionsResult,
      activeUsersResult,
      runsResult,
      creditsResult,
      runsByAgentResult,
    ] = await Promise.all([
      // Total users with subscriptions
      supabase.from('user_subscriptions').select('user_id, plan_id, status', { count: 'exact' }),

      // Users by plan and status breakdown
      supabase.from('user_subscriptions').select('plan_id, status'),

      // Active users in window (distinct user_ids that ran an agent)
      supabase
        .from('usage_logs')
        .select('user_id')
        .gte('executed_at', since),

      // Total runs in window
      supabase
        .from('usage_logs')
        .select('status', { count: 'exact' })
        .gte('executed_at', since),

      // Credits charged in window
      supabase
        .from('usage_logs')
        .select('credits_charged')
        .eq('status', 'completed')
        .gte('executed_at', since),

      // Runs by agent in window
      supabase
        .from('usage_logs')
        .select('agent_type, status')
        .gte('executed_at', since),
    ]);

    const subs = subscriptionsResult.data || [];
    const usersByPlan = subs.reduce((acc, s) => {
      acc[s.plan_id] = (acc[s.plan_id] || 0) + 1;
      return acc;
    }, {});
    const quotaExceededUsers = subs.filter((s) => s.status === 'quota_exceeded').length;
    const suspendedUsers = subs.filter((s) => s.status === 'suspended').length;

    const activeUserIds = new Set((activeUsersResult.data || []).map((r) => r.user_id));

    const allRuns = runsByAgentResult.data || [];
    const runsByAgent = allRuns.reduce((acc, r) => {
      acc[r.agent_type] = (acc[r.agent_type] || 0) + 1;
      return acc;
    }, {});
    const successfulRuns = allRuns.filter((r) => r.status === 'completed').length;
    const failedRuns = allRuns.filter((r) => r.status === 'failed').length;

    const totalCredits = (creditsResult.data || []).reduce(
      (sum, r) => sum + (r.credits_charged || 0),
      0,
    );

    return {
      total_users: usersResult.count || 0,
      active_users: activeUserIds.size,
      quota_exceeded_users: quotaExceededUsers,
      suspended_users: suspendedUsers,
      users_by_plan: usersByPlan,
      total_runs: allRuns.length,
      successful_runs: successfulRuns,
      failed_runs: failedRuns,
      total_credits: totalCredits,
      runs_by_agent: runsByAgent,
    };
  }

  async runBatch() {
    console.log('[DashboardService] Running batch snapshot...');
    const now = new Date();

    for (const window of TIME_WINDOWS) {
      try {
        const data = await this.computeSnapshot(window);
        const { error } = await supabase.from('dashboard_snapshots').upsert(
          { snapshot_at: now.toISOString(), time_window: window, data },
          { onConflict: 'snapshot_at,time_window' },
        );
        if (error) {
          console.error(`[DashboardService] Failed to save snapshot (${window}):`, error.message);
        } else {
          console.log(`[DashboardService] Snapshot saved: ${window}`);
        }
      } catch (err) {
        console.error(`[DashboardService] Error computing snapshot (${window}):`, err.message);
      }
    }

    // Clean up usage_logs older than 90 days
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const { error } = await supabase
        .from('usage_logs')
        .delete()
        .lt('executed_at', cutoff.toISOString());
      if (!error) console.log('[DashboardService] Old usage logs cleaned up.');
    } catch (err) {
      console.error('[DashboardService] Cleanup error:', err.message);
    }
  }

  async getLatestSnapshots() {
    const results = {};
    for (const window of TIME_WINDOWS) {
      const { data, error } = await supabase
        .from('dashboard_snapshots')
        .select('*')
        .eq('time_window', window)
        .order('snapshot_at', { ascending: false })
        .limit(1)
        .single();
      if (!error && data) results[window] = data;
    }
    return results;
  }
}

module.exports = new DashboardService();
