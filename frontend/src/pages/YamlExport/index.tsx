import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useApiActions } from '@/hooks/useApiActions';
import type { TestcaseItem, VersionStatus } from '@/services/api';
import { AgentHistoryPanel, type HistoryEntry } from '@/components/AgentHistoryPanel';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ResizablePanels } from '@/components/ui/ResizablePanels';
import { useAppStore } from '@/store';
import { useQuotaStore } from '@/store/useQuotaStore';
import { usePipelineStore } from '@/store/usePipelineStore';
import { scenarioTestcasesFromArtifacts, yamlTestcasesFromArtifacts } from '@/lib/artifactHelpers';

// =============================================================================
// Types
// =============================================================================

interface ScenarioData {
  id: string;
  name: string;
  type: string;
  priority: string;
  flow_name?: string;
  feature_name?: string;
}

interface ScenarioWithYaml {
  tc: TestcaseItem;
  sd: ScenarioData;
  yaml: TestcaseItem | null;
}

interface FlowGroup {
  flowName: string;
  scenarios: ScenarioWithYaml[];
}

interface FeatureGroup {
  featureName: string;
  flows: FlowGroup[];
  totalYaml: number;
}


// =============================================================================
// Constants
// =============================================================================

const FRAMEWORKS = [
  { value: 'Mobile Auto Platform', label: 'Mobile Auto Platform' },
  { value: 'appium', label: 'Appium' },
  { value: 'playwright', label: 'Playwright' },
  { value: 'detox', label: 'Detox' },
];

const TYPE_COLOR: Record<string, string> = {
  happy: 'text-green-500',
  functional: 'text-green-500',
  negative: 'text-red-400',
  error: 'text-red-400',
  edge: 'text-yellow-400',
  boundary: 'text-yellow-400',
};

// =============================================================================
// Helpers
// =============================================================================

function getScenarioData(tc: TestcaseItem): ScenarioData {
  const d = (tc.scenarioData ?? {}) as Record<string, unknown>;
  return {
    id: String(d.id ?? tc.id),
    name: String(d.name ?? tc.flowName ?? ''),
    type: String(d.type ?? ''),
    priority: String(d.priority ?? ''),
    flow_name: String(d.flow_name ?? tc.flowName ?? ''),
    feature_name: String(d.feature_name ?? tc.featureName ?? ''),
  };
}

function buildGroupedTree(agent2Testcases: TestcaseItem[], yamlFiles: TestcaseItem[]): FeatureGroup[] {
  const yamlMap = new Map<string, TestcaseItem>();
  for (const y of yamlFiles) {
    if (y.yamlFilename) {
      yamlMap.set(y.yamlFilename.replace(/\.yaml$/i, ''), y);
      yamlMap.set(y.yamlFilename, y);
    }
  }

  const featureMap = new Map<string, Map<string, ScenarioWithYaml[]>>();

  for (const tc of agent2Testcases) {
    const sd = getScenarioData(tc);
    const feat = sd.feature_name || tc.featureName || 'Unknown Feature';
    const flow = sd.flow_name || tc.flowName || 'Unknown Flow';
    const yaml = yamlMap.get(sd.id) ?? yamlMap.get(`${sd.id}.yaml`) ?? null;

    if (!featureMap.has(feat)) featureMap.set(feat, new Map());
    const flowMap = featureMap.get(feat)!;
    if (!flowMap.has(flow)) flowMap.set(flow, []);
    flowMap.get(flow)!.push({ tc, sd, yaml });
  }

  return Array.from(featureMap.entries()).map(([featureName, flowMap]) => {
    const flows: FlowGroup[] = Array.from(flowMap.entries()).map(([flowName, scenarios]) => ({
      flowName,
      scenarios,
    }));
    const totalYaml = flows.reduce((s, f) => s + f.scenarios.filter((x) => x.yaml).length, 0);
    return { featureName, flows, totalYaml };
  });
}

