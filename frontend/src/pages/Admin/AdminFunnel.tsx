import React, { useEffect, useState } from 'react';
import { getAdminFunnel, type FunnelData } from '@/services/adminApi';

const WINDOWS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

const BAR_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
];

function fmtRate(rate: number, prev: number | null): string {
  if (prev === null) return '';
  const drop = prev - rate;
  return drop > 0 ? `↓ −${drop.toFixed(1)}%` : '';
}

export function AdminFunnel() {
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAdminFunnel(windowDays)
      .then(setData)
      .catch(() => setError('Failed to load funnel data'))
      .finally(() => setLoading(false));
  }, [windowDays]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Pipeline Completion Funnel</h3>
          <p className="text-xs text-slate-400 mt-0.5">Projects that completed each agent stage</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {WINDOWS.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => setWindowDays(days)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                windowDays === days ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400 py-4">Loading...</p>}
      {error && <p className="text-sm text-red-500 py-4">{error}</p>}

      {!loading && !error && data && (
        <div className="space-y-4">
          {data.steps.map((step, i) => {
            const prevRate = i > 0 ? data.steps[i - 1].rate : null;
            const maxCount = data.steps[0].count || 1;
            return (
              <div key={step.agent}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-600">{step.label}</span>
                  <div className="flex items-center gap-3">
                    {prevRate !== null && (
                      <span className="text-xs text-slate-400">{fmtRate(step.rate, prevRate)}</span>
                    )}
                    <span className="text-xs font-semibold text-slate-700 w-10 text-right">
                      {step.rate}%
                    </span>
                    <span className="text-xs text-slate-400 w-14 text-right">
                      {step.count.toLocaleString()} proj
                    </span>
                  </div>
                </div>
                <div className="h-5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${BAR_COLORS[i]}`}
                    style={{ width: `${(step.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}

          <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
            <span className="text-xs text-slate-500">End-to-end completion rate</span>
            <span className={`text-sm font-bold ${
              data.overall_rate >= 50 ? 'text-green-600' :
              data.overall_rate >= 25 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {data.overall_rate}%
            </span>
          </div>
        </div>
      )}

      {!loading && !error && data && data.steps[0]?.count === 0 && (
        <p className="text-sm text-slate-400 py-4">No completed runs in this window.</p>
      )}
    </div>
  );
}
