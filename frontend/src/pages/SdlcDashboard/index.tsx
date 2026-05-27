import './sdlc.css';
import { useEffect, useState, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSdlcStore } from '@/store/useSdlcStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import { useAppStore } from '@/store/useAppStore';
import AgentPhaseCard from './components/AgentPhaseCard';
import HumanGatePanel from './components/HumanGatePanel';
import ArtifactViewer from './components/ArtifactViewer';
import AuditTimeline from './components/AuditTimeline';
import FeatureRequestForm from './components/FeatureRequestForm';


const PHASES = [
  { key: 'intent', label: 'Intent Agent', icon: '🧠', gate: 'REQUIREMENT_GATE', color: '#f59e0b' },
  { key: 'po',  label: 'PO Agent',  icon: '📋', gate: 'REQUIREMENT_GATE', color: '#6366f1' },
  { key: 'ux',  label: 'UX Agent',  icon: '🎨', gate: 'UX_GATE',          color: '#8b5cf6' },
  { key: 'dev', label: 'DEV Agent', icon: '⚙️',  gate: 'DEV_GATE',         color: '#3b82f6' },
  { key: 'qa',  label: 'QA Agent',  icon: '🧪', gate: 'QA_GATE',          color: '#10b981' },
] as const;

export default function SdlcDashboard() {
  const { currentProjectId } = useAppStore();
  const {
    projectId, workflowStatus, workflowLoading, activeTaskId, activePhase,
    sseLogs, sseActive, artifacts, selectedArtifact, auditEvents,
    setProjectId, setWorkflowStatus, setWorkflowLoading,
    setActiveTask, appendSseLog, setSseActive, setArtifacts,
    selectArtifact, setAuditEvents, setError,
  } = useSdlcStore();

  const [showForm, setShowForm]         = useState(false);
  const [gateTaskId, setGateTaskId]     = useState<string | null>(null);
  const [sseAbort, setSseAbort]         = useState<AbortController | null>(null);
  const [panel, setPanel]               = useState<'artifacts' | 'audit'>('artifacts');

  // Sync project
  useEffect(() => {
    if (currentProjectId && currentProjectId !== projectId) setProjectId(currentProjectId);
  }, [currentProjectId]);

  // Load workflow status on mount / projectId change
  const refreshStatus = useCallback(async () => {
    if (!projectId) return;
    setWorkflowLoading(true);
    try {
      const ws = await sdlcApi.getWorkflowStatus(projectId);
      setWorkflowStatus(ws);
    } catch (e) { setError('Failed to load workflow status'); }
    finally { setWorkflowLoading(false); }
  }, [projectId]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Load audit trail
  useEffect(() => {
    if (!projectId) return;
    sdlcApi.getAuditTrail(projectId).then((d) => setAuditEvents(d.events)).catch(() => {});
  }, [projectId, workflowStatus]);

  // SSE subscription
  const startSSE = useCallback((taskId: string, phase: typeof PHASES[number]['key']) => {
    sseAbort?.abort();
    setActiveTask(taskId, phase);
    const abort = sdlcApi.subscribeTaskSSE(taskId, {
      onProgress: (d) => appendSseLog((d.log as string) || (d.token as string) || ''),
      onCompleted: async () => {
        setSseActive(false);
        await refreshStatus();
        // Refresh artifacts
        const task = await sdlcApi.getSdlcTaskStatus(taskId);
        setArtifacts(task.artifacts || []);
      },
      onError: (d) => { setSseActive(false); setError((d.message as string) || 'Agent error'); },
    });
    setSseAbort(abort);
  }, [sseAbort, refreshStatus]);

  // Run handlers
  const handleRunIntent = async (fr: sdlcApi.FeatureRequest) => {
    if (!projectId) return;
    const res = await sdlcApi.runIntentAgent(projectId, fr);
    startSSE(res.task_id, 'intent');
    setShowForm(false);
  };

  const handleRunNext = async (phase: typeof PHASES[number]['key'], sourceTaskId: string, feedbackPrompt?: string) => {
    const runners: Record<string, (id: string, fp?: string) => Promise<{ task_id: string }>> = {
      po:  (id, fp) => sdlcApi.runPOAgent(projectId!, { title: 'Resume' }, { intent_task_id: id, feedback_prompt: fp }),
      ux:  (id, fp) => sdlcApi.runUXAgent(id, fp),
      dev: (id, fp) => sdlcApi.runDEVAgent(id, fp),
      qa:  (id, fp) => sdlcApi.runQAAgent(id, fp),
    };
    const runner = runners[phase];
    if (!runner) return;
    const res = await runner(sourceTaskId, feedbackPrompt);
    startSSE(res.task_id, phase);
  };

  const handleGateDecision = async (decision: sdlcApi.GateDecisionPayload['decision'], comment: string) => {
    if (!gateTaskId) return;
    await sdlcApi.submitGateDecision(gateTaskId, { decision, comment });
    setGateTaskId(null);
    await refreshStatus();
  };

  // Artifact viewer
  const handleViewArtifacts = async (taskId: string) => {
    const task = await sdlcApi.getSdlcTaskStatus(taskId);
    setArtifacts(task.artifacts || []);
    setPanel('artifacts');
  };

  const phases = workflowStatus?.phases;

  return (
    <div className="sdlc-dashboard">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="sdlc-header">
        <div>
          <h1 className="sdlc-title">🏭 AIDLC Control Platform</h1>
          <p className="sdlc-subtitle">End-to-End Autonomous Software Factory</p>
        </div>
        <div className="sdlc-header-actions">
          {workflowStatus?.currentPhase && (
            <span className="sdlc-phase-badge">{workflowStatus.currentPhase.replace(/_/g, ' ')}</span>
          )}
          <button className="sdlc-btn-primary" onClick={() => setShowForm(true)}>
            + New Feature Request
          </button>
        </div>
      </div>

      {/* ── Pipeline ────────────────────────────────────────────────── */}
      <div className="sdlc-pipeline">
        {PHASES.map((phase, idx) => {
          const phaseData = phases?.[phase.key] ?? null;
          const prevPhaseData = idx > 0 ? phases?.[PHASES[idx - 1].key] : null;
          const isUnlocked = idx === 0 || (prevPhaseData?.hitlDecision?.decision === 'APPROVE');
          
          // Connectors logic
          const showConnector = idx > 0;
          const isConnectorActive = isUnlocked;
          const isRework = phaseData?.hitlDecision?.decision === 'REQUEST_CHANGES' || phaseData?.hitlDecision?.decision === 'REJECT';

          return (
            <Fragment key={phase.key}>
              {showConnector && (
                <div className="sdlc-connector-wrapper">
                  <div className={`sdlc-connector ${isConnectorActive ? 'sdlc-connector--active' : ''}`} />
                  {isRework && (
                    <svg className="sdlc-connector-rework" preserveAspectRatio="none">
                       {/* This is handled purely by CSS dashed borders now */}
                    </svg>
                  )}
                </div>
              )}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                style={{ flex: 1, minWidth: 0 }}>
                <AgentPhaseCard
                phase={phase}
                phaseData={phaseData}
                isUnlocked={isUnlocked}
                isActive={activePhase === phase.key && sseActive}
                sseLogs={activePhase === phase.key ? sseLogs : []}
                onRun={idx === 0
                  ? () => setShowForm(true) // For Intent, we show form again? Actually if rework, we shouldn't show form but run intent with comment. But feature request form can have feedback. Let's just let them fill form.
                  : () => { if (prevPhaseData?.taskId) handleRunNext(phase.key, prevPhaseData.taskId, phaseData?.hitlDecision?.comment); }
                }
                onOpenGate={() => { if (phaseData?.taskId) setGateTaskId(phaseData.taskId); }}
                onViewArtifacts={() => { if (phaseData?.taskId) handleViewArtifacts(phaseData.taskId); }}
              />
              </motion.div>
            </Fragment>
          );
        })}
      </div>

      {/* ── Bottom panel ─────────────────────────────────────────────── */}
      <div className="sdlc-bottom">
        <div className="sdlc-panel-tabs">
          <button className={`sdlc-tab ${panel === 'artifacts' ? 'active' : ''}`} onClick={() => setPanel('artifacts')}>📄 Artifacts</button>
          <button className={`sdlc-tab ${panel === 'audit' ? 'active' : ''}`} onClick={() => setPanel('audit')}>📜 Audit Trail</button>
        </div>

        <AnimatePresence mode="wait">
          {panel === 'artifacts' ? (
            <motion.div key="artifacts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="sdlc-panel-content">
              <ArtifactViewer
                artifacts={artifacts}
                selected={selectedArtifact}
                onSelect={selectArtifact}
              />
            </motion.div>
          ) : (
            <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="sdlc-panel-content">
              <AuditTimeline events={auditEvents} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Feature Request Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div className="sdlc-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="sdlc-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <FeatureRequestForm onSubmit={handleRunIntent} onCancel={() => setShowForm(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Human Gate Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {gateTaskId && (
          <motion.div className="sdlc-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="sdlc-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <HumanGatePanel
                taskId={gateTaskId}
                onDecision={handleGateDecision}
                onClose={() => setGateTaskId(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
