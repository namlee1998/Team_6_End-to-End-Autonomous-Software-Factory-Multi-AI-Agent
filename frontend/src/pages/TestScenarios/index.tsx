import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApiActions } from '@/hooks/useApiActions';
import type { TestcaseItem, VersionStatus } from '@/services/api';
import { AgentHistoryPanel, type HistoryEntry } from '@/components/AgentHistoryPanel';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ResizablePanels } from '@/components/ui/ResizablePanels';
import { useAppStore } from '@/store';
import { useQuotaStore } from '@/store/useQuotaStore';
import { usePipelineStore } from '@/store/usePipelineStore';
import { scenarioTestcasesFromArtifacts } from '@/lib/artifactHelpers';

// =============================================================================
// Types
// =============================================================================

interface ScenarioStep {
  id: string;
  action: string;
  expected_result: string;
}

interface ScenarioData {
  id: string;
  name: string;
  type: string;
  priority: string;
  preconditions: string[];
  steps: ScenarioStep[];
  test_data: Record<string, string>;
  expected_outcome: string;
  flow_name?: string;
  feature_name?: string;
}

interface FlowNode {
  flowName: string;
  count: number;
  happyCount: number;
  negativeCount: number;
  edgeCount: number;
}

interface FeatureGroup {
  featureName: string;
  flows: FlowNode[];
  totalCount: number;
}

type TypeFilter = 'all' | 'happy' | 'negative' | 'edge';

interface FlowSection {
  flowName: string;
  featureName: string;
  sourcePath?: string;
  stepCount?: number;
}


// =============================================================================
// Helpers
// =============================================================================

function getScenarioData(tc: TestcaseItem): ScenarioData | null {
  if (!tc.scenarioData) return null;
  const d = tc.scenarioData as Record<string, unknown>;
  return {
    id: String(d.id ?? tc.id),
    name: String(d.name ?? tc.flowName ?? ''),
    type: String(d.type ?? ''),
    priority: String(d.priority ?? ''),
    preconditions: Array.isArray(d.preconditions) ? (d.preconditions as string[]) : [],
    steps: Array.isArray(d.steps) ? (d.steps as ScenarioStep[]) : [],
    test_data: (d.test_data as Record<string, string>) ?? {},
    expected_outcome: String(d.expected_outcome ?? ''),
    flow_name: String(d.flow_name ?? tc.flowName ?? ''),
    feature_name: String(d.feature_name ?? tc.featureName ?? ''),
  };
}

function classifyType(type: string): 'happy' | 'negative' | 'edge' | 'other' {
  const t = type.toLowerCase();
  if (t === 'happy' || t === 'functional') return 'happy';
  if (t === 'negative' || t === 'error') return 'negative';
  if (t === 'edge' || t === 'boundary') return 'edge';
  return 'other';
}

function matchesTypeFilter(type: string, filter: TypeFilter): boolean {
  if (filter === 'all') return true;
  return classifyType(type) === filter;
}

function toFlowKey(flow: FlowSection): string {
  return `${flow.featureName}|${flow.flowName}|${flow.stepCount ?? 0}`;
}

/** Build Feature → Flow tree from testcases */
function buildTree(testcases: TestcaseItem[]): FeatureGroup[] {
  // feature → flow → scenarios[]
  const map = new Map<string, Map<string, TestcaseItem[]>>();

  for (const tc of testcases) {
    const sd = getScenarioData(tc);
    const featureName = sd?.feature_name || tc.featureName || 'Khác';
    const flowName = sd?.flow_name || tc.flowName || 'Unknown Flow';

    if (!map.has(featureName)) map.set(featureName, new Map());
    const flowMap = map.get(featureName)!;
    if (!flowMap.has(flowName)) flowMap.set(flowName, []);
    flowMap.get(flowName)!.push(tc);
  }

  return Array.from(map.entries()).map(([featureName, flowMap]) => {
    const flows: FlowNode[] = Array.from(flowMap.entries()).map(([flowName, tcs]) => {
      const types = tcs.map(tc => classifyType(String((tc.scenarioData as Record<string,unknown>)?.type ?? '')));
      return {
        flowName,
        count: tcs.length,
        happyCount: types.filter(t => t === 'happy').length,
        negativeCount: types.filter(t => t === 'negative').length,
        edgeCount: types.filter(t => t === 'edge').length,
      };
    });
    return {
      featureName,
      flows,
      totalCount: flows.reduce((s, f) => s + f.count, 0),
    };
  });
}

// =============================================================================
// Progressive reveal helpers
// =============================================================================

const SkeletonRows: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-2 px-4 py-3">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="h-8 bg-surface-container-highest rounded animate-pulse"
        style={{ animationDelay: `${i * 80}ms` }}
      />
    ))}
  </div>
);

