import { useMemo, useState, useEffect } from 'react';
import { useAppStore } from '@/store';

export type StepId = 'documents' | 'flows' | 'scenarios' | 'export';
export type StepStatus = 'locked' | 'available' | 'in-progress' | 'done';

export interface WorkflowStep {
  id: StepId;
  index: number;
  label: string;
  name: string;
  status: StepStatus;
  meta?: string;
}

export interface WorkflowState {
  activeStep: StepId;
  steps: WorkflowStep[];
  setActiveStep: (id: StepId) => void;
}

const STEP_DEFS: Omit<WorkflowStep, 'status' | 'meta'>[] = [
  { id: 'documents', index: 1, label: 'Bước 1', name: 'Tài liệu' },
  { id: 'flows', index: 2, label: 'Bước 2', name: 'Phân tích luồng' },
  { id: 'scenarios', index: 3, label: 'Bước 3', name: 'Kịch bản' },
  { id: 'export', index: 4, label: 'Bước 4', name: 'Xuất YAML' },
];

// Derive step statuses + meta từ store state — single source of truth
export function deriveSteps(
  documents: { project_id: string; status: string }[],
  currentProjectId: string | null,
  sseActive: boolean,
  activeAgentType: 'agent1' | 'agent2' | 'agent3' | null,
  taskProjectId: string | null,
  agent1Result: Record<string, unknown> | null,
  taskStatus: string | null,
  taskResult: Record<string, unknown> | null,
): Record<StepId, { status: StepStatus; meta?: string }> {
  // ── Step 1: Tài liệu ──────────────────────────────────────────────────────
  const projectDocs = currentProjectId
    ? documents.filter((d) => d.project_id === currentProjectId)
    : [];
  const processedDocs = projectDocs.filter((d) => d.status === 'processed');
  // Có bất kỳ tài liệu nào là đủ để unlock Step 2 (kể cả đang uploaded/processing)
  const hasAnyDocs = projectDocs.length > 0;

  const documentsStatus: StepStatus = hasAnyDocs ? 'done' : 'available';
  const documentsMeta =
    processedDocs.length > 0
      ? `${processedDocs.length} / ${projectDocs.length} files`
      : projectDocs.length > 0
        ? `${projectDocs.length} files`
        : undefined;

  // ── Step 2: Phân tích luồng ───────────────────────────────────────────────
  // Agent 1 kết quả chỉ hợp lệ khi thuộc đúng project hiện tại
  const agent1BelongsToProject = taskProjectId === currentProjectId && agent1Result !== null;
  const flows = agent1BelongsToProject ? (agent1Result as any)?.flows : null;
  const hasFlows = agent1BelongsToProject && Array.isArray(flows) && flows.length > 0;
  const isAgent1Running = sseActive && activeAgentType === 'agent1';

  let flowsStatus: StepStatus;
  if (!hasAnyDocs) flowsStatus = 'locked';
  else if (isAgent1Running) flowsStatus = 'in-progress';
  else if (hasFlows) flowsStatus = 'done';
  else flowsStatus = 'available';

  const flowsMeta = hasFlows ? `${(flows as unknown[]).length} luồng` : undefined;

  // ── Step 3: Kịch bản ─────────────────────────────────────────────────────
  const isAgent2Running = sseActive && activeAgentType === 'agent2';
  // Agent 2 completed cho đúng project = đủ điều kiện "done"
  // Không check taskResult?.testcases vì testcases là local state trong TestScenarios
  const hasScenarios =
    taskProjectId === currentProjectId &&
    taskStatus === 'completed' &&
    (activeAgentType === 'agent2' || activeAgentType === 'agent3');

  // Meta: lấy count nếu có trong taskResult, không bắt buộc
  const testcaseCount = (taskResult as any)?.testcases?.length as number | undefined;

  let scenariosStatus: StepStatus;
  if (!hasFlows) scenariosStatus = 'locked';
  else if (isAgent2Running) scenariosStatus = 'in-progress';
  else if (hasScenarios) scenariosStatus = 'done';
  else scenariosStatus = 'available';

  const scenariosMeta = hasScenarios
    ? testcaseCount != null
      ? `${testcaseCount} kịch bản`
      : 'Hoàn thành'
    : undefined;

  // ── Step 4: Xuất YAML ─────────────────────────────────────────────────────
  const exportStatus: StepStatus = !hasScenarios ? 'locked' : 'available';

  return {
    documents: { status: documentsStatus, meta: documentsMeta },
    flows: { status: flowsStatus, meta: flowsMeta },
    scenarios: { status: scenariosStatus, meta: scenariosMeta },
    export: { status: exportStatus },
  };
}

export function useWorkflowState(): WorkflowState {
  const {
    documents,
    currentProjectId,
    sseActive,
    activeAgentType,
    taskProjectId,
    agent1Result,
    taskStatus,
    taskResult,
  } = useAppStore();

  const [activeStep, setActiveStepRaw] = useState<StepId>('documents');

  // Reset về bước 1 khi đổi project
  useEffect(() => {
    setActiveStepRaw('documents');
  }, [currentProjectId]);

  const derived = useMemo(
    () =>
      deriveSteps(
        documents,
        currentProjectId,
        sseActive,
        activeAgentType,
        taskProjectId,
        agent1Result,
        taskStatus,
        taskResult,
      ),
    [
      documents,
      currentProjectId,
      sseActive,
      activeAgentType,
      taskProjectId,
      agent1Result,
      taskStatus,
      taskResult,
    ],
  );

  const steps: WorkflowStep[] = STEP_DEFS.map((def) => ({
    ...def,
    status: derived[def.id].status,
    meta: derived[def.id].meta,
  }));

  function setActiveStep(id: StepId) {
    if (derived[id].status !== 'locked') setActiveStepRaw(id);
  }

  return { activeStep, steps, setActiveStep };
}
