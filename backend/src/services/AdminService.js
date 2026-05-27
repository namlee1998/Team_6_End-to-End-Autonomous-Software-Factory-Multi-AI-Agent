const jwt = require('jsonwebtoken');
const supabase = require('../config/database');
const AdminUser = require('../models/AdminUser');
const UserSubscription = require('../models/UserSubscription');
const Plan = require('../models/Plan');
const UsageLog = require('../models/UsageLog');
const DashboardService = require('./DashboardService');
const { ADMIN_JWT_SECRET, ADMIN_JWT_EXPIRES_IN } = require('../config/environment');
const { ApiError } = require('../middleware/errorHandler');

const ADMIN_STATS_WINDOWS = new Set(['1d', '7d', '30d']);
const AGENT_LABELS = {
  agent_1: 'Agent 1',
  agent_2: 'Agent 2',
  agent_3: 'Agent 3',
  'extract-flows': 'Agent 1',
  'generate-testcases': 'Agent 2',
  'generate-automation': 'Agent 3',
};

function normalizeStatsWindow(window) {
  return ADMIN_STATS_WINDOWS.has(window) ? window : '7d';
}

function clampPagination({ limit, offset } = {}, defaultLimit = 10, maxLimit = 50) {
  const parsedLimit = Number.parseInt(limit, 10);
  const parsedOffset = Number.parseInt(offset, 10);

  return {
    limit: Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), maxLimit) : defaultLimit,
    offset: Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0,
  };
}