function formatSize(content: string): string {
  const bytes = new Blob([content]).size;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function getFilename(tc: TestcaseItem): string {
  return tc.yamlFilename || `${tc.featureName}.yaml`;
}

function YamlLine({ line }: { line: string }) {
  if (line.trim().startsWith('#')) {
    return <div className="whitespace-pre text-[#6A9955]">{line || '\u00A0'}</div>;
  }
  const match = line.match(/^(\s*)([\w.-]+)(:)(\s*)(.*)/);
  if (match) {
    const [, indent, key, colon, space, value] = match;
    return (
      <div className="whitespace-pre">
        <span>{indent}</span>
        <span className="text-primary">{key}</span>
        <span className="text-on-surface">{colon}</span>
        <span>{space}</span>
        <span className="text-tertiary">{value}</span>
      </div>
    );
  }
  if (line.trim().startsWith('-')) {
    return <div className="whitespace-pre text-secondary">{line || '\u00A0'}</div>;
  }
  return <div className="whitespace-pre text-on-surface-variant">{line || '\u00A0'}</div>;
}

// =============================================================================
// Main Component
// =============================================================================

export const YamlExport: React.FC = () => {
  const api = useApiActions();
  const {
    currentProjectId,
    projects,
    restoreAgent2Session,
    restoreAgent3Session,
    taskStatus,
    activeAgentType,
    agent2ActiveTaskId,
    agent3ActiveTaskId,
    setAgentActiveTask,
    notifyAgent3Completed,
  } = useAppStore();

  const [agent3TaskId, setAgent3TaskId] = useState<string | null>(null);
  const [agent2Testcases, setAgent2Testcases] = useState<TestcaseItem[]>([]);
  const [yamlFiles, setYamlFiles] = useState<TestcaseItem[]>([]);
  const [selected, setSelected] = useState<ScenarioWithYaml | null>(null);

  // Agent 3 history
  const [agent3History, setAgent3History] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);
  const currentProjectRole = projects.find((p) => p.project_id === currentProjectId)?.role;
  const quotaBlocked = useQuotaStore((s) => s.isBlocked);
  const canMutateProject = currentProjectRole !== 'viewer' && !quotaBlocked;

  // Stage Gate: version status of active Agent 2 and Agent 3 tasks
  const [agent2VersionStatus, setAgent2VersionStatus] = useState<VersionStatus | null>(null);
  const [agent3VersionStatus, setAgent3VersionStatus] = useState<VersionStatus | null>(null);
  const [isAgent3Stale, setIsAgent3Stale] = useState(false);
  const [committing, setCommitting] = useState(false);
  const pipelineStore = usePipelineStore();

  // Sync agent2VersionStatus from store when TestScenarios commits on another page
  const storedAgent2Version = usePipelineStore((s) =>
    agent2ActiveTaskId ? s.taskVersions[agent2ActiveTaskId] : undefined
  );
  useEffect(() => {
    if (storedAgent2Version) setAgent2VersionStatus(storedAgent2Version);
  }, [storedAgent2Version]);

  // Agent 2 must be committed before Agent 3 can run
  const agent2IsCommitted = agent2VersionStatus === 'committed' || agent2VersionStatus === null; // null = legacy row

  const [feedbackPrompt, setFeedbackPrompt] = useState('');
  const [framework, setFramework] = useState('Mobile Auto Platform');

  // Partial re-run: which scenario IDs to re-run
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [sseLogs, setSseLogs] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set());
  const [newYamlIds, setNewYamlIds] = useState<Set<string>>(new Set());
  // scenario-level progress during Agent 3 run: scenarioId → status
  const [scenarioStatus, setScenarioStatus] = useState<Map<string, 'pending' | 'loading' | 'done'>>(new Map());
  const scenariosRef = useRef<{ id: string; name: string }[]>([]); // stable ref for stale-closure access
  const sseCtrl = useRef<AbortController | null>(null);

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running || !startTime) { setElapsed(0); return; }
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [running, startTime]);

  // ── Load Agent 3 history ───────────────────────────────────────────────────
  const loadAgent3History = async () => {
    setHistoryLoading(true);
    try {
      const tasks = await api.listWorkflowTasks({
        type: 'generate-automation',
        status: 'completed',
        limit: 50,
        projectId: currentProjectId ?? undefined,
      });
      setAgent3History(tasks.map((t) => {
        const result = t.result as Record<string, unknown> | null;
        return {
          taskId: t.task_id,
          createdAt: t.created_at,
          outputCount: 0, // actual count loaded on select
          outputUnit: 'scripts',
          sourceTaskId: result?.sourceTaskId as string | undefined,
          feedbackPrompt: result?.feedback_prompt as string | undefined,
          traceUrl: t.observability?.trace_url ?? null,
          latencyMs: t.observability?.latency_ms ?? null,
        };
      }));
      return tasks;
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSelectHistory = async (taskId: string) => {
    try {
      const task = await api.getTaskStatus(taskId);
      if (task?.status !== 'completed') return;

      const artifactFiles = yamlTestcasesFromArtifacts(task.artifacts);
      const files = artifactFiles.length
        ? artifactFiles
        : (task.testcases ?? []).filter((tc) => !!tc.automationYaml);
      setYamlFiles(files);
      setAgent3TaskId(taskId);
      setAgent3VersionStatus((task.version_status as VersionStatus) ?? 'committed');
      restoreAgent3Session(taskId, currentProjectId ?? '');
      await api.saveSessionState('yaml_export', {
        selectedDocIds: [],
        taskId,
        metadata: { lastRunAt: task.updated_at, projectId: currentProjectId ?? undefined },
      }).catch(() => {});

      // Secondary fetch: load Agent 2 scenarios for the scenario tree.
      // Failure is non-critical — tree shows empty but YAML viewer still works.
      const sourceId = (task.result as Record<string, unknown> | null)?.sourceTaskId as string | undefined;
      if (sourceId) {
        try {
          const t2 = await api.getTaskStatus(sourceId);
          const artifactScenarios = scenarioTestcasesFromArtifacts(t2?.artifacts);
          setAgent2Testcases(
            artifactScenarios.length
              ? artifactScenarios
              : (t2?.testcases ?? []).filter((tc) => !!tc.scenarioData),
          );
        } catch {
          setAgent2Testcases([]);
        }
      }
    } catch { /* task fetch failed — user can retry via history list */ }
  };

  const handleDeleteHistory = (taskId: string) => {
    setDeleteConfirmTaskId(taskId);
  };

  const confirmDeleteHistory = async () => {
    const taskId = deleteConfirmTaskId;
    setDeleteConfirmTaskId(null);
    if (!taskId) return;
    try {
      await api.deleteTask(taskId);
      setAgent3History((prev) => prev.filter((e) => e.taskId !== taskId));
      if (agent3ActiveTaskId === taskId) {
        const remaining = agent3History.filter((e) => e.taskId !== taskId);
        const next = remaining[0] ?? null;
        setAgentActiveTask('agent3', next?.taskId ?? null);
        if (next) handleSelectHistory(next.taskId);
        else { setYamlFiles([]); setAgent3TaskId(null); }
      }
    } catch { /* silent */ }
  };

  // ── Load sessions on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const s2 = await api.getSessionState('test_scenarios', currentProjectId);
        if (s2?.taskId) {
          const t2 = await api.getTaskStatus(s2.taskId);
          if (t2?.status === 'completed') {
            restoreAgent2Session(s2.taskId, currentProjectId ?? '');
          }
        }
      } catch { /* no session */ }

      let sessionRestored = false;
      try {
        const s3 = await api.getSessionState('yaml_export', currentProjectId);
        if (s3?.taskId) {
          setAgent3TaskId(s3.taskId);
          const t3 = await api.getTaskStatus(s3.taskId);
          const artifactFiles = yamlTestcasesFromArtifacts(t3?.artifacts);
          const files = artifactFiles.length
            ? artifactFiles
            : (t3?.testcases ?? []).filter((tc) => !!tc.automationYaml);
          setYamlFiles(files);
          if (t3?.status === 'completed') {
            restoreAgent3Session(s3.taskId, currentProjectId ?? '');
            sessionRestored = true;
          }
        }
      } catch { /* no session */ }

      const historyTasks = await loadAgent3History();
      // Auto-select latest history entry when no prior session was restored
      if (!sessionRestored && historyTasks && historyTasks.length > 0) {
        await handleSelectHistory(historyTasks[0].task_id);
      }
    };
    init();
    return () => { sseCtrl.current?.abort(); };
  }, []);

  // ── Auto-reload history when Agent 3 completes ────────────────────────���───
  useEffect(() => {
    if (activeAgentType === 'agent3' && taskStatus === 'completed') {
      loadAgent3History();
      useQuotaStore.getState().fetch().catch(() => {});
    }
  }, [activeAgentType, taskStatus]);

  // Reload history when project switches
  useEffect(() => {
    loadAgent3History();
  }, [currentProjectId]);

  // Reset scenario selection to "all" when the source testcase list changes
  useEffect(() => {
    setSelectedScenarioIds(new Set(
      agent2Testcases.map((tc) => {
        const sd = getScenarioData(tc);
        return sd?.id || tc.id;
      })
    ));
  }, [agent2Testcases]);

  // ── Fetch staleness when project or Agent 2 active task changes ──────────
  useEffect(() => {
    if (!currentProjectId) return;
    pipelineStore.fetchStaleness(currentProjectId).then((data) => {
      // Use functional form to avoid overwriting 'committed' with stale 'draft'
      // if this request was issued before a concurrent commit resolved.
      if (data.agent2) setAgent2VersionStatus(prev =>
        prev === 'committed' ? 'committed' : data.agent2!.versionStatus
      );
      if (data.agent3) {
        setAgent3VersionStatus(data.agent3.versionStatus);
        setIsAgent3Stale(data.agent3.isStale);
      }
    }).catch(() => {});
  }, [currentProjectId, agent2ActiveTaskId]);

  // ── Load Agent 2 testcases when Agent 2 active task changes ─────────────
  useEffect(() => {
    if (!agent2ActiveTaskId) { setAgent2Testcases([]); return; }
    api.getTaskStatus(agent2ActiveTaskId)
      .then((task) => {
        const artifactScenarios = scenarioTestcasesFromArtifacts(task?.artifacts);
        const tcs = artifactScenarios.length
          ? artifactScenarios
          : (task?.testcases ?? []).filter((tc) => !!tc.scenarioData);
        setAgent2Testcases(tcs);
        const feats = new Set<string>();
        const flows = new Set<string>();
        for (const tc of tcs) {
          const sd = getScenarioData(tc);
          feats.add(sd.feature_name || tc.featureName || '');
          flows.add(`${sd.feature_name}|${sd.flow_name}`);
        }
        setExpandedFeatures(feats);
        setExpandedFlows(flows);
      })
      .catch(() => setAgent2Testcases([]));
  }, [agent2ActiveTaskId]);

  const grouped = useMemo(
    () => buildGroupedTree(agent2Testcases, yamlFiles),
    [agent2Testcases, yamlFiles],
  );

  const totalYaml = yamlFiles.length;

  // ── Run Agent 3 ────────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!canMutateProject) { setRunError('Bạn chỉ có quyền xem project này'); return; }
    if (!agent2ActiveTaskId) { setRunError('Cần chạy Agent 2 trước.'); return; }
    if (!agent2IsCommitted) { setRunError('Agent 2 chưa được xác nhận. Hãy commit ở bước 2 trước.'); return; }
    sseCtrl.current?.abort();

    // Capture previous task id before resetting state
    const previousTaskId = agent3TaskId;
    // When stale, force a full fresh run — ignore HITL controls
    const isPartial = !isAgent3Stale && agent2Testcases.length > 0 && selectedScenarioIds.size < agent2Testcases.length;

    setRunning(true);
    setRunError(null);
    setSseLogs([]);
    setYamlFiles([]);
    setSelected(null);
    setNewYamlIds(new Set());
    setStartTime(Date.now());

    // Build scenario list from current agent2Testcases and initialise all as pending
    const scenarioList = agent2Testcases.map((tc) => {
      const sd = getScenarioData(tc);
      return { id: sd.id, name: sd.name || sd.id };
    });
    scenariosRef.current = scenarioList;
    const initStatus = new Map<string, 'pending' | 'loading' | 'done'>();
    scenarioList.forEach((s, i) => initStatus.set(s.id, i === 0 ? 'loading' : 'pending'));
    setScenarioStatus(initStatus);

    try {
      const res = await api.generateAutomation({
        task_id: agent2ActiveTaskId,
        framework,
        ...(!isAgent3Stale && feedbackPrompt.trim() ? { feedback_prompt: feedbackPrompt.trim() } : {}),
        ...(isPartial && previousTaskId ? {
          selected_scenario_ids: [...selectedScenarioIds],
          previous_task_id: previousTaskId,
        } : {}),
      });
      setFeedbackPrompt('');
      const newTaskId = res.task_id;
      setAgent3TaskId(newTaskId);
      setAgentActiveTask('agent3', newTaskId);

      await api.saveSessionState('yaml_export', {
        selectedDocIds: [],
        taskId: newTaskId,
        metadata: {
          agent2TaskId: agent2ActiveTaskId,
          projectId: currentProjectId ?? undefined,
          framework,
          lastRunAt: new Date().toISOString(),
        },
      }).catch(() => {});

      sseCtrl.current = api.subscribeTaskSSE(newTaskId, {
        onProgress: (event) => {
          const log = String(event.data.log ?? event.data.status ?? '').trim();
          if (log) setSseLogs((prev) => [...prev.slice(-100), log]);
          // Parse "Converting scenario X/N: name" → advance loading dot to next scenario
          const match = log.match(/Converting scenario (\d+)\/(\d+)/);
          if (match) {
            const idx = parseInt(match[1], 10) - 1; // 0-based
            setScenarioStatus(() => {
              const next = new Map<string, 'pending' | 'loading' | 'done'>();
              scenariosRef.current.forEach((s, i) => {
                if (i < idx) next.set(s.id, 'done');
                else if (i === idx) next.set(s.id, 'loading');
                else next.set(s.id, 'pending');
              });
              return next;
            });
          }
        },
        onPartial: (event) => {
          const artifactIncoming = yamlTestcasesFromArtifacts(event.data.artifacts);
          const incoming = (artifactIncoming.length ? artifactIncoming : (event.data.testcases ?? []))
            .filter((tc: TestcaseItem) => !!tc.automationYaml);
          if (!incoming.length) return;
          setYamlFiles((prev) => [...prev, ...incoming]);
          // Flash newly arrived
          const ids = new Set(incoming.map((tc: TestcaseItem) => tc.id));
          setNewYamlIds(ids);
          setTimeout(() => setNewYamlIds(new Set()), 1200);
          // Mark matched scenario as done, advance next to loading
          setScenarioStatus((prev) => {
            const next = new Map(prev);
            for (const tc of incoming) {
              // Match by yamlFilename prefix → scenario id
              const scenarioId = (tc.yamlFilename ?? '').replace(/\.yaml$/i, '');
              if (next.has(scenarioId)) next.set(scenarioId, 'done');
            }
            const nextPending = scenariosRef.current.find(
              (s) => (next.get(s.id) ?? 'pending') === 'pending'
            );
            if (nextPending) next.set(nextPending.id, 'loading');
            return next;
          });
        },
        onCompleted: async () => {
          setRunning(false);
          notifyAgent3Completed(newTaskId);
          setAgent3VersionStatus('draft'); // new run always starts as draft
          pipelineStore.setTaskVersionStatus(newTaskId, 'draft');
          setIsAgent3Stale(false);
          setScenarioStatus((prev) => {
            const next = new Map(prev);
            for (const [k, v] of next) if (v !== 'done') next.set(k, 'done');
            return next;
          });
          try {
            const task = await api.getTaskStatus(newTaskId);
            const artifactFiles = yamlTestcasesFromArtifacts(task?.artifacts);
            const files = artifactFiles.length
              ? artifactFiles
              : (task?.testcases ?? []).filter((tc) => !!tc.automationYaml);
            setYamlFiles(files);
          } catch { /* silent */ }
          await loadAgent3History();
          useQuotaStore.getState().fetch().catch(() => {});
        },
        onError: (event) => {
          setRunning(false);
          setRunError(event.data.message || 'Agent 3 thất bại');
        },
      });
    } catch (e) {
      setRunning(false);
      setRunError(e instanceof Error ? e.message : 'Không thể chạy Agent 3');
    }
  }, [agent2ActiveTaskId, agent2IsCommitted, canMutateProject, framework, agent2Testcases, feedbackPrompt, selectedScenarioIds, agent3TaskId]);

  // ── Download single file ───────────────────────────────────────────────────
  const downloadFile = (tc: TestcaseItem) => {
    if (!tc.automationYaml) return;
    const blob = new Blob([tc.automationYaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = getFilename(tc); a.click();
    URL.revokeObjectURL(url);
  };

  // ── Download all as ZIP ────────────────────────────────────────────────────
  const downloadAllZip = async () => {
    if (!yamlFiles.length) return;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const tc of yamlFiles) {
      if (tc.automationYaml) zip.file(getFilename(tc), tc.automationYaml);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'automation_scripts.zip'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Copy to clipboard ──────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!selected?.yaml?.automationYaml) return;
    await navigator.clipboard.writeText(selected.yaml.automationYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFeature = (feat: string) =>
    setExpandedFeatures((prev) => { const s = new Set(prev); s.has(feat) ? s.delete(feat) : s.add(feat); return s; });

  const toggleFlow = (key: string) =>
    setExpandedFlows((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  // =============================================================================
  // Render helpers
  // =============================================================================

  // Commit Agent 3 result
  const handleCommitAgent3 = async () => {
    if (!agent3TaskId) return;
    setCommitting(true);
    try {
      await pipelineStore.commit(agent3TaskId);
      setAgent3VersionStatus('committed');
    } catch { /* silent */ }
    finally { setCommitting(false); }
  };

  const renderSourceInfo = () => (
    <div className={`rounded-xl border p-2.5 mb-3 ${
      agent2ActiveTaskId && !agent2IsCommitted
        ? 'border-amber-300 bg-amber-50'
        : isAgent3Stale
          ? 'border-orange-300 bg-orange-50'
          : 'border-outline-variant/20 bg-surface-container-low'
    }`}>
      <p className="text-[9px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">Input — Agent 2 đang active</p>
      {agent2ActiveTaskId ? (
        <>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${agent2IsCommitted ? 'bg-secondary' : 'bg-amber-500'}`} />
            <span className="text-[11px] font-mono text-on-surface truncate flex-1">
              {agent2ActiveTaskId.slice(0, 8)}...
            </span>
          </div>
          {!agent2IsCommitted && (
            <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">pending_actions</span>
              Agent 2 chưa được xác nhận — cần commit ở bước 2
            </p>
          )}
          {agent2IsCommitted && isAgent3Stale && (
            <p className="text-[10px] text-orange-700 mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">sync_problem</span>
              Input Agent 2 đã thay đổi — kết quả hiện tại bị lỗi thời
            </p>
          )}
          {agent2Testcases.length > 0 && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <div className="rounded-lg bg-surface-container-high px-2 py-1">
                <p className="text-[9px] uppercase text-on-surface-variant">Scenarios</p>
                <p className="text-xs font-bold text-on-surface">{agent2Testcases.length}</p>
              </div>
              <div className="rounded-lg bg-surface-container-high px-2 py-1">
                <p className="text-[9px] uppercase text-on-surface-variant">Scripts</p>
                <p className={`text-xs font-bold ${totalYaml > 0 ? 'text-primary' : 'text-on-surface'}`}>{totalYaml}</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-[10px] text-warning flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">warning</span>
          Chưa có kết quả Agent 2
        </p>
      )}
    </div>
  );

  const renderRunSection = () => {
    if (running) {
      const doneCount = [...scenarioStatus.values()].filter((v) => v === 'done').length;
      const totalCount = scenariosRef.current.length;
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-outline-variant/20 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-tertiary text-base animate-spin">progress_activity</span>
              <span className="text-xs font-bold text-tertiary">Agent 3 đang chạy...</span>
              <span className="ml-auto text-[10px] font-mono text-on-surface-variant">{elapsed}s</span>
            </div>
            {totalCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-tertiary to-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-on-surface-variant shrink-0">{doneCount}/{totalCount}</span>
              </div>
            )}
          </div>
          {/* Scenario progress list */}
          {scenariosRef.current.length > 0 ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-0.5 custom-scrollbar">
              <p className="text-[9px] uppercase tracking-widest text-on-surface-variant font-bold px-1 mb-2">
                Scenario Progress
              </p>
              {scenariosRef.current.map((s) => {
                const status = scenarioStatus.get(s.id) ?? 'pending';
                return (
                  <div key={s.id} className="flex items-center gap-2 py-1 px-2 rounded-lg">
                    {status === 'done' && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                    {status === 'loading' && <div className="w-2 h-2 rounded-full bg-tertiary animate-pulse shrink-0" />}
                    {status === 'pending' && <div className="w-2 h-2 rounded-full bg-outline-variant/30 shrink-0" />}
                    <span className={`text-[11px] flex-1 truncate leading-tight ${status === 'pending' ? 'text-on-surface-variant/40' : 'text-on-surface'}`}>
                      {s.name}
                    </span>
                    {status === 'done' && (
                      <span className="material-symbols-outlined text-[12px] text-primary shrink-0">check</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center opacity-40">
              <span className="material-symbols-outlined text-2xl animate-pulse text-tertiary">hourglass_top</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-outline-variant/20 space-y-3">
          {renderSourceInfo()}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
              Framework
            </label>
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              disabled={!agent2ActiveTaskId}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary/40 disabled:opacity-50"
            >
              {FRAMEWORKS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          {totalYaml > 0 && (
            <div className="space-y-1">
              <label className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${isAgent3Stale ? 'text-on-surface-variant/40' : 'text-on-surface-variant'}`}>
                <span className="material-symbols-outlined text-[11px]">edit_note</span>
                Chỉnh sửa (tùy chọn)
              </label>
              <textarea
                value={isAgent3Stale ? '' : feedbackPrompt}
                onChange={(e) => { if (!isAgent3Stale) setFeedbackPrompt(e.target.value); }}
                disabled={isAgent3Stale}
                placeholder={isAgent3Stale ? 'Chạy lại trước khi chỉnh sửa' : 'Ví dụ: thêm assertion kiểm tra loading state, dùng Page Object pattern...'}
                rows={3}
                className="w-full text-[11px] bg-surface-container-highest border border-outline-variant/30 rounded-lg px-2.5 py-2 text-on-surface placeholder:text-on-surface-variant/40 resize-none focus:outline-none focus:border-tertiary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {isAgent3Stale && (
            <div className="flex items-start gap-1.5 px-2.5 py-2 bg-orange-50 border border-orange-200 rounded-lg">
              <span className="material-symbols-outlined text-orange-500 text-[13px] mt-0.5 shrink-0">sync_problem</span>
              <p className="text-[10px] text-orange-700 leading-tight">
                Agent 2 đã thay đổi. Phải chạy lại toàn bộ Agent 3 trước khi có thể chỉnh sửa.
              </p>
            </div>
          )}

          {!agent2IsCommitted && (
            <div className="flex items-start gap-1.5 px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="material-symbols-outlined text-amber-500 text-[13px] mt-0.5 shrink-0">pending_actions</span>
              <p className="text-[10px] text-amber-700 leading-tight">
                Agent 2 chưa được xác nhận. Commit ở bước 2 trước khi chạy Agent 3.
              </p>
            </div>
          )}

          {(() => {
            const isPartial = !isAgent3Stale && agent2Testcases.length > 0 && selectedScenarioIds.size < agent2Testcases.length;
            const noneSelected = agent2Testcases.length > 0 && selectedScenarioIds.size === 0;
            const isRerun = totalYaml > 0;
            const withFeedback = !isAgent3Stale && feedbackPrompt.trim().length > 0;
            const btnLabel = isAgent3Stale
              ? 'Chạy lại Agent 3'
              : isRerun
                ? isPartial
                  ? `Chạy lại ${selectedScenarioIds.size}/${agent2Testcases.length} scenarios`
                  : withFeedback ? 'Chạy lại với chỉnh sửa' : 'Chạy lại Agent 3'
                : 'Chạy Agent 3';
            const btnIcon = isAgent3Stale ? 'refresh' : isRerun
              ? withFeedback || isPartial ? 'rate_review' : 'refresh'
              : 'code';
            const isPrimary = !isRerun || withFeedback || isPartial || isAgent3Stale;
            return (
              <Button
                onClick={handleRun}
                disabled={!agent2ActiveTaskId || !agent2IsCommitted || running || noneSelected || !canMutateProject}
                title={!canMutateProject ? 'Viewer chỉ có quyền xem project này' : !agent2IsCommitted ? 'Cần commit Agent 2 trước' : undefined}
                variant={isPrimary ? 'primary' : 'toolbar'}
                className={`w-full py-2.5 rounded-xl font-headline font-bold text-xs flex items-center justify-center gap-2 transition-all
                  ${!isPrimary ? 'bg-surface-container-highest hover:bg-surface-dim border border-outline-variant/30 text-on-surface' : 'shadow-lg shadow-tertiary/20'}
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100`}
              >
                <span className="material-symbols-outlined text-sm">{btnIcon}</span>
                {btnLabel}
              </Button>
            );
          })()}

          {currentProjectRole === 'viewer' && (
            <p className="text-[10px] text-on-surface-variant leading-tight">
              Viewer chỉ được xem kết quả, không thể chạy agent.
            </p>
          )}
          {runError && <p className="text-[10px] text-error leading-tight">{runError}</p>}
        </div>

      </div>
    );
  };

  const renderTree = () => {
    if (!agent2Testcases.length) {
      return (
        <div className="flex-1 flex items-center justify-center text-center p-4 opacity-40">
          <p className="text-[11px] text-on-surface-variant">
            {historyLoading ? 'Đang tải...' : 'Chưa có testcase từ Agent 2.'}
          </p>
        </div>
      );
    }

    const totalScenarios = agent2Testcases.length;
    const nChecked = selectedScenarioIds.size;

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Select all / deselect all header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-outline-variant/10 shrink-0">
          <span className="text-[9px] uppercase tracking-widest text-on-surface-variant font-bold">
            {nChecked}/{totalScenarios} scenarios
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedScenarioIds(new Set(agent2Testcases.map((tc) => {
                const sd = getScenarioData(tc); return sd?.id || tc.id;
              })))}
              className="text-[9px] text-tertiary hover:underline leading-none"
            >
              Tất cả
            </button>
            <span className="text-[9px] text-outline-variant">·</span>
            <button
              onClick={() => setSelectedScenarioIds(new Set())}
              className="text-[9px] text-on-surface-variant hover:underline leading-none"
            >
              Bỏ chọn
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {grouped.map((feat) => {
            const featExpanded = expandedFeatures.has(feat.featureName);
            return (
              <div key={feat.featureName}>
                <button
                  onClick={() => toggleFeature(feat.featureName)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-container-highest text-left transition-colors"
                >
                  <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${featExpanded ? 'rotate-90' : ''}`}>
                    chevron_right
                  </span>
                  <span className="material-symbols-outlined text-sm text-secondary">folder</span>
                  <span className="flex-1 text-[11px] font-bold text-on-surface truncate">{feat.featureName}</span>
                  <span className="text-[9px] text-on-surface-variant shrink-0">
                    {feat.totalYaml}/{feat.flows.reduce((s, f) => s + f.scenarios.length, 0)}
                  </span>
                </button>

                {featExpanded && feat.flows.map((flow) => {
                  const flowKey = `${feat.featureName}|${flow.flowName}`;
                  const flowExpanded = expandedFlows.has(flowKey);
                  const flowYamlCount = flow.scenarios.filter((s) => s.yaml).length;

                  return (
                    <div key={flow.flowName}>
                      <Button
                        variant="ghost"
                        onClick={() => toggleFlow(flowKey)}
                        className="w-full flex items-center gap-2 pl-7 pr-3 py-1.5 hover:bg-surface-container-highest text-left transition-colors"
                      >
                        <span className={`material-symbols-outlined text-[13px] text-on-surface-variant transition-transform ${flowExpanded ? 'rotate-90' : ''}`}>
                          chevron_right
                        </span>
                        <span className="material-symbols-outlined text-[13px] text-tertiary">account_tree</span>
                        <span className="flex-1 text-[10px] font-semibold text-on-surface-variant truncate">{flow.flowName}</span>
                        <span className={`text-[9px] shrink-0 ${flowYamlCount === flow.scenarios.length ? 'text-primary' : 'text-on-surface-variant'}`}>
                          {flowYamlCount}/{flow.scenarios.length}
                        </span>
                      </Button>

                      {flowExpanded && flow.scenarios.map(({ tc, sd, yaml }) => {
                        const isActive = selected?.tc.id === tc.id;
                        const isChecked = selectedScenarioIds.has(sd.id);
                        const typeColor = TYPE_COLOR[sd.type.toLowerCase()] ?? 'text-on-surface-variant';
                        return (
                          <div
                            key={tc.id}
                            className={`flex items-center transition-all
                              ${isActive ? 'bg-tertiary/10 border-r-2 border-tertiary' : 'hover:bg-surface-container-highest'}
                              ${yaml && newYamlIds.has(yaml.id) ? 'animate-pulse bg-primary/5' : ''}`}
                          >
                            <label
                              className="flex items-center justify-center w-8 h-8 cursor-pointer shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  setSelectedScenarioIds(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(sd.id); else next.delete(sd.id);
                                    return next;
                                  });
                                }}
                                className="w-3.5 h-3.5 accent-tertiary cursor-pointer"
                              />
                            </label>
                            <button
                              onClick={() => setSelected({ tc, sd, yaml })}
                              className="flex-1 flex items-center gap-2 pr-3 py-2 text-left min-w-0"
                            >
                              <span className={`material-symbols-outlined text-sm shrink-0 ${yaml ? 'text-primary' : 'text-on-surface-variant/40'}`}>
                                {yaml ? 'description' : 'pending'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-[10px] font-medium truncate ${isActive ? 'text-tertiary' : 'text-on-surface'}`}>
                                  {sd.name || sd.id}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`text-[9px] font-bold uppercase ${typeColor}`}>{sd.type || '—'}</span>
                                  {yaml && <span className="text-[9px] text-on-surface-variant">· {formatSize(yaml.automationYaml!)}</span>}
                                </div>
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCodeViewer = () => {
    if (running && !selected) {
      return (
        <div className="h-full flex flex-col items-center justify-center opacity-50">
          <span className="material-symbols-outlined text-5xl mb-4 animate-spin text-tertiary">progress_activity</span>
          <p className="text-sm font-bold text-on-surface mb-1">Đang tạo automation scripts...</p>
          <p className="text-xs text-on-surface-variant">Chọn scenario bên trái để xem YAML khi có.</p>
        </div>
      );
    }

    if (!selected) {
      return (
        <div className="h-full flex flex-col items-center justify-center opacity-40">
          <span className="material-symbols-outlined text-6xl mb-4">code</span>
          <p className="text-sm font-medium text-center">
            {!agent2ActiveTaskId
              ? 'Cần chạy Agent 2 trước.'
              : totalYaml > 0
                ? 'Chọn scenario từ danh sách bên trái.'
                : 'Bấm "Chạy Agent 3" để tạo automation scripts.'}
          </p>
        </div>
      );
    }

    if (!selected.yaml) {
      return (
        <div className="h-full flex flex-col items-center justify-center opacity-50">
          <span className="material-symbols-outlined text-5xl mb-3 text-on-surface-variant">pending</span>
          <p className="text-sm font-bold text-on-surface mb-1">{selected.sd.name}</p>
          <p className="text-xs text-on-surface-variant">YAML chưa được tạo cho scenario này.</p>
        </div>
      );
    }

    const lines = (selected.yaml.automationYaml || '').split('\n');
    return (
      <div className="flex min-h-full">
        <div className="sticky left-0 w-11 bg-surface-container text-on-surface-variant/40 text-right pr-2.5 py-5 select-none border-r border-outline-variant/20 font-mono text-[11px] leading-5 shrink-0">
          {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <div className="flex-1 p-5 font-mono text-[12px] leading-5 overflow-x-auto">
          {lines.map((line, i) => <YamlLine key={i} line={line} />)}
        </div>
      </div>
    );
  };

  // =============================================================================
  // Main render
  // =============================================================================

  const selectedFilename = selected?.yaml ? getFilename(selected.yaml) : selected?.sd.name ?? 'Preview';

  return (
    <>
    <div className="px-6 py-4 flex flex-col gap-6 h-full overflow-hidden animate-fade-up">
      <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface font-headline tracking-tight mb-1">
              Automation Scripts
            </h1>
            <p className="text-sm text-on-surface-variant">
              Agent 3: Chuyển đổi QA test scenarios sang automation YAML scripts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {running && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-tertiary/10 text-tertiary rounded-full text-[10px] font-bold uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />Đang xử lý
              </div>
            )}
            {totalYaml > 0 && !running && (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase tracking-widest">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  {totalYaml} scripts · {framework}
                </div>
                <Button
                  onClick={downloadAllZip}
                  className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-white rounded-full text-[10px] font-bold hover:opacity-90 transition-opacity"
                >
                  <span className="material-symbols-outlined text-sm">folder_zip</span>
                  Download ZIP
                </Button>
              </>
            )}
          </div>
        </div>

        <ResizablePanels storageKey="yaml-export" defaultLeftPercent={30} minLeftPx={220} minRightPx={360} className="flex-1 min-h-0">
          {/* ── Left Panel ── */}
          <div className="flex flex-col bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden h-full">
            <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant/20 shrink-0">
              <span className="text-xs font-bold font-headline uppercase tracking-wide text-on-surface">
                Test Scenarios
              </span>
            </div>
            <div className="flex flex-col flex-1 overflow-hidden">
              {renderRunSection()}
              {renderTree()}

              {/* Agent 3 History — collapsible, at the bottom */}
              {(historyLoading || agent3History.length > 0) && (
                <div className="border-t border-outline-variant/20 shrink-0">
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-surface-container-low hover:bg-surface-container transition-colors"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex-1 text-left">
                      Lịch sử
                    </span>
                    {agent3History.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-mono">
                        {agent3History.length}
                      </span>
                    )}
                    <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform duration-200 ${historyOpen ? 'rotate-0' : '-rotate-90'}`}>
                      expand_more
                    </span>
                  </button>
                  {historyOpen && (
                    <div className="max-h-48 overflow-y-auto custom-scrollbar">
                      <AgentHistoryPanel
                        entries={agent3History}
                        activeTaskId={agent3ActiveTaskId}
                        loading={historyLoading}
                        onSelect={handleSelectHistory}
                        onDelete={handleDeleteHistory}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Panel (70%) ── */}
          <div className="flex flex-col bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-sm overflow-hidden min-h-0 h-full">
            {/* Stage Gate Banner for Agent 3 */}
            {totalYaml > 0 && !running && agent3VersionStatus === 'draft' && (
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-base">pending_actions</span>
                  <div>
                    <p className="text-xs font-bold text-amber-800">Scripts chưa được xác nhận (draft)</p>
                    <p className="text-[10px] text-amber-700">Xác nhận kết quả cuối cùng của pipeline.</p>
                  </div>
                </div>
                <button
                  onClick={handleCommitAgent3}
                  disabled={committing || !canMutateProject}
                  className="text-xs px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {committing ? (
                    <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Đang xác nhận...</>
                  ) : (
                    <><span className="material-symbols-outlined text-sm">check_circle</span> Xác nhận kết quả</>
                  )}
                </button>
              </div>
            )}
            {totalYaml > 0 && !running && agent3VersionStatus === 'committed' && (
              <div className="px-5 py-2 bg-green-50 border-b border-green-200 flex items-center gap-2 shrink-0">
                <span className="material-symbols-outlined text-green-600 text-base">verified</span>
                <p className="text-xs font-medium text-green-800">Pipeline hoàn chỉnh — kết quả đã được xác nhận.</p>
              </div>
            )}
            <div className="px-5 py-3 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex gap-1.5 shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                </div>
                <span className="text-[11px] font-mono text-on-surface-variant truncate ml-1">
                  {selectedFilename}
                </span>
              </div>
              {selected?.yaml?.automationYaml && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="utility"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10"
                  >
                    <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                    {copied ? 'COPIED' : 'COPY'}
                  </Button>
                  <Button
                    variant="utility"
                    onClick={() => downloadFile(selected.yaml!)}
                    className="flex items-center gap-1.5 bg-tertiary text-white hover:opacity-90 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Download
                  </Button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto bg-surface-container-lowest custom-scrollbar">
              {renderCodeViewer()}
            </div>
          </div>
        </ResizablePanels>
      </div>

      <ConfirmDialog
        open={deleteConfirmTaskId !== null}
        title="Xoá lần chạy này?"
        description="Toàn bộ automation script được tạo trong lần này sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        danger
        onConfirm={confirmDeleteHistory}
        onCancel={() => setDeleteConfirmTaskId(null)}
      />
    </>
  );
};