const FlowSectionCard: React.FC<{
  flowName: string;
  featureName: string;
  status: 'pending' | 'loading' | 'done';
  testcases: TestcaseItem[];
  newTcIds: Set<string>;
}> = ({ flowName, featureName, status, testcases, newTcIds }) => {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (status === 'loading' || status === 'done') {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [status]);

  if (status === 'pending') {
    return (
      <div className="rounded-xl border border-outline-variant/10 overflow-hidden opacity-25">
        <div className="px-4 py-3 bg-surface-container-low flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-outline-variant/40 shrink-0" />
          <span className="text-[11px] text-on-surface-variant truncate">{flowName}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 220ms ease-out, transform 220ms ease-out',
      }}
      className="rounded-xl border border-outline-variant/20 overflow-hidden shadow-sm"
    >
      {/* Section header */}
      <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant/10 flex items-center gap-3">
        {status === 'loading' ? (
          <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse shrink-0" />
        ) : (
          <span className="material-symbols-outlined text-[14px] text-primary shrink-0">check_circle</span>
        )}
        <div className="flex-1 min-w-0">
          {featureName && (
            <p className="text-[9px] text-on-surface-variant uppercase tracking-widest truncate">{featureName}</p>
          )}
          <p className="text-[12px] font-bold font-headline text-on-surface truncate leading-tight">{flowName}</p>
        </div>
        {status === 'done' && testcases.length > 0 && (
          <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary font-bold shrink-0">
            {testcases.length} scenarios
          </span>
        )}
      </div>

      {/* Section content */}
      {status === 'loading' ? (
        <SkeletonRows count={3} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low border-b border-outline-variant/10">
              <tr>
                <th className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant w-[5%]">#</th>
                <th className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant w-[13%]">ID</th>
                <th className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant w-[32%]">Scenario Name</th>
                <th className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant w-[10%]">Type</th>
                <th className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant w-[10%]">Priority</th>
                <th className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant w-[8%]">Steps</th>
                <th className="px-4 py-2 w-[5%]"></th>
              </tr>
            </thead>
            <tbody>
              {testcases.map((tc, idx) => (
                <ScenarioRow
                  key={tc.id}
                  tc={tc}
                  idx={idx}
                  isLast={idx === testcases.length - 1}
                  isNew={newTcIds.has(tc.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const TYPE_STYLES: Record<string, string> = {
  happy: 'bg-primary/10 text-primary border-primary/20',
  functional: 'bg-primary/10 text-primary border-primary/20',
  negative: 'bg-error-container text-on-error-container border-error/20',
  error: 'bg-error-container text-on-error-container border-error/20',
  edge: 'bg-tertiary-container text-on-tertiary-container border-tertiary/20',
  boundary: 'bg-tertiary-container text-on-tertiary-container border-tertiary/20',
};

function getTypeStyle(type: string) {
  return TYPE_STYLES[type.toLowerCase()] ?? 'bg-surface-container-highest text-on-surface-variant border-outline-variant/30';
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'text-error font-bold',
  medium: 'text-warning font-semibold',
  low: 'text-on-surface-variant',
};

function getPriorityStyle(priority: string) {
  return PRIORITY_STYLES[priority.toLowerCase()] ?? 'text-on-surface-variant';
}

// =============================================================================
// ScenarioRow
// =============================================================================

const ScenarioRow: React.FC<{ tc: TestcaseItem; idx: number; isLast: boolean; isNew?: boolean }> = ({ tc, idx, isLast, isNew }) => {
  const [expanded, setExpanded] = useState(false);
  const [flash, setFlash] = useState(!!isNew);
  const sd = getScenarioData(tc);

  React.useEffect(() => {
    if (isNew) {
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
  }, [isNew]);

  if (!sd) return null;

  return (
    <>
      <tr
        className={`cursor-pointer select-none transition-colors ${
          !isLast ? 'border-b border-outline-variant/10' : ''
        } ${expanded ? 'bg-surface-container-highest/40' : 'hover:bg-surface-container-highest/60'}`}
        style={{
          backgroundColor: flash ? 'color-mix(in srgb, var(--md-sys-color-secondary, #6750a4) 6%, transparent)' : undefined,
          transition: 'background-color 700ms ease-out',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-4 py-3 align-middle w-[5%]">
          <span className="text-[10px] text-on-surface-variant font-mono">{idx + 1}</span>
        </td>
        <td className="px-4 py-3 align-middle w-[13%]">
          <span className="font-mono text-[11px] font-bold text-on-surface">{sd.id}</span>
        </td>
        <td className="px-4 py-3 align-middle w-[32%]">
          <span className="text-[12px] font-semibold text-on-surface">{sd.name}</span>
        </td>
        <td className="px-4 py-3 align-middle w-[10%]">
          <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getTypeStyle(sd.type)}`}>
            {sd.type}
          </span>
        </td>
        <td className="px-4 py-3 align-middle w-[10%]">
          <span className={`text-[11px] uppercase font-bold tracking-wide ${getPriorityStyle(sd.priority)}`}>
            {sd.priority}
          </span>
        </td>
        <td className="px-4 py-3 align-middle w-[8%]">
          <span className="text-[11px] text-on-surface-variant font-mono">{sd.steps.length}</span>
        </td>
        <td className="px-4 py-3 align-middle w-[5%]">
          <span
            className="material-symbols-outlined text-[14px] text-on-surface-variant transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
          >expand_more</span>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-surface-container-highest/30 border-b border-outline-variant/20">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-1 gap-4">
              {sd.preconditions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Điều kiện tiên quyết</p>
                  <ul className="space-y-1">
                    {sd.preconditions.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-on-surface">
                        <span className="material-symbols-outlined text-[12px] text-tertiary mt-0.5 shrink-0">check_small</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sd.steps.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Các bước thực hiện</p>
                  <div className="space-y-2">
                    {sd.steps.map((step, i) => (
                      <div key={i} className="flex gap-3 bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant/10">
                        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-secondary/10 text-secondary text-[9px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-on-surface font-medium">{step.action}</p>
                          <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
                            {step.expected_result}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sd.expected_outcome && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Kết quả mong đợi</p>
                  <p className="text-[11px] text-on-surface bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">{sd.expected_outcome}</p>
                </div>
              )}
              {Object.keys(sd.test_data).length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Test Data</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(sd.test_data).map(([k, v]) => (
                      <span key={k} className="text-[10px] font-mono bg-surface-container-highest px-2 py-1 rounded border border-outline-variant/20">
                        <span className="text-on-surface-variant">{k}:</span>{' '}
                        <span className="text-on-surface font-bold">{v}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const TestScenarios: React.FC = () => {
  const api = useApiActions();
  const {
    currentProjectId,
    projects,
    notifyAgent2Started,
    notifyAgent2Completed,
    restoreAgent2Session,
    taskStatus,
    activeAgentType,
    agent1ActiveTaskId,
    agent2ActiveTaskId,
    setAgentActiveTask,
  } = useAppStore();

  const [agent2TaskId, setAgent2TaskId] = useState<string | null>(null);
  const [testcases, setTestcases] = useState<TestcaseItem[]>([]);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [sseLogs, setSseLogs] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const sseCtrl = useRef<AbortController | null>(null);

  // HITL feedback
  const [feedbackPrompt, setFeedbackPrompt] = useState('');

  // Partial re-run: which flows to re-run (empty Set = first run, full Set = all)
  const [selectedFlowNames, setSelectedFlowNames] = useState<Set<string>>(new Set());

  // Agent 2 history
  const [agent2History, setAgent2History] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);

  // Progressive reveal state
  const [sourceFlows, setSourceFlows] = useState<FlowSection[]>([]);
  const sourceFlowsRef = useRef<FlowSection[]>([]); // ref for access inside stale closures
  const [sectionStatus, setSectionStatus] = useState<Map<string, 'pending' | 'loading' | 'done'>>(new Map());
  const [newTcIds, setNewTcIds] = useState<Set<string>>(new Set());
  const [statusBarText, setStatusBarText] = useState('');

  // Flow navigation
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const currentProjectRole = projects.find((p) => p.project_id === currentProjectId)?.role;
  const quotaBlocked = useQuotaStore((s) => s.isBlocked);
  const canMutateProject = currentProjectRole !== 'viewer';

  // Stage Gate: version status of active Agent 1 and Agent 2 tasks
  const [agent1VersionStatus, setAgent1VersionStatus] = useState<VersionStatus | null>(null);
  const [agent2VersionStatus, setAgent2VersionStatus] = useState<VersionStatus | null>(null);
  const [isAgent2Stale, setIsAgent2Stale] = useState(false);
  const [committing, setCommitting] = useState(false);
  const pipelineStore = usePipelineStore();

  // Sync agent1VersionStatus from store when FlowAnalysis commits on another page
  const storedAgent1Version = usePipelineStore((s) =>
    agent1ActiveTaskId ? s.taskVersions[agent1ActiveTaskId] : undefined
  );
  useEffect(() => {
    if (storedAgent1Version) setAgent1VersionStatus(storedAgent1Version);
  }, [storedAgent1Version]);

  // Agent 1 must be committed before Agent 2 can run
  const agent1IsCommitted = agent1VersionStatus === 'committed' || agent1VersionStatus === null; // null = legacy row (committed by default)
  const canRunAgent2 = !!agent1ActiveTaskId && agent1IsCommitted && !running && canMutateProject && !quotaBlocked;

  // ============================================================
  // Elapsed timer
  // ============================================================
  useEffect(() => {
    if (!running || !startTime) { setElapsed(0); return; }
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [running, startTime]);

  // ============================================================
  // Load Agent 2 history for current project
  // ============================================================
  const loadAgent2History = async () => {
    setHistoryLoading(true);
    try {
      const tasks = await api.listWorkflowTasks({
        type: 'generate-testcases',
        status: 'completed',
        limit: 50,
        projectId: currentProjectId ?? undefined,
      });
      setAgent2History(tasks.map((t) => ({
        taskId: t.task_id,
        createdAt: t.created_at,
        outputCount: (t.result as { scenarios?: unknown[] } | null)?.scenarios?.length ?? 0,
        outputUnit: 'scenarios',
        sourceTaskId: (t.result as Record<string, unknown> | null)?.sourceTaskId as string | undefined,
        feedbackPrompt: (t.result as Record<string, unknown> | null)?.feedback_prompt as string | undefined,
        traceUrl: t.observability?.trace_url ?? null,
        latencyMs: t.observability?.latency_ms ?? null,
      })));
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSelectHistory = async (taskId: string) => {
    try {
      const task = await api.getTaskStatus(taskId);
      if (task?.status === 'completed') {
        restoreAgent2Session(taskId, currentProjectId ?? '');
        const artifactTestcases = scenarioTestcasesFromArtifacts(task.artifacts);
        const nextTestcases = artifactTestcases.length ? artifactTestcases : (task.testcases ?? []);
        if (nextTestcases.length) {
          setTestcases(nextTestcases);
          setSelectedFlowNames(new Set(nextTestcases.map((tc) => tc.flowName || '').filter(Boolean)));
        }
        setAgent2TaskId(taskId);
        setAgent2VersionStatus((task.version_status as VersionStatus) ?? 'committed');
        await api.saveSessionState('test_scenarios', {
          selectedDocIds: [],
          taskId,
          metadata: { lastRunAt: task.updated_at, projectId: currentProjectId ?? undefined },
        }).catch(() => {});
      }
    } catch { /* silent */ }
  };

  // Commit Agent 2 result
  const handleCommitAgent2 = async () => {
    if (!agent2TaskId) return;
    setCommitting(true);
    try {
      await pipelineStore.commit(agent2TaskId);
      setAgent2VersionStatus('committed');
    } catch { /* silent */ }
    finally { setCommitting(false); }
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
      setAgent2History((prev) => prev.filter((e) => e.taskId !== taskId));
      if (agent2ActiveTaskId === taskId) {
        const remaining = agent2History.filter((e) => e.taskId !== taskId);
        const next = remaining[0] ?? null;
        setAgentActiveTask('agent2', next?.taskId ?? null);
        if (next) handleSelectHistory(next.taskId);
        else { setTestcases([]); setAgent2TaskId(null); }
      }
    } catch { /* silent */ }
  };

  // ============================================================
  // Load sessions on mount
  // ============================================================
  useEffect(() => {
    const init = async () => {
      try {
        const s2 = await api.getSessionState('test_scenarios', currentProjectId);
        if (s2?.taskId) {
          setAgent2TaskId(s2.taskId);
          const task = await api.getTaskStatus(s2.taskId);
          if (task?.status === 'completed') {
            restoreAgent2Session(s2.taskId, currentProjectId ?? '');
            const artifactTestcases = scenarioTestcasesFromArtifacts(task.artifacts);
            const nextTestcases = artifactTestcases.length ? artifactTestcases : (task.testcases ?? []);
            if (nextTestcases.length) setTestcases(nextTestcases);
          }
        }
      } catch { /* no session */ }
      await loadAgent2History();
    };
    init();
    return () => { sseCtrl.current?.abort(); };
  }, []);

  // Reload Agent 2 history when a run completes
  useEffect(() => {
    if (activeAgentType === 'agent2' && taskStatus === 'completed') {
      loadAgent2History();
      useQuotaStore.getState().fetch().catch(() => {});
    }
  }, [activeAgentType, taskStatus]);

  // Reload history when project switches
  useEffect(() => {
    loadAgent2History();
  }, [currentProjectId]);

  // Fetch staleness when project or active task changes
  useEffect(() => {
    if (!currentProjectId) return;
    pipelineStore.fetchStaleness(currentProjectId).then((data) => {
      if (data.agent1) setAgent1VersionStatus(data.agent1.versionStatus);
      if (data.agent2) {
        setAgent2VersionStatus(data.agent2.versionStatus);
        setIsAgent2Stale(data.agent2.isStale);
      }
    }).catch(() => {});
  }, [currentProjectId, agent1ActiveTaskId]);

  // Fetch flows from Agent 1 active task to pre-populate progressive reveal section list
  const fetchSourceFlows = async (sourceId: string, options?: { forRun?: boolean }) => {
    try {
      const task = await api.getTaskStatus(sourceId);
      const flows = (task?.result?.flows as { flowName: string; source?: string }[]) || [];
      const sections: FlowSection[] = flows.map(f => ({
        flowName: f.flowName,
        featureName: f.source ? f.source.split('>')[0].trim() : '',
        sourcePath: f.source ?? '',
        stepCount: Array.isArray((f as any).steps) ? (f as any).steps.length : 0,
      }));
      setSourceFlows(sections);
      sourceFlowsRef.current = sections;

      if (options?.forRun) {
        const statusMap = new Map<string, 'pending' | 'loading' | 'done'>();
        sections.forEach((s, i) => statusMap.set(s.flowName, i === 0 ? 'loading' : 'pending'));
        setSectionStatus(statusMap);
      }
      return sections;
    } catch { /* silent */ }
    setSourceFlows([]);
    return null;
  };

  useEffect(() => {
    if (!agent1ActiveTaskId) { setSourceFlows([]); return; }
    void fetchSourceFlows(agent1ActiveTaskId, { forRun: false });
  }, [agent1ActiveTaskId]);


  // ============================================================
  // Derived data
  // ============================================================
  const tree = useMemo(() => buildTree(testcases), [testcases]);

  // Auto-select "All flows" (null) whenever tree first loads — default to overview
  useEffect(() => {
    if (tree.length > 0 && selectedFlow === undefined) {
      setSelectedFlow(null);
    }
  }, [tree.length]);

  const filteredTestcases = useMemo(() => {
    let list = testcases;
    if (selectedFlow) {
      list = list.filter(tc => {
        const sd = getScenarioData(tc);
        return (sd?.flow_name || tc.flowName) === selectedFlow;
      });
    }
    if (typeFilter !== 'all') {
      list = list.filter(tc => {
        const type = String((tc.scenarioData as Record<string,unknown>)?.type ?? '');
        return matchesTypeFilter(type, typeFilter);
      });
    }
    return list;
  }, [testcases, selectedFlow, typeFilter]);

  const typeCounts = useMemo(() => {
    const source = selectedFlow
      ? testcases.filter(tc => (getScenarioData(tc)?.flow_name || tc.flowName) === selectedFlow)
      : testcases;
    const c = { happy: 0, negative: 0, edge: 0, other: 0 };
    for (const tc of source) {
      const cls = classifyType(String((tc.scenarioData as Record<string,unknown>)?.type ?? ''));
      c[cls]++;
    }
    return c;
  }, [testcases, selectedFlow]);

  // Derive ordered flow list from testcases (used in done-state left panel)
  const doneFlows = useMemo(() => {
    const seen = new Set<string>();
    const result: FlowSection[] = [];
    for (const tc of testcases) {
      const flowName = tc.flowName || '';
      if (flowName && !seen.has(flowName)) {
        seen.add(flowName);
        result.push({ flowName, featureName: tc.featureName || '' });
      }
    }
    return result;
  }, [testcases]);

  // ============================================================
  // Run Agent 2
  // ============================================================
  const handleRunAgent2 = useCallback(async () => {
    if (!canMutateProject) { setRunError('Bạn chỉ có quyền xem project này'); return; }
    if (!agent1ActiveTaskId) { setRunError('Cần chạy Agent 1 trước.'); return; }
    sseCtrl.current?.abort();

    // Capture previous task id before resetting state
    const previousTaskId = agent2TaskId;
    // When stale, force full fresh run — ignore HITL controls
    const isPartial = !isAgent2Stale && doneFlows.length > 0 && selectedFlowNames.size < doneFlows.length;

    setRunning(true);
    setRunError(null);
    setSseLogs([]);
    setTestcases([]);
    setSelectedFlow(null);
    setStartTime(Date.now());
    setSourceFlows([]);
    setSectionStatus(new Map());
    setNewTcIds(new Set());
    setStatusBarText('');

    try {
      const sections = await fetchSourceFlows(agent1ActiveTaskId, { forRun: true });
      if (!sections || sections.length === 0) {
        setRunning(false);
        setRunError('Không tìm thấy input flow từ Agent 1. Vui lòng chạy Agent 1 trước.');
        return;
      }

      const res = await api.generateTestcases({
        task_id: agent1ActiveTaskId,
        ...(!isAgent2Stale && feedbackPrompt.trim() ? { feedback_prompt: feedbackPrompt.trim() } : {}),
        ...(isPartial && previousTaskId ? {
          selected_flow_names: [...selectedFlowNames],
          previous_task_id: previousTaskId,
        } : {}),
      });
      setFeedbackPrompt('');
      const newTaskId = res.task_id;
      setAgent2TaskId(newTaskId);
      notifyAgent2Started(newTaskId, currentProjectId ?? '');

      await api.saveSessionState('test_scenarios', {
        selectedDocIds: [],
        taskId: newTaskId,
        metadata: {
          sourceTaskId: agent1ActiveTaskId,
          projectId: currentProjectId ?? undefined,
          lastRunAt: new Date().toISOString(),
        },
      }).catch(() => {});

      sseCtrl.current = api.subscribeTaskSSE(newTaskId, {
        onProgress: (event) => {
          const log = String(event.data.log ?? event.data.step ?? event.data.status ?? '').trim();
          if (log) {
            setSseLogs(prev => [...prev.slice(-100), log]);
            setStatusBarText(log);
          }
        },
        onPartial: (event) => {
          const artifactIncoming = scenarioTestcasesFromArtifacts(event.data.artifacts);
          const incoming = artifactIncoming.length ? artifactIncoming : (event.data.testcases ?? []);
          if (incoming.length === 0) return;

          // Append new testcases to state
          setTestcases(prev => [...prev, ...incoming]);

          // Flash newly arrived rows
          const ids = new Set(incoming.map(tc => tc.id));
          setNewTcIds(ids);
          setTimeout(() => setNewTcIds(new Set()), 1200);

          // Determine which flow just completed from the first testcase
          const completedFlow = incoming[0].flowName;
          setStatusBarText(`Hoàn thành: ${completedFlow}`);

          // Update section statuses: mark completed flow as 'done', advance next to 'loading'
          // Use ref (not state) to avoid stale closure inside the updater function
          setSectionStatus(prev => {
            const next = new Map(prev);
            next.set(completedFlow, 'done');
            const nextPending = sourceFlowsRef.current.find(
              f => (next.get(f.flowName) ?? 'pending') === 'pending'
            );
            if (nextPending) next.set(nextPending.flowName, 'loading');
            return next;
          });
        },
        onCompleted: async () => {
          notifyAgent2Completed(currentProjectId ?? '', newTaskId);
          setAgentActiveTask('agent2', newTaskId);
          setRunning(false);
          setStatusBarText('');
          setAgent2VersionStatus('draft'); // New run always starts as draft
          pipelineStore.setTaskVersionStatus(newTaskId, 'draft');
          setIsAgent2Stale(false);
          setSectionStatus(prev => {
            const next = new Map(prev);
            for (const [k, v] of next) { if (v !== 'done') next.set(k, 'done'); }
            return next;
          });
          try {
            const task = await api.getTaskStatus(newTaskId);
            const artifactTestcases = scenarioTestcasesFromArtifacts(task?.artifacts);
            const nextTestcases = artifactTestcases.length ? artifactTestcases : (task?.testcases ?? []);
            if (nextTestcases.length) {
              setTestcases(nextTestcases);
              setSelectedFlowNames(new Set(nextTestcases.map((tc) => tc.flowName || '').filter(Boolean)));
            }
          } catch { /* silent */ }
          await loadAgent2History();
          useQuotaStore.getState().fetch().catch(() => {});
        },
        onError: (event) => {
          setRunning(false);
          setStatusBarText('');
          setRunError(event.data.message || 'Agent 2 thất bại');
        },
      });
    } catch (e) {
      setRunning(false);
      setStatusBarText('');
      setRunError(e instanceof Error ? e.message : 'Không thể chạy Agent 2');
    }
  }, [agent1ActiveTaskId, canMutateProject, feedbackPrompt, selectedFlowNames, doneFlows, agent2TaskId]);

  const handleSelectFlow = (featureName: string, flowName: string) => {
    setSelectedFeature(featureName);
    setSelectedFlow(flowName);
    setTypeFilter('all');
  };

  // ============================================================
  // Render: Left panel sections
  // ============================================================
  const renderRunSection = () => {
    if (running) {
      const doneCount = [...sectionStatus.values()].filter(v => v === 'done').length;
      const totalCount = sourceFlows.length;
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-outline-variant/20 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-secondary text-base animate-spin">progress_activity</span>
              <span className="text-xs font-bold text-secondary">Agent 2 đang chạy...</span>
              <span className="ml-auto text-[10px] font-mono text-on-surface-variant">{elapsed}s</span>
            </div>
            {totalCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-secondary to-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-on-surface-variant shrink-0">{doneCount}/{totalCount}</span>
              </div>
            )}
          </div>
          {/* Flow status list */}
          {sourceFlows.length > 0 ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-0.5 custom-scrollbar">
              <p className="text-[9px] uppercase tracking-widest text-on-surface-variant font-bold px-1 mb-2">
                Flow Progress
              </p>
              {sourceFlows.map(flow => {
                const status = sectionStatus.get(flow.flowName) ?? 'pending';
                const count = testcases.filter(tc => tc.flowName === flow.flowName).length;
                return (
                  <div key={flow.flowName} className="flex items-center gap-2 py-1 px-2 rounded-lg">
                    {status === 'done' && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                    {status === 'loading' && <div className="w-2 h-2 rounded-full bg-secondary animate-pulse shrink-0" />}
                    {status === 'pending' && <div className="w-2 h-2 rounded-full bg-outline-variant/30 shrink-0" />}
                    <span className={`text-[11px] flex-1 truncate leading-tight ${status === 'pending' ? 'text-on-surface-variant/40' : 'text-on-surface'}`}>
                      {flow.flowName}
                    </span>
                    {count > 0 && (
                      <span className="text-[9px] font-mono text-on-surface-variant shrink-0">{count}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center opacity-40">
              <span className="material-symbols-outlined text-2xl animate-pulse text-secondary">hourglass_top</span>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Control area */}
        <div className="px-4 py-3 border-b border-outline-variant/20 shrink-0 space-y-2">
          {/* Agent 1 active info */}
          <div className={`rounded-xl border p-2.5 ${
            agent1ActiveTaskId && !agent1IsCommitted
              ? 'border-amber-300 bg-amber-50'
              : isAgent2Stale
                ? 'border-orange-300 bg-orange-50'
                : 'border-outline-variant/20 bg-surface-container-low'
          }`}>
            <p className="text-[9px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">Input — Agent 1 đang active</p>
            {agent1ActiveTaskId ? (
              <>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${agent1IsCommitted ? 'bg-primary' : 'bg-amber-500'}`} />
                  <span className="text-[11px] font-mono text-on-surface truncate flex-1">
                    {agent1ActiveTaskId.slice(0, 8)}...
                  </span>
                  <span className="text-[9px] text-primary font-bold shrink-0">
                    {sourceFlows.length > 0 ? `${sourceFlows.length} flows` : ''}
                  </span>
                </div>
                {!agent1IsCommitted && (
                  <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">pending_actions</span>
                    Agent 1 chưa được xác nhận — cần commit ở bước 1
                  </p>
                )}
                {agent1IsCommitted && isAgent2Stale && (
                  <p className="text-[10px] text-orange-700 mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">sync_problem</span>
                    Input Agent 1 đã thay đổi — kết quả hiện tại bị lỗi thời
                  </p>
                )}
              </>
            ) : (
              <p className="text-[10px] text-warning flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">warning</span>
                Chưa có kết quả Agent 1
              </p>
            )}
          </div>

          {/* Feedback textarea — only when results exist */}
          {testcases.length > 0 && (
            <div className="space-y-1">
              <label className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${isAgent2Stale ? 'text-on-surface-variant/40' : 'text-on-surface-variant'}`}>
                <span className="material-symbols-outlined text-[11px]">edit_note</span>
                Chỉnh sửa (tùy chọn)
              </label>
              <textarea
                value={isAgent2Stale ? '' : feedbackPrompt}
                onChange={(e) => { if (!isAgent2Stale) setFeedbackPrompt(e.target.value); }}
                disabled={isAgent2Stale}
                placeholder={isAgent2Stale ? 'Chạy lại trước khi chỉnh sửa' : 'Ví dụ: testcase 2 đang sai precondition, phải là điều kiện A B C...'}
                rows={3}
                className="w-full text-[11px] bg-surface-container-highest border border-outline-variant/30 rounded-lg px-2.5 py-2 text-on-surface placeholder:text-on-surface-variant/40 resize-none focus:outline-none focus:border-secondary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {isAgent2Stale && (
            <div className="flex items-start gap-1.5 px-2.5 py-2 bg-orange-50 border border-orange-200 rounded-lg">
              <span className="material-symbols-outlined text-orange-500 text-[13px] mt-0.5 shrink-0">sync_problem</span>
              <p className="text-[10px] text-orange-700 leading-tight">
                Agent 1 đã thay đổi. Phải chạy lại toàn bộ Agent 2 trước khi có thể chỉnh sửa.
              </p>
            </div>
          )}

          {(() => {
            const isPartial = !isAgent2Stale && doneFlows.length > 0 && selectedFlowNames.size < doneFlows.length;
            const noneSelected = doneFlows.length > 0 && selectedFlowNames.size === 0;
            const isRerun = testcases.length > 0;
            const withFeedback = !isAgent2Stale && feedbackPrompt.trim().length > 0;
            const btnLabel = isAgent2Stale
              ? 'Chạy lại Agent 2'
              : isRerun
                ? isPartial
                  ? `Chạy lại ${selectedFlowNames.size}/${doneFlows.length} flows`
                  : withFeedback ? 'Chạy lại với chỉnh sửa' : 'Chạy lại Agent 2'
                : 'Chạy Agent 2';
            const btnIcon = isAgent2Stale ? 'refresh' : isRerun
              ? withFeedback || isPartial ? 'rate_review' : 'refresh'
              : 'smart_toy';
            const isPrimary = !isRerun || withFeedback || isPartial || isAgent2Stale;
            return (
              <button
                onClick={handleRunAgent2}
                disabled={!canRunAgent2 || noneSelected}
                title={!canMutateProject ? 'Viewer chỉ có quyền xem project này' : !agent1IsCommitted ? 'Cần commit Agent 1 trước' : undefined}
                className={`w-full py-2.5 rounded-xl font-headline font-bold text-xs flex items-center justify-center gap-2 transition-all
                  ${isPrimary
                    ? 'bg-secondary text-white shadow-lg shadow-secondary/20 hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-surface-container-highest hover:bg-surface-dim border border-outline-variant/30 text-on-surface'}
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100`}
              >
                <span className="material-symbols-outlined text-sm">{btnIcon}</span>
                {btnLabel}
              </button>
            );
          })()}
          {currentProjectRole === 'viewer' && (
            <p className="text-[10px] text-on-surface-variant leading-tight">
              Viewer chỉ được xem kết quả, không thể chạy agent.
            </p>
          )}
          {runError && <p className="text-[10px] text-error leading-tight">{runError}</p>}
        </div>

        {/* Flat clickable flow list with checkboxes */}
        {doneFlows.length > 0 && (
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5 custom-scrollbar">
            {/* Header with select-all / deselect-all */}
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-[9px] uppercase tracking-widest text-on-surface-variant font-bold">Flows</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedFlowNames(new Set(doneFlows.map(f => f.flowName)))}
                  className="text-[9px] text-secondary hover:underline leading-none"
                >
                  Tất cả
                </button>
                <span className="text-[9px] text-outline-variant">·</span>
                <button
                  onClick={() => setSelectedFlowNames(new Set())}
                  className="text-[9px] text-on-surface-variant hover:underline leading-none"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            {/* "All flows" navigation item */}
            <button
              onClick={() => { setSelectedFlow(null); setSelectedFeature(null); setTypeFilter('all'); }}
              className={`flex items-center w-full text-left py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all gap-2
                ${!selectedFlow
                  ? 'bg-secondary/10 text-secondary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[13px] shrink-0">all_inclusive</span>
              <span className="flex-1 truncate leading-tight">Tất cả flows</span>
              <span className="text-[9px] font-mono shrink-0">{testcases.length}</span>
            </button>

            {/* Individual flow items */}
            {doneFlows.map(flow => {
              const isActive = selectedFlow === flow.flowName;
              const isChecked = selectedFlowNames.has(flow.flowName);
              const count = testcases.filter(tc => tc.flowName === flow.flowName).length;
              return (
                <div
                  key={flow.flowName}
                  className={`flex items-center rounded-lg text-[11px] font-medium transition-all
                    ${isActive ? 'bg-secondary/10' : 'hover:bg-surface-container-highest'}`}
                >
                  <label
                    className="flex items-center justify-center w-8 h-7 cursor-pointer shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        setSelectedFlowNames(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(flow.flowName); else next.delete(flow.flowName);
                          return next;
                        });
                      }}
                      className="w-3.5 h-3.5 accent-secondary cursor-pointer"
                    />
                  </label>
                  <button
                    onClick={() => handleSelectFlow(flow.featureName, flow.flowName)}
                    className={`flex-1 flex items-center gap-1.5 py-1.5 pr-2 text-left min-w-0
                      ${isActive ? 'text-secondary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
                  >
                    <span className="flex-1 truncate leading-tight">{flow.flowName}</span>
                    {count > 0 && (
                      <span className="text-[9px] font-mono shrink-0">{count}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Agent 2 History — collapsible, at the bottom */}
        {(historyLoading || agent2History.length > 0) && (
          <div className="border-t border-outline-variant/20 shrink-0">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-2 bg-surface-container-low hover:bg-surface-container transition-colors"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex-1 text-left">
                Lịch sử
              </span>
              {agent2History.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-mono">
                  {agent2History.length}
                </span>
              )}
              <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform duration-200 ${historyOpen ? 'rotate-0' : '-rotate-90'}`}>
                expand_more
              </span>
            </button>
            {historyOpen && (
              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                <AgentHistoryPanel
                  entries={agent2History}
                  activeTaskId={agent2ActiveTaskId}
                  loading={historyLoading}
                  onSelect={handleSelectHistory}
                  onDelete={handleDeleteHistory}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // Render: Right panel
  // ============================================================
  const renderRightContent = () => {
    if (running) {
      return (
        <div className="relative h-full flex flex-col">
          {/* Scrollable progressive sections */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {sourceFlows.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-60">
                <span className="material-symbols-outlined text-4xl animate-spin text-secondary mb-3">progress_activity</span>
                <p className="text-sm font-bold text-on-surface">Đang khởi động Agent 2...</p>
              </div>
            ) : (
              sourceFlows.map(flow => {
                const status = sectionStatus.get(flow.flowName) ?? 'pending';
                const flowTestcases = testcases.filter(tc => tc.flowName === flow.flowName);
                return (
                  <FlowSectionCard
                    key={flow.flowName}
                    flowName={flow.flowName}
                    featureName={flow.featureName}
                    status={status}
                    testcases={flowTestcases}
                    newTcIds={newTcIds}
                  />
                );
              })
            )}
          </div>

          {/* Sticky status bar */}
          <div className="shrink-0 border-t border-outline-variant/20 bg-surface-container-low px-4 py-2 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse shrink-0" />
            <span className="text-[11px] text-on-surface-variant truncate flex-1">
              {statusBarText || `Đang xử lý... (${elapsed}s)`}
            </span>
            {testcases.length > 0 && (
              <span className="text-[10px] font-mono text-secondary shrink-0 font-bold">
                {testcases.length} scenarios
              </span>
            )}
          </div>
        </div>
      );
    }

    if (runError && testcases.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center">
          <span className="material-symbols-outlined text-5xl mb-3 text-error">smart_toy_off</span>
          <p className="text-sm font-bold text-error mb-1">Agent 2 thất bại</p>
          <p className="text-xs text-on-surface-variant text-center max-w-sm mb-4">{runError}</p>
          <button onClick={handleRunAgent2} disabled={!agent1ActiveTaskId || running || !canMutateProject}
            title={!canMutateProject ? 'Viewer chỉ có quyền xem project này' : undefined}
            className="px-4 py-2 bg-secondary text-white rounded-lg font-bold text-xs hover:opacity-90 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">refresh</span> Thử lại
          </button>
        </div>
      );
    }

    if (testcases.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center opacity-40">
          <span className="material-symbols-outlined text-6xl mb-4">checklist</span>
          <p className="text-sm font-medium text-center">
            {agent1ActiveTaskId ? 'Bấm "Chạy Agent 2" để tạo test scenarios.' : 'Cần chạy Agent 1 trước.'}
          </p>
        </div>
      );
    }

    // "All flows" mode — stack all FlowSectionCards
    if (!selectedFlow) {
      return (
        <div className="space-y-4">
          {doneFlows.map(flow => {
            const flowTcs = testcases
              .filter(tc => tc.flowName === flow.flowName)
              .filter(tc => matchesTypeFilter(String((tc.scenarioData as Record<string, unknown>)?.type ?? ''), typeFilter));
            return (
              <FlowSectionCard
                key={flow.flowName}
                flowName={flow.flowName}
                featureName={flow.featureName}
                status="done"
                testcases={flowTcs}
                newTcIds={newTcIds}
              />
            );
          })}
        </div>
      );
    }

    // Single flow mode
    if (filteredTestcases.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center opacity-40">
          <span className="material-symbols-outlined text-4xl mb-3">filter_list_off</span>
          <p className="text-sm font-medium">Không có scenario nào thuộc loại này.</p>
        </div>
      );
    }

    return (
      <FlowSectionCard
        flowName={selectedFlow}
        featureName={doneFlows.find(f => f.flowName === selectedFlow)?.featureName ?? ''}
        status="done"
        testcases={filteredTestcases}
        newTcIds={newTcIds}
      />
    );
  };

  // ============================================================
  // Header status
  // ============================================================
  const renderStatusBadge = () => {
    if (running) return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/10 text-secondary rounded-full text-[10px] font-bold uppercase tracking-widest">
        <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />Đang xử lý
      </div>
    );
    if (testcases.length > 0) return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase tracking-widest">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          {testcases.length} scenarios · {tree.length} features
        </div>
      </div>
    );
    return null;
  };

  // ============================================================
  // Right panel header
  // ============================================================
  const currentFlow = selectedFlow
    ? tree.flatMap(g => g.flows).find(f => f.flowName === selectedFlow)
    : null;

  const TYPE_TABS: { key: TypeFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: (currentFlow?.count ?? testcases.length) },
    { key: 'happy', label: 'Happy', count: typeCounts.happy },
    { key: 'negative', label: 'Negative', count: typeCounts.negative },
    { key: 'edge', label: 'Edge', count: typeCounts.edge },
  ];

  // ============================================================
  // Main render
  // ============================================================
  return (
    <>
      <div className="px-6 py-4 flex flex-col h-full overflow-hidden animate-fade-up">
        {/* Header */}
        <div className="mb-6 flex justify-between items-end shrink-0">
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface font-headline tracking-tight mb-1">
              Test Scenarios Design
            </h1>
            <p className="text-sm text-on-surface-variant">
              Agent 2: Tạo QA test cases (Happy, Negative, Edge) từ User Flows.
            </p>
          </div>
          {renderStatusBadge()}
        </div>

        <ResizablePanels storageKey="test-scenarios" defaultLeftPercent={28} minLeftPx={220} minRightPx={360} className="flex-1 min-h-0">

          {/* ── Left Panel ── */}
          <div className="flex flex-col app-panel overflow-hidden h-full">
            <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant/20 shrink-0">
              <span className="text-xs font-bold font-headline uppercase tracking-wide text-on-surface">
                {running ? 'Flow Progress' : testcases.length > 0 ? 'Flows' : 'Control Panel'}
              </span>
            </div>
            <div className="flex flex-col flex-1 overflow-hidden">
              {renderRunSection()}
            </div>
          </div>

          {/* ── Right Panel ── */}
          <div className="flex flex-col app-panel overflow-hidden min-h-0 h-full">

            {/* Panel header */}
            <div className="px-6 py-3 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between shrink-0 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-secondary text-xl shrink-0">checklist</span>
                <div className="min-w-0">
                  {selectedFlow ? (
                    <>
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold truncate">
                        {selectedFeature}
                      </p>
                      <p className="text-sm font-bold font-headline text-on-surface leading-tight truncate">{selectedFlow}</p>
                    </>
                  ) : (
                    <p className="text-sm font-bold font-headline text-on-surface">Scenario Board</p>
                  )}
                </div>
              </div>

              {/* Type filter tabs */}
              {testcases.length > 0 && !running && (
                <div className="flex items-center gap-1 shrink-0">
                  {TYPE_TABS.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setTypeFilter(tab.key)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1
                        ${typeFilter === tab.key
                          ? 'bg-secondary text-white shadow-sm'
                          : 'bg-surface-container-highest text-on-surface-variant hover:bg-surface-dim'}`}
                    >
                      {tab.label}
                      <span className={`text-[9px] font-mono ${typeFilter === tab.key ? 'text-white/80' : 'text-on-surface-variant'}`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stage Gate Banner */}
            {testcases.length > 0 && !running && agent2VersionStatus === 'draft' && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-base">pending_actions</span>
                  <div>
                    <p className="text-xs font-bold text-amber-800">Kết quả chưa được xác nhận (draft)</p>
                    <p className="text-[10px] text-amber-700">Xác nhận để mở khoá Agent 3. Bạn vẫn có thể chạy lại HITL trước khi xác nhận.</p>
                  </div>
                </div>
                <button
                  onClick={handleCommitAgent2}
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
            {testcases.length > 0 && !running && agent2VersionStatus === 'committed' && (
              <div className="px-6 py-2 bg-green-50 border-b border-green-200 flex items-center gap-2 shrink-0">
                <span className="material-symbols-outlined text-green-600 text-base">verified</span>
                <p className="text-xs font-medium text-green-800">Kết quả đã được xác nhận — Agent 3 đã được mở khoá.</p>
              </div>
            )}

            {/* Panel content — when running, inner div manages scroll+sticky; otherwise outer scrolls */}
            <div className={`flex-1 bg-surface-container-lowest ${running ? 'overflow-hidden' : 'overflow-y-auto p-6 custom-scrollbar'}`}>
              {renderRightContent()}
            </div>
          </div>

        </ResizablePanels>
      </div>

      <ConfirmDialog
        open={deleteConfirmTaskId !== null}
        title="Xoá lần chạy này?"
        description="Tất cả automation script (Bước 4) được tạo từ lần chạy này sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        danger
        onConfirm={confirmDeleteHistory}
        onCancel={() => setDeleteConfirmTaskId(null)}
      />
    </>
  );
};