function windowToSince(window) {
  const days = parseInt(window, 10);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function avg(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getObservability(row) {
  return row?.observability && typeof row.observability === 'object' ? row.observability : {};
}

function taskTypeToAgentType(type) {
  if (type === 'extract-flows') return 'agent_1';
  if (type === 'generate-testcases') return 'agent_2';
  if (type === 'generate-automation') return 'agent_3';
  return type;
}

function taskTimestamp(row) {
  return row.status === 'failed' ? row.updated_at : row.updated_at || row.created_at;
}

function latestUsageByTask(usageRows) {
  return usageRows.reduce((acc, row) => {
    if (!row.task_id) return acc;
    const current = acc[row.task_id];
    if (!current || new Date(row.executed_at) > new Date(current.executed_at)) {
      acc[row.task_id] = row;
    }
    return acc;
  }, {});
}

class AdminService {
  // ─── Auth ────────────────────────────────────────────────────────────────

  async login(email, password) {
    const row = await AdminUser.findByEmail(email);
    if (!row) throw new ApiError(401, 'Invalid credentials');
    if (!row.is_active) throw new ApiError(403, 'Admin account is deactivated');

    const ok = await AdminUser.verifyPassword(password, row.password_hash);
    if (!ok) throw new ApiError(401, 'Invalid credentials');

    const token = jwt.sign(
      { sub: row.id, email: row.email },
      ADMIN_JWT_SECRET,
      { expiresIn: ADMIN_JWT_EXPIRES_IN },
    );
    return { token, admin: AdminUser._mapSafe(row) };
  }

  async createAdmin({ email, password, fullName }, actingAdminId) {
    const existing = await AdminUser.findByEmail(email);
    if (existing) throw new ApiError(409, 'Admin with this email already exists');

    const admin = await AdminUser.create({ email, password, fullName });
    await this._writeAudit(actingAdminId, 'create_admin', 'admin', admin.id, { email });
    return admin;
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  async getStats(window = '7d', pagination = {}) {
    const selectedWindow = normalizeStatsWindow(window);
    const failuresPagination = clampPagination(
      { limit: pagination.failuresLimit, offset: pagination.failuresOffset },
      10,
      50,
    );
    const tracesPagination = clampPagination(
      { limit: pagination.tracesLimit, offset: pagination.tracesOffset },
      10,
      50,
    );
    const [snapshots, liveStats] = await Promise.all([
      DashboardService.getLatestSnapshots(),
      this._getLiveStats(selectedWindow, { failures: failuresPagination, traces: tracesPagination }),
    ]);

    return {
      ...snapshots,
      live: liveStats.live,
      recentFailures: liveStats.recentFailures,
      recentTraces: liveStats.recentTraces,
      selectedWindow,
    };
  }

  // ─── Users ───────────────────────────────────────────────────────────────

  async listUsers({ limit = 50, offset = 0, planId, status, search } = {}) {
    // Fetch subscriptions with pagination filters
    let query = supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (planId) query = query.eq('plan_id', planId);
    if (status) query = query.eq('status', status);

    const { data: subs, error, count } = await query;
    if (error) throw error;

    // Fetch Supabase auth user emails for each subscription
    const rows = await Promise.all(
      (subs || []).map(async (sub) => {
        const profile = await this._getProfile(sub.user_id);
        return {
          userId: sub.user_id,
          email: profile?.email || null,
          fullName: profile?.full_name || null,
          planId: sub.plan_id,
          status: sub.status,
          creditsUsed: sub.credits_used,
          creditsTotal: sub.credits_total,
          creditsRemaining: sub.credits_total - sub.credits_used,
          periodStart: sub.period_start,
          periodEnd: sub.period_end,
          createdAt: sub.created_at,
        };
      }),
    );

    const filtered = search
      ? rows.filter(
          (r) =>
            r.email?.toLowerCase().includes(search.toLowerCase()) ||
            r.fullName?.toLowerCase().includes(search.toLowerCase()),
        )
      : rows;

    return { rows: filtered, count: count || 0 };
  }

  async getUserDetail(userId, pagination = {}) {
    const sub = await UserSubscription.findByUserId(userId);
    if (!sub) throw new ApiError(404, 'User subscription not found');

    const profile = await this._getProfile(userId);
    const usagePagination = clampPagination(
      { limit: pagination.usageLimit, offset: pagination.usageOffset },
      10,
      50,
    );
    const recentUsage = await UsageLog.listByUserPaginated(userId, usagePagination);

    return {
      userId,
      email: profile?.email || null,
      fullName: profile?.full_name || null,
      subscription: sub,
      recentUsage,
    };
  }

  async changePlan(userId, planId, actingAdminId) {
    const plan = await Plan.findById(planId);
    if (!plan) throw new ApiError(404, 'Plan not found');

    const oldSub = await UserSubscription.findByUserId(userId);
    const oldPlanId = oldSub?.planId || null;

    await UserSubscription.assignPlan(userId, planId, plan.creditsLimit);
    await this._writeAudit(actingAdminId, 'change_plan', 'user', userId, {
      old_plan: oldPlanId,
      new_plan: planId,
    });
  }

  async suspendUser(userId, reason, actingAdminId) {
    const sub = await UserSubscription.findByUserId(userId);
    if (!sub) throw new ApiError(404, 'User not found');

    await UserSubscription.updateStatus(userId, 'suspended');
    await this._writeAudit(actingAdminId, 'suspend_user', 'user', userId, { reason });
  }

  async unsuspendUser(userId, actingAdminId) {
    const sub = await UserSubscription.findByUserId(userId);
    if (!sub) throw new ApiError(404, 'User not found');

    const newStatus = sub.creditsUsed >= sub.creditsTotal ? 'quota_exceeded' : 'active';
    await UserSubscription.updateStatus(userId, newStatus);
    await this._writeAudit(actingAdminId, 'unsuspend_user', 'user', userId, {});
  }

  async resetCredits(userId, actingAdminId) {
    const { error } = await supabase
      .from('user_subscriptions')
      .update({ credits_used: 0, status: 'active', updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) throw error;
    await this._writeAudit(actingAdminId, 'reset_credits', 'user', userId, {});
  }

  // ─── Analytics ───────────────────────────────────────────────────────────

  async getFunnelData({ windowDays = 30 } = {}) {
    const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

    const [r1, r2, r3] = await Promise.all([
      supabase.from('tasks').select('project_id').eq('type', 'extract-flows').eq('status', 'completed').gte('created_at', since),
      supabase.from('tasks').select('project_id').eq('type', 'generate-testcases').eq('status', 'completed').gte('created_at', since),
      supabase.from('tasks').select('project_id').eq('type', 'generate-automation').eq('status', 'completed').gte('created_at', since),
    ]);

    const a1 = new Set((r1.data || []).map(r => r.project_id));
    const a2 = new Set((r2.data || []).map(r => r.project_id));
    const a3 = new Set((r3.data || []).map(r => r.project_id));

    const n1 = a1.size;
    const n2 = [...a1].filter(id => a2.has(id)).length;
    const n3 = [...a1].filter(id => a2.has(id) && a3.has(id)).length;

    return {
      window_days: windowDays,
      steps: [
        { agent: 'extract-flows',       label: 'Agent 1 – Extract Flows',   count: n1, rate: 100 },
        { agent: 'generate-testcases',  label: 'Agent 2 – Generate Tests',  count: n2, rate: n1 ? +(n2 / n1 * 100).toFixed(1) : 0 },
        { agent: 'generate-automation', label: 'Agent 3 – Generate YAML',   count: n3, rate: n2 ? +(n3 / n2 * 100).toFixed(1) : 0 },
      ],
      overall_rate: n1 ? +(n3 / n1 * 100).toFixed(1) : 0,
    };
  }

  // ─── Usage & Audit ───────────────────────────────────────────────────────

  async getRecentUsage({ limit = 100, offset = 0 } = {}) {
    const { data, error, count } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact' })
      .order('executed_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return { rows: (data || []).map(UsageLog._map), count: count || 0 };
  }

  async getAuditLog({ limit = 100, offset = 0 } = {}) {
    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return { rows: data || [], count: count || 0 };
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  async _getProfile(userId) {
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', userId)
      .single();
    return {
      email: authData?.user?.email || null,
      full_name: profile?.full_name || null,
    };
  }

  async _writeAudit(adminId, action, targetType, targetId, payload) {
    await supabase.from('audit_logs').insert([{
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      payload,
    }]);
  }

  async _getLiveStats(window, pagination) {
    const since = windowToSince(window);
    const failuresPagination = pagination.failures || clampPagination();
    const tracesPagination = pagination.traces || clampPagination();
    const usageResult = await supabase
      .from('usage_logs')
      .select('user_id, project_id, task_id, agent_type, status, token_input, token_output, token_total, credits_charged, executed_at')
      .gte('executed_at', since);

    if (usageResult.error) throw usageResult.error;

    const usageRows = usageResult.data || [];
    const usageByTask = latestUsageByTask(usageRows);
    const taskIds = Object.keys(usageByTask);
    let taskRows = [];

    if (taskIds.length > 0) {
      const taskResult = await supabase
        .from('tasks')
        .select('id, project_id, type, status, error, updated_at, created_at, observability, source_run_id')
        .in('id', taskIds)
        .in('status', ['completed', 'failed'])
        .limit(200);

      if (taskResult.error) throw taskResult.error;
      taskRows = taskResult.data || [];
    }

    taskRows.sort((a, b) => {
      const aUsage = usageByTask[a.id]?.executed_at || taskTimestamp(a);
      const bUsage = usageByTask[b.id]?.executed_at || taskTimestamp(b);
      return new Date(bUsage) - new Date(aUsage);
    });

    const failedTaskRows = taskRows.filter((task) => task.status === 'failed');
    const agentKeys = ['agent_1', 'agent_2', 'agent_3'];

    const runsByAgent = agentKeys.reduce((acc, agentType) => {
      acc[agentType] = {
        agentType,
        label: AGENT_LABELS[agentType],
        total: 0,
        success: 0,
        failed: 0,
        failureRate: 0,
        successRate: 0,
      };
      return acc;
    }, {});

    const tokens = { input: 0, output: 0, total: 0 };
    const activeProjects = new Set();
    const activeUsers = new Set();
    let credits = 0;

    for (const row of usageRows) {
      if (!runsByAgent[row.agent_type]) {
        runsByAgent[row.agent_type] = {
          agentType: row.agent_type,
          label: AGENT_LABELS[row.agent_type] || row.agent_type,
          total: 0,
          success: 0,
          failed: 0,
          failureRate: 0,
          successRate: 0,
        };
      }

      runsByAgent[row.agent_type].total += 1;
      if (row.status === 'completed') runsByAgent[row.agent_type].success += 1;
      if (row.status === 'failed') runsByAgent[row.agent_type].failed += 1;

      tokens.input += row.token_input || 0;
      tokens.output += row.token_output || 0;
      tokens.total += row.token_total || 0;
      credits += row.credits_charged || 0;
      if (row.project_id) activeProjects.add(row.project_id);
      if (row.user_id) activeUsers.add(row.user_id);
    }

    Object.values(runsByAgent).forEach((agent) => {
      agent.failureRate = pct(agent.failed, agent.total);
      agent.successRate = pct(agent.success, agent.total);
    });

    const latencyBuckets = agentKeys.reduce((acc, agentType) => {
      acc[agentType] = [];
      return acc;
    }, {});

    for (const task of taskRows) {
      const latency = toNumber(getObservability(task).latency_ms);
      const normalizedAgent = taskTypeToAgentType(task.type);

      if (latency === null) continue;
      if (!latencyBuckets[normalizedAgent]) latencyBuckets[normalizedAgent] = [];
      latencyBuckets[normalizedAgent].push(latency);
    }

    const latencyByAgent = Object.entries(latencyBuckets).reduce((acc, [agentType, values]) => {
      acc[agentType] = {
        agentType,
        label: AGENT_LABELS[agentType] || agentType,
        avg: avg(values),
        p95: percentile(values, 95),
        max: values.length ? Math.max(...values) : null,
        sampleCount: values.length,
      };
      return acc;
    }, {});

    const allRecentFailures = failedTaskRows.map((task) => {
      const observability = getObservability(task);
      return {
        taskId: task.id,
        projectId: task.project_id,
        type: task.type,
        label: AGENT_LABELS[task.type] || task.type,
        status: task.status,
        error: task.error || observability.error || null,
        failedAt: observability.failed_at || usageByTask[task.id]?.executed_at || task.updated_at || task.created_at,
        latencyMs: toNumber(observability.latency_ms),
        model: observability.model || null,
        traceUrl: observability.trace_url || null,
        sourceRunId: task.source_run_id || observability.source_run_id || null,
      };
    });

    const allRecentTraces = taskRows
      .filter((task) => getObservability(task).trace_url)
      .map((task) => {
        const observability = getObservability(task);
        return {
          taskId: task.id,
          projectId: task.project_id,
          type: task.type,
          label: AGENT_LABELS[task.type] || task.type,
          status: task.status,
          completedAt: task.status === 'completed'
            ? observability.completed_at || usageByTask[task.id]?.executed_at || taskTimestamp(task)
            : null,
          failedAt: task.status === 'failed'
            ? observability.failed_at || usageByTask[task.id]?.executed_at || taskTimestamp(task)
            : null,
          latencyMs: toNumber(observability.latency_ms),
          model: observability.model || null,
          traceUrl: observability.trace_url || null,
        };
      });

    const recentFailures = {
      rows: allRecentFailures.slice(
        failuresPagination.offset,
        failuresPagination.offset + failuresPagination.limit,
      ),
      count: allRecentFailures.length,
      limit: failuresPagination.limit,
      offset: failuresPagination.offset,
    };

    const recentTraces = {
      rows: allRecentTraces.slice(
        tracesPagination.offset,
        tracesPagination.offset + tracesPagination.limit,
      ),
      count: allRecentTraces.length,
      limit: tracesPagination.limit,
      offset: tracesPagination.offset,
    };

    return {
      live: {
        window,
        updatedAt: new Date().toISOString(),
        runsByAgent,
        latencyByAgent,
        tokens,
        credits,
        activeProjects: activeProjects.size,
        activeUsers: activeUsers.size,
      },
      recentFailures,
      recentTraces,
    };
  }
}

module.exports = new AdminService();
