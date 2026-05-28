import type { AuditEvent } from '@/store/useSdlcStore';

const EVENT_ICONS: Record<string, string> = {
  agent_run: '▶️', agent_complete: '✅', hitl_decision: '👤',
};

const DECISION_COLORS: Record<string, string> = {
  APPROVE: '#10b981', REJECT: '#ef4444', REQUEST_CHANGES: '#f59e0b',
};

interface Props { events: AuditEvent[]; }

export default function AuditTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="audit-empty">
        <div className="audit-empty__icon">📜</div>
        <p>No events yet. Run an agent to start building the audit trail.</p>
      </div>
    );
  }

  return (
    <div className="audit-timeline">
      {events.map((ev, i) => (
        <div key={i} className={`audit-event audit-event--${ev.type}`}>
          <div className="audit-event__line" />
          <div className="audit-event__dot"
            style={ev.decision ? { background: DECISION_COLORS[ev.decision] || '#6b7280' } : undefined}>
            {EVENT_ICONS[ev.type] || '•'}
          </div>
          <div className="audit-event__body">
            <div className="audit-event__header">
              <span className="audit-event__actor">{ev.actor}</span>
              <span className="audit-event__action">{ev.action.replace(/_/g, ' ')}</span>
              <span className="audit-event__time">
                {new Date(ev.timestamp).toLocaleString()}
              </span>
            </div>
            {ev.comment && (
              <div className="audit-event__comment">💬 "{ev.comment}"</div>
            )}
            {ev.taskId && (
              <div className="audit-event__meta">Task: {ev.taskId.slice(0, 8)}…</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
