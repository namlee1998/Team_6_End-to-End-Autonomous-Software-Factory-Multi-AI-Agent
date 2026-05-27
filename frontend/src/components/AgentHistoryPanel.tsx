import React from 'react';

export interface HistoryEntry {
  taskId: string;
  createdAt: string;
  outputCount: number;
  outputUnit: string;  // "flows", "scenarios", "scripts"
  sourceTaskId?: string;
  failed?: boolean;
  feedbackPrompt?: string;
  traceUrl?: string | null;
  latencyMs?: number | null;
}

interface AgentHistoryPanelProps {
  entries: HistoryEntry[];
  activeTaskId: string | null;
  loading?: boolean;
  onSelect: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  emptyText?: string;
}

export const AgentHistoryPanel: React.FC<AgentHistoryPanelProps> = ({
  entries,
  activeTaskId,
  loading,
  onSelect,
  onDelete,
  emptyText = 'Chưa có lần chạy nào',
}) => {
  if (loading) {
    return (
      <div className="p-3 space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-12 bg-surface-container-highest rounded-lg animate-pulse"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-4 py-6 text-center opacity-40">
        <span className="material-symbols-outlined text-2xl text-on-surface-variant mb-1 block">history</span>
        <p className="text-[11px] text-on-surface-variant">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {entries.map((entry) => {
        const isActive = entry.taskId === activeTaskId;
        const date = new Date(entry.createdAt);
        const dateLabel = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        const timeLabel = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

        return (
          <div
            key={entry.taskId}
            className={`group relative rounded-lg px-3 py-2 transition-all cursor-pointer ${
              isActive
                ? 'bg-primary/10 border border-primary/30'
                : 'hover:bg-surface-container-highest border border-transparent'
            }`}
            role="button"
            tabIndex={0}
            aria-label={`Chọn lần chạy ngày ${dateLabel} lúc ${timeLabel}${entry.failed ? ', thất bại' : `, ${entry.outputCount} ${entry.outputUnit}`}${entry.feedbackPrompt ? `, prompt: ${entry.feedbackPrompt}` : ''}`}
            aria-pressed={isActive}
            onClick={() => onSelect(entry.taskId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(entry.taskId);
              }
            }}
          >
            <div className="flex items-center gap-2 pr-6">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  entry.failed ? 'bg-error' : isActive ? 'bg-primary' : 'bg-outline-variant/50'
                }`}
              />
              <span className={`text-[11px] flex-1 font-mono truncate ${isActive ? 'text-primary font-semibold' : 'text-on-surface'}`}>
                {dateLabel} {timeLabel}
              </span>
              {isActive && (
                <span className="text-[9px] uppercase tracking-widest text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                  Active
                </span>
              )}
            </div>
            <div className="pl-3.5 mt-0.5">
              <div className="flex items-center gap-2">
                {entry.failed ? (
                  <span className="text-[10px] text-error font-medium">Failed</span>
                ) : (
                  <span className={`text-[10px] font-bold ${isActive ? 'text-primary/80' : 'text-on-surface-variant'}`}>
                    {entry.outputCount} {entry.outputUnit}
                  </span>
                )}
                {typeof entry.latencyMs === 'number' && (
                  <span className="text-[10px] text-on-surface-variant/60">
                    {(entry.latencyMs / 1000).toFixed(1)}s
                  </span>
                )}
                {entry.traceUrl && (
                  <a
                    href={entry.traceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Mở Langfuse trace"
                    aria-label="Mở Langfuse trace"
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-on-surface-variant hover:bg-primary/10 hover:text-primary"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </a>
                )}
              </div>
              {entry.feedbackPrompt && (
                <p className="text-[10px] italic text-on-surface-variant/60 truncate mt-0.5" title={entry.feedbackPrompt}>
                  💬 {entry.feedbackPrompt}
                </p>
              )}
            </div>

            {/* Delete button — visible on hover, outside the clickable row flow */}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(entry.taskId);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-error/10 text-on-surface-variant hover:text-error"
                title="Xoá lần chạy này"
                tabIndex={-1}
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
