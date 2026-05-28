import './sdlc.css';
import { useEffect, useState, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSdlcStore } from '@/store/useSdlcStore';
import * as sdlcApi from '@/services/api/sdlcApi';
import { useAppStore } from '@/store/useAppStore';
import AgentPhaseCard from './components/AgentPhaseCard';
import StageInspector from './components/StageInspector';
import HumanGatePanel from './components/HumanGatePanel';
import ArtifactViewer from './components/ArtifactViewer';
import AuditTimeline from './components/AuditTimeline';
import FeatureRequestForm from './components/FeatureRequestForm';
import EmptyProjectState from './components/EmptyProjectState';


const PHASES = [
  { key: 'intent', label: 'Intent Agent', icon: '🧠', gate: 'REQUIREMENT_GATE', color: '#f59e0b' },
  { key: 'po',  label: 'PO Agent',  icon: '📋', gate: 'REQUIREMENT_GATE', color: '#6366f1' },
  { key: 'ux',  label: 'UX Agent',  icon: '🎨', gate: 'UX_GATE',          color: '#8b5cf6' },
  { key: 'dev', label: 'DEV Agent', icon: '⚙️',  gate: 'DEV_GATE',         color: '#3b82f6' },
  { key: 'qa',  label: 'QA Agent',  icon: '🧪', gate: 'QA_GATE',          color: '#10b981' },
] as const;

export default function SdlcDashboard() {
  const { currentProjectId, treeLoaded, fetchTree } = useAppStore();
  const {
    projectId, workflowStatus, workflowLoading, activeTaskId, activePhase,
    sseLogs, sseActive, artifacts, selectedArtifact, auditEvents,
    setProjectId, setWorkflowStatus, setWorkflowLoading,
    setActiveTask, appendSseLog, setSseActive, setArtifacts,
    selectArtifact, setAuditEvents, setError,
    isFeatureRequestFormOpen, setFeatureRequestFormOpen,
  } = useSdlcStore();

  const [gateTaskId, setGateTaskId]     = useState<string | null>(null);
  const [sseAbort, setSseAbort]         = useState<AbortController | null>(null);
  const [panel, setPanel]               = useState<'artifacts' | 'audit'>('artifacts');

  useEffect(() => {
    if (currentProjectId && currentProjectId !== projectId) setProjectId(currentProjectId);
  }, [currentProjectId]);

  // Load project if visited directly
  useEffect(() => {
    if (!treeLoaded) void fetchTree();
  }, [treeLoaded, fetchTree]);

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
    setFeatureRequestFormOpen(false);
    if (!projectId) return;
    const res = await sdlcApi.runIntentAgent(projectId, fr);
    startSSE(res.task_id, 'intent');
  };

  const handleRunNext = async (phase: typeof PHASES[number]['key'], sourceTaskId: string, feedbackPrompt?: string) => {
    const runners: Record<string, (id: string, fp?: string) => Promise<{ task_id: string }>> = {
      po:  (id, fp) => sdlcApi.runPOAgent(projectId!, id, fp),
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

  return (
    <div className="sdlc-dashboard">
      {!projectId ? (
        <EmptyProjectState />
      ) : (
        <>
          {/* ── Architecture Pipeline (Stage Inspector) ────────────────── */}
          <div className="sdlc-pipeline" style={{ paddingTop: '10px' }}>
            <StageInspector
              onRunIntent={() => setFeatureRequestFormOpen(true)}
              onRunNext={handleRunNext as any}
              onOpenGate={(taskId) => setGateTaskId(taskId)}
              onViewArtifacts={handleViewArtifacts}
              sseLogs={sseLogs}
              activePhase={activePhase}
              sseActive={sseActive}
            />
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
        </>
      )}

      {/* ── Feature Request Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {isFeatureRequestFormOpen && projectId && (
          <motion.div className="sdlc-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="sdlc-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <FeatureRequestForm onSubmit={handleRunIntent} onCancel={() => setFeatureRequestFormOpen(false)} />
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
