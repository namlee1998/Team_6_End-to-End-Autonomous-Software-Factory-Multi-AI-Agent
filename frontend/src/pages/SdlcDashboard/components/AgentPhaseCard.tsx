import { motion } from 'framer-motion';
import type { PhaseStatus } from '@/store/useSdlcStore';

interface PhaseConfig {
  key: string;
  label: string;
  icon: string;
  gate: string;
  color: string;
}

interface Props {
  phase: PhaseConfig;
  phaseData: PhaseStatus | null;
  isUnlocked: boolean;
  isActive: boolean;
  sseLogs: string[];
  onRun: () => void;
  onOpenGate: () => void;
  onViewArtifacts: () => void;
}

function statusBadge(status: string | null) {
  if (!status) return <span className="badge badge-idle">Idle</span>;
  const map: Record<string, string> = {
    pending: 'badge-pending', processing: 'badge-running',
    completed: 'badge-done', failed: 'badge-error',
  };
  return <span className={`badge ${map[status] || 'badge-idle'}`}>{status}</span>;
}

export default function AgentPhaseCard({ phase, phaseData, isUnlocked, isActive, sseLogs, onRun, onOpenGate, onViewArtifacts }: Props) {
  const decision = phaseData?.hitlDecision?.decision;
  const isCompleted = phaseData?.status === 'completed';
  const isApproved = decision === 'APPROVE';
  const isRejected = decision === 'REJECT' || decision === 'REQUEST_CHANGES';
  const canRun = isUnlocked && !isActive;
  const canGate = isCompleted && !isApproved;

  return (
    <motion.div
      className={`phase-card ${isActive ? 'phase-card--active' : ''} ${isApproved ? 'phase-card--approved' : ''} ${isRejected ? 'phase-card--rejected' : ''} ${!isUnlocked ? 'phase-card--locked' : ''}`}
      style={{ '--phase-color': phase.color } as React.CSSProperties}
      whileHover={isUnlocked ? { y: -2 } : {}}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      {/* Header */}
      <div className="phase-card__header">
        <div className="phase-card__icon">{!isUnlocked ? '🔒' : phase.icon}</div>
        <div>
          <div className="phase-card__label">{phase.label}</div>
          <div className="phase-card__gate">
            <span style={{color: '#a5b4fc', fontWeight: 'bold'}}>{phase.key === 'intent' || phase.key === 'po' ? 'G1' : phase.key === 'ux' ? 'G2' : phase.key === 'dev' ? 'G3' : 'G4'}</span> 
            {phase.gate.replace('_', ' ')}
          </div>
        </div>
        <div className="phase-card__status">
          {statusBadge(phaseData?.status || null)}
          {isApproved && <span className="badge badge-approved">✓ Approved</span>}
          {isRejected && <span className="badge badge-rejected">↩ Rework</span>}
        </div>
      </div>

      {/* SSE Log stream */}
      {isActive && sseLogs.length > 0 && (
        <div className="phase-card__log">
          <div className="phase-card__log-inner">
            {sseLogs.slice(-5).map((log, i) => (
              <div key={i} className="phase-card__log-line">
                {typeof log === 'string' && log.length > 0 ? log : '...'}
              </div>
            ))}
            <div className="phase-card__log-cursor" />
          </div>
        </div>
      )}

      {/* Running pulse indicator */}
      {isActive && (
        <div className="phase-card__running">
          <motion.div className="phase-card__pulse"
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
          <span>Agent running…</span>
        </div>
      )}

      {/* HITL decision indicator */}
      {phaseData?.hitlDecision && (
        <div className="phase-card__decision">
          <span>{decision === 'APPROVE' ? '✅' : decision === 'REJECT' ? '❌' : '🔄'}</span>
          <span>{decision}</span>
          {phaseData.hitlDecision.comment && (
            <span className="phase-card__comment">"{phaseData.hitlDecision.comment}"</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="phase-card__actions">
        {canRun && !isCompleted && (
          <button className="phase-card__btn phase-card__btn--run" onClick={onRun}>
            ▶ Run {phase.label}
          </button>
        )}
        {isCompleted && !isApproved && (
          <button className="phase-card__btn phase-card__btn--gate" onClick={onOpenGate}>
            🔍 Review & Gate
          </button>
        )}
        {isCompleted && (
          <button className="phase-card__btn phase-card__btn--view" onClick={onViewArtifacts}>
            📄 View Artifacts
          </button>
        )}
        {isApproved && !isActive && (
          <button className="phase-card__btn phase-card__btn--rerun" onClick={onRun} title="Run again">
            🔄 Re-run
          </button>
        )}
        {isRejected && !isActive && (
          <button className="phase-card__btn phase-card__btn--rerun" onClick={onRun} title="Apply fixes and re-run">
            ↺ Rework
          </button>
        )}
      </div>
    </motion.div>
  );
}
