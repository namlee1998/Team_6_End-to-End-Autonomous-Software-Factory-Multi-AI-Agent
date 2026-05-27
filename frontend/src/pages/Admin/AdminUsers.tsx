import React, { useCallback, useEffect, useState } from 'react';
import {
  listAdminUsers,
  getAdminUserDetail,
  changeUserPlan,
  suspendUser,
  unsuspendUser,
  resetUserCredits,
  type AdminUserRow,
  type AdminUserDetail,
} from '@/services/adminApi';
import { PaginationBar } from './PaginationBar';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  quota_exceeded: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-500',
};

const PLANS = ['free', 'pro'];
const USER_LIMIT = 20;
const USAGE_LIMIT = 10;

function ExpandedRow({
  userId,
  onRefresh,
}: {
  userId: string;
  onRefresh: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [usageOffset, setUsageOffset] = useState(0);

  const load = useCallback(async () => {
    const result = await getAdminUserDetail(userId, { usageLimit: USAGE_LIMIT, usageOffset });
    if (result.recentUsage.rows.length === 0 && result.recentUsage.count > 0 && usageOffset > 0) {
      setUsageOffset((o) => Math.max(0, o - USAGE_LIMIT));
      return;
    }
    setDetail(result);
  }, [userId, usageOffset]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await load(); onRefresh(); } finally { setBusy(false); }
  };

  if (!detail) {
    return (
      <tr>
        <td colSpan={5} className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <p className="text-xs text-slate-400">Loading...</p>
        </td>
      </tr>
    );
  }

  const sub = detail.subscription;
  const isSuspended = sub.status === 'suspended';
  const creditPct = sub.creditsTotal > 0 ? Math.round((sub.creditsUsed / sub.creditsTotal) * 100) : 0;

  return (
    <tr>
      <td colSpan={5} className="bg-slate-50 border-b border-slate-200 px-6 py-4">
        <div className="flex gap-6 flex-wrap">

          {/* Subscription info */}
          <div className="min-w-[180px] space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Subscription</p>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-500">Plan</span>
              <span className="font-medium capitalize text-slate-700">{sub.planId}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-500">Status</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[sub.status] || ''}`}>
                {sub.status}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Credits</span>
                <span className="font-medium text-slate-700">{sub.creditsUsed} / {sub.creditsTotal}</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${creditPct >= 90 ? 'bg-red-500' : creditPct >= 70 ? 'bg-amber-400' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(creditPct, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-slate-200 self-stretch hidden sm:block" />

          {/* Actions */}
          <div className="min-w-[200px] space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</p>
            <div className="flex gap-1.5">
              {PLANS.map((p) => (
                <button
                  key={p}
                  disabled={busy || sub.planId === p}
                  onClick={() => act(() => changeUserPlan(detail.userId, p))}
                  className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors
                    ${sub.planId === p
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 text-slate-600 hover:bg-white'
                    } disabled:opacity-50`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <button
              disabled={busy}
              onClick={() => act(() => resetUserCredits(detail.userId))}
              className="block w-full text-left px-3 py-1 rounded-md text-xs font-medium border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-50 transition-colors"
            >
              Reset credits
            </button>
            {isSuspended ? (
              <button
                disabled={busy}
                onClick={() => act(() => unsuspendUser(detail.userId))}
                className="block w-full text-left px-3 py-1 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Unsuspend
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => act(() => suspendUser(detail.userId))}
                className="block w-full text-left px-3 py-1 rounded-md text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                Suspend
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="w-px bg-slate-200 self-stretch hidden sm:block" />

          {/* Recent usage */}
          <div className="flex-1 min-w-[240px] space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recent Usage</p>
            {detail.recentUsage.rows.length === 0 ? (
              <p className="text-xs text-slate-400">No usage yet.</p>
            ) : (
              <div className="space-y-1">
                {detail.recentUsage.rows.map((u) => (
                  <div key={u.id} className="grid grid-cols-4 text-xs text-slate-600 py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-500">{u.agentType}</span>
                    <span className={u.status === 'completed' ? 'text-green-600' : 'text-red-500'}>{u.status}</span>
                    <span>{u.creditsCharged} cr</span>
                    <span className="text-slate-400 text-right">{new Date(u.executedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
            {detail.recentUsage.count > detail.recentUsage.limit && (
              <PaginationBar
                className="mt-2"
                count={detail.recentUsage.count}
                limit={detail.recentUsage.limit}
                offset={detail.recentUsage.offset}
                onPrev={() => setUsageOffset((o) => Math.max(0, o - USAGE_LIMIT))}
                onNext={() => setUsageOffset((o) => o + USAGE_LIMIT)}
              />
            )}
          </div>

        </div>
      </td>
    </tr>
  );
}

export function AdminUsers() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const limit = USER_LIMIT;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAdminUsers({
        limit,
        offset,
        plan_id: planFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setRows(result.rows);
      setCount(result.count);
    } finally {
      setLoading(false);
    }
  }, [offset, planFilter, statusFilter, search, limit]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (userId: string) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">
          Users <span className="text-slate-400 font-normal text-sm">({count})</span>
        </h2>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search email or name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setOffset(0); }}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="quota_exceeded">Quota exceeded</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 w-6"></th>
              <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">User</th>
              <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Plan</th>
              <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Credits</th>
              <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center text-slate-400 text-xs py-8">Loading...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-400 text-xs py-8">No users found.</td></tr>
            )}
            {rows.map((r) => (
              <React.Fragment key={r.userId}>
                <tr
                  onClick={() => toggleExpand(r.userId)}
                  className={`border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${
                    expandedUserId === r.userId ? 'bg-slate-50 border-slate-200' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    <span className={`inline-block transition-transform duration-150 ${expandedUserId === r.userId ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.email || '—'}</p>
                    {r.fullName && <p className="text-xs text-slate-400">{r.fullName}</p>}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">{r.planId}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || ''}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.creditsUsed}/{r.creditsTotal}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
                {expandedUserId === r.userId && (
                  <ExpandedRow userId={r.userId} onRefresh={load} />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationBar
        count={count}
        limit={limit}
        offset={offset}
        onPrev={() => setOffset((o) => Math.max(0, o - limit))}
        onNext={() => setOffset((o) => o + limit)}
      />
    </div>
  );
}
