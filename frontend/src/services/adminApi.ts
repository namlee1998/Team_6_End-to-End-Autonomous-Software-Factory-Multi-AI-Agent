import axios from 'axios';

const adminHttp = axios.create({ baseURL: '/api/v1/admin' });

adminHttp.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminHttp.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/admin';
    }
    return Promise.reject(err);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────

export async function adminLogin(email: string, password: string) {
  const { data } = await adminHttp.post('/auth/login', { email, password });
  return data as { token: string; admin: AdminProfile };
}

// ─── Stats ────────────────────────────────────────────────────────────────

export async function getAdminStats(window: AdminStatsWindow = '7d', params?: AdminStatsPaginationParams) {
  const { data } = await adminHttp.get('/stats', { params: { window, ...params } });
  return data as AdminStatsResponse;
}

// ─── Users ────────────────────────────────────────────────────────────────

export async function listAdminUsers(params: {
  limit?: number;
  offset?: number;
  plan_id?: string;
  status?: string;
  search?: string;
}) {
  const { data } = await adminHttp.get('/users', { params });
  return data as { rows: AdminUserRow[]; count: number };
}

export async function getAdminUserDetail(userId: string, params?: { usageLimit?: number; usageOffset?: number }) {
  const { data } = await adminHttp.get(`/users/${userId}`, { params });
  return data as AdminUserDetail;
}

export async function changeUserPlan(userId: string, plan_id: string) {
  await adminHttp.post(`/users/${userId}/plan`, { plan_id });
}

export async function suspendUser(userId: string, reason?: string) {
  await adminHttp.post(`/users/${userId}/suspend`, { reason });
}

export async function unsuspendUser(userId: string) {
  await adminHttp.post(`/users/${userId}/unsuspend`);
}

export async function resetUserCredits(userId: string) {
  await adminHttp.post(`/users/${userId}/reset-credits`);
}

// ─── Usage & Audit ────────────────────────────────────────────────────────

export async function getAdminUsage(params?: { limit?: number; offset?: number }) {
  const { data } = await adminHttp.get('/usage', { params });
  return data as { rows: UsageLogRow[]; count: number };
}

export async function getAuditLog(params?: { limit?: number; offset?: number }) {
  const { data } = await adminHttp.get('/audit', { params });
  return data as { rows: AuditLogRow[]; count: number };
}

export async function getAdminFunnel(windowDays: number = 30) {
  const { data } = await adminHttp.get('/analytics/funnel', { params: { window_days: windowDays } });
  return (data as { status: string; data: FunnelData }).data;
}


// ─── Types ────────────────────────────────────────────────────────────────

export interface AdminProfile {
  id: string;
  email: string;
  fullName: string | null;
}

export interface SnapshotData {
  total_users: number;
  active_users: number;
  quota_exceeded_users: number;
  suspended_users: number;
  users_by_plan: Record<string, number>;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  total_credits: number;
  runs_by_agent: Record<string, number>;
}

export interface DashboardSnapshot {
  id: string;
  snapshot_at: string;
  time_window: string;
  data: SnapshotData;
}

export type AdminStatsWindow = '1d' | '7d' | '30d';

export interface AdminStatsPaginationParams {
  failuresLimit?: number;
  failuresOffset?: number;
  tracesLimit?: number;
  tracesOffset?: number;
}

export interface AgentRunStats {
  agentType: string;
  label: string;
  total: number;
  success: number;
  failed: number;
  failureRate: number;
  successRate: number;
}

export interface AgentLatencyStats {
  agentType: string;
  label: string;
  avg: number | null;
  p95: number | null;
  max: number | null;
  sampleCount: number;
}

export interface LiveAdminStats {
  window: AdminStatsWindow;
  updatedAt: string;
  runsByAgent: Record<string, AgentRunStats>;
  latencyByAgent: Record<string, AgentLatencyStats>;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  credits: number;
  activeProjects: number;
  activeUsers: number;
}

export interface RecentFailureRow {
  taskId: string;
  projectId: string | null;
  type: string;
  label: string;
  status: string;
  error: string | null;
  failedAt: string;
  latencyMs: number | null;
  model: string | null;
  traceUrl: string | null;
  sourceRunId: string | null;
}

export interface RecentTraceRow {
  taskId: string;
  projectId: string | null;
  type: string;
  label: string;
  status: string;
  completedAt: string | null;
  failedAt: string | null;
  latencyMs: number | null;
  model: string | null;
  traceUrl: string | null;
}

export interface PaginatedResponse<T> {
  rows: T[];
  count: number;
  limit: number;
  offset: number;
}

export type AdminStatsResponse = Record<string, DashboardSnapshot | unknown> & {
  '1d'?: DashboardSnapshot;
  '7d'?: DashboardSnapshot;
  '30d'?: DashboardSnapshot;
  live: LiveAdminStats;
  recentFailures: PaginatedResponse<RecentFailureRow>;
  recentTraces: PaginatedResponse<RecentTraceRow>;
  selectedWindow: AdminStatsWindow;
};

export interface AdminUserRow {
  userId: string;
  email: string | null;
  fullName: string | null;
  planId: string;
  status: string;
  creditsUsed: number;
  creditsTotal: number;
  creditsRemaining: number;
  periodStart: string;
  periodEnd: string | null;
  createdAt: string;
}

export interface AdminUserDetail {
  userId: string;
  email: string | null;
  fullName: string | null;
  subscription: {
    planId: string;
    status: string;
    creditsUsed: number;
    creditsTotal: number;
    creditsRemaining: number;
    periodStart: string;
    periodEnd: string | null;
  };
  recentUsage: PaginatedResponse<UsageLogRow>;
}

export interface UsageLogRow {
  id: string;
  userId: string;
  projectId: string | null;
  taskId: string | null;
  agentType: string;
  status: string;
  tokenInput: number;
  tokenOutput: number;
  tokenTotal: number;
  creditsCharged: number;
  executedAt: string;
}

export interface FunnelStep {
  agent: string;
  label: string;
  count: number;
  rate: number;
}

export interface FunnelData {
  window_days: number;
  steps: FunnelStep[];
  overall_rate: number;
}


export interface AuditLogRow {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}
