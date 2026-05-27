import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tree, type NodeRendererProps } from 'react-arborist';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ResizablePanels } from '@/components/ui/ResizablePanels';
import { AgentHistoryPanel, type HistoryEntry } from '@/components/AgentHistoryPanel';
import { useApiActions } from '@/hooks/useApiActions';
import { useAppStore } from '@/store';
import { useQuotaStore } from '@/store/useQuotaStore';
import { usePipelineStore } from '@/store/usePipelineStore';
import type { DocumentItem, FolderItem, ProjectItem, VersionStatus } from '@/services/api';

// =============================================================================
// Types
// =============================================================================

interface ParsedFlow {
  flowName: string;
  source: string;
  steps: string[];
}


interface FlowGroup {
  featureName: string;
  flows: ParsedFlow[];
}

type TreeNodeType = 'project' | 'folder' | 'file';

interface FlowTreeNode {
  id: string;
  type: TreeNodeType;
  name: string;
  projectId: string;
  folderId?: string | null;
  document?: DocumentItem;
  children?: FlowTreeNode[];
}

// =============================================================================
// Helpers
// =============================================================================

/** Extract feature name from source: "Quản lý giao dịch > Thêm giao dịch" → "Quản lý giao dịch" */
function getFeatureName(source: string): string {
  const parts = source.split('>');
  return parts[0]?.trim() || 'Khác';
}

function groupFlowsByFeature(flows: ParsedFlow[]): FlowGroup[] {
  const map = new Map<string, ParsedFlow[]>();
  for (const flow of flows) {
    const feature = getFeatureName(flow.source);
    if (!map.has(feature)) map.set(feature, []);
    map.get(feature)!.push(flow);
  }
  return Array.from(map.entries()).map(([featureName, flows]) => ({
    featureName,
    flows,
  }));
}

function makeNodeId(type: TreeNodeType, id: string) {
  return `${type}:${id}`;
}

function buildTree(projects: ProjectItem[], folders: FolderItem[], docs: DocumentItem[]): FlowTreeNode[] {
  const folderByParent = new Map<string | null, FolderItem[]>();
  const docsByFolder = new Map<string | null, DocumentItem[]>();

  folders.forEach((f) => {
    const key = f.parent_id ?? null;
    const list = folderByParent.get(key) ?? [];
    list.push(f);
    folderByParent.set(key, list);
  });

  docs.forEach((d) => {
    const key = d.folder_id ?? null;
    const list = docsByFolder.get(key) ?? [];
    list.push(d);
    docsByFolder.set(key, list);
  });

  const buildFolder = (folder: FolderItem): FlowTreeNode => {
    const childFolders = (folderByParent.get(folder.folder_id) ?? []).map(buildFolder);
    const childFiles = (docsByFolder.get(folder.folder_id) ?? []).map((doc) => ({
      id: makeNodeId('file', doc.document_id),
      type: 'file' as const,
      name: doc.file_name,
      projectId: doc.project_id,
      folderId: doc.folder_id ?? null,
      document: doc,
    }));

    return {
      id: makeNodeId('folder', folder.folder_id),
      type: 'folder',
      name: folder.name,
      projectId: folder.project_id,
      folderId: folder.folder_id,
      children: [...childFolders, ...childFiles],
    };
  };

  return projects.map((project) => {
    const rootFolders = folders
      .filter((f) => f.project_id === project.project_id && !f.parent_id)
      .map(buildFolder);

    const rootFiles = docs
      .filter((d) => d.project_id === project.project_id && !d.folder_id)
      .map((doc) => ({
        id: makeNodeId('file', doc.document_id),
        type: 'file' as const,
        name: doc.file_name,
        projectId: doc.project_id,
        folderId: null,
        document: doc,
      }));

    return {
      id: makeNodeId('project', project.project_id),
      type: 'project' as const,
      name: project.name,
      projectId: project.project_id,
      children: [...rootFolders, ...rootFiles],
    };
  });
}

function FlowDocTreeNode({
  node,
  style,
  selectedDocIds,
  onToggleDoc,
}: NodeRendererProps<FlowTreeNode> & {
  selectedDocIds: string[];
  onToggleDoc: (docId: string) => void;
}) {
  const data = node.data;
  const isFile = data.type === 'file';
  const docId = data.document?.document_id;
  const isChecked = !!docId && selectedDocIds.includes(docId);

  const icon = data.type === 'project'
    ? 'workspaces'
    : data.type === 'folder'
      ? (node.isOpen ? 'folder_open' : 'folder')
      : 'description';

  const iconClass = data.type === 'project'
    ? 'text-indigo-600'
    : data.type === 'folder'
      ? 'text-amber-600'
      : 'text-primary';

  return (
    <div
      style={style}
      className={`grid grid-cols-[16px_18px_1fr] items-center gap-2 h-full rounded-lg px-2 text-xs border transition-colors cursor-pointer select-none ${
        node.isSelected ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-surface-container'
      }`}
    >
      {!isFile ? (
        <button
          type="button"
          className="w-4 h-4 flex items-center justify-center text-on-surface-variant shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
        >
          <span className={`material-symbols-outlined text-sm transition-transform duration-200 ${node.isOpen ? 'rotate-0' : '-rotate-90'}`}>
            expand_more
          </span>
        </button>
      ) : (
        <span className="w-4 h-4 shrink-0" />
      )}

      {isFile && docId ? (
        <div className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onToggleDoc(docId)}
            onClick={(e) => e.stopPropagation()}
            className="accent-primary w-3.5 h-3.5 rounded"
          />
        </div>
      ) : (
        <span className="w-[18px] h-[18px] block shrink-0" />
      )}

      <div className="flex items-center gap-2 min-w-0">
        <span className={`material-symbols-outlined text-base ${iconClass} shrink-0`}>{icon}</span>
        <span className="truncate">{data.name}</span>
        {isFile && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant uppercase shrink-0">
            File
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

import { useTranslation } from 'react-i18next';

export const FlowAnalysis: React.FC = () => {
  const { t } = useTranslation();
  const api = useApiActions();
  const {
    documents,
    projects,
    folders,
    currentProjectId,
    documentsLoading,
    fetchDocuments,
    fetchTree,
    taskStatus,
    taskResult,
    taskError,
    sseLogs,
    sseActive,
    sseTokenCount,
    sseStartTime,
    runExtractFlows,
    setCurrentProject,
    restoreAgent1Session,
    clearTaskState,
    agent1ActiveTaskId,
    setAgentActiveTask,
  } = useAppStore();

  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(460);

  // Stage Gate: version status of the active Agent 1 task
  const [taskVersionStatus, setTaskVersionStatus] = useState<VersionStatus | null>(null);
  const [committing, setCommitting] = useState(false);
  const pipelineCommit = usePipelineStore((s) => s.commit);
  const pipelineSetVersion = usePipelineStore((s) => s.setTaskVersionStatus);

  // HITL feedback
  const [feedbackPrompt, setFeedbackPrompt] = useState('');

  // History
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);
  const scopedDocuments = useMemo(
    () => documents.filter((d) => !currentProjectId || d.project_id === currentProjectId),
    [documents, currentProjectId]
  );
  const scopedProjects = useMemo(
    () => projects.filter((p) => !currentProjectId || p.project_id === currentProjectId),
    [projects, currentProjectId]
  );
  const scopedFolders = useMemo(
    () => folders.filter((f) => !currentProjectId || f.project_id === currentProjectId),
    [folders, currentProjectId]
  );
  const currentProjectRole = projects.find((p) => p.project_id === currentProjectId)?.role;
  const quotaBlocked = useQuotaStore((s) => s.isBlocked);
  const canRunWorkflow = currentProjectRole !== 'viewer' && !quotaBlocked;
  const treeData = useMemo(
    () => buildTree(scopedProjects, scopedFolders, scopedDocuments),
    [scopedProjects, scopedFolders, scopedDocuments]
  );

  // Update elapsed time every second while streaming
  useEffect(() => {
    if (!sseActive || !sseStartTime) {
      setElapsed(0);
      return;
    }
    
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sseStartTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [sseActive, sseStartTime]);

  const loadHistory = async (preferActiveId?: string | null) => {
    setHistoryLoading(true);
    try {
      const tasks = await api.listWorkflowTasks({
        type: 'extract-flows',
        status: 'completed',
        limit: 50,
        projectId: currentProjectId ?? undefined,
      });
      const entries: HistoryEntry[] = tasks.map((t) => {
        const result = t.result as Record<string, unknown> | null;
        return {
          taskId: t.task_id,
          createdAt: t.created_at,
          outputCount: (result?.flows as unknown[] | undefined)?.length ?? 0,
          outputUnit: 'flows',
          feedbackPrompt: result?.feedback_prompt as string | undefined,
          traceUrl: t.observability?.trace_url ?? null,
          latencyMs: t.observability?.latency_ms ?? null,
        };
      });
      setHistoryEntries(entries);

      // Set active task to preferActiveId or first entry if none set
      const targetId = preferActiveId ?? (entries[0]?.taskId ?? null);
      if (targetId && !agent1ActiveTaskId) {
        setAgentActiveTask('agent1', targetId);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSelectHistory = async (taskId: string) => {
    try {
      const task = await api.getTaskStatus(taskId);
      if (task?.result && task.status === 'completed') {
        restoreAgent1Session(
          task.result as unknown as Record<string, unknown>,
          taskId,
          currentProjectId ?? '',
        );
        setTaskVersionStatus((task.version_status as VersionStatus) ?? 'committed');
        await api.saveSessionState('flow_analysis', {
          selectedDocIds,
          taskId,
          metadata: { projectId: currentProjectId ?? undefined, lastRunAt: task.updated_at },
        }).catch(() => {});
      }
    } catch { /* silent */ }
  };

  const handleDeleteHistory = async (taskId: string) => {
    setDeleteConfirmTaskId(taskId);
  };

  const confirmDeleteHistory = async () => {
    const taskId = deleteConfirmTaskId;
    setDeleteConfirmTaskId(null);
    if (!taskId) return;
    try {
      await api.deleteTask(taskId);
      setHistoryEntries((prev) => prev.filter((e) => e.taskId !== taskId));
      // If deleted task was active, switch to next available or clear
      if (agent1ActiveTaskId === taskId) {
        const remaining = historyEntries.filter((e) => e.taskId !== taskId);
        const next = remaining[0] ?? null;
        setAgentActiveTask('agent1', next?.taskId ?? null);
        if (next) {
          handleSelectHistory(next.taskId);
        } else {
          clearTaskState();
        }
      }
    } catch { /* silent — entry stays in list if delete failed */ }
  };

  // Load documents and session state on mount
  useEffect(() => {
    fetchTree();

    // Load session state
    api.getSessionState('flow_analysis', currentProjectId).then(async (session) => {
      if (session) {
        if (session.metadata?.projectId) {
          setCurrentProject(session.metadata.projectId);
        }
        if (session.selectedDocIds && session.selectedDocIds.length > 0) {
          setSelectedDocIds(session.selectedDocIds);
        }
        if (session.taskId) {
          const projectId = session.metadata?.projectId as string | undefined;
          api.getTaskStatus(session.taskId).then((task) => {
            if (task && task.result && task.status === 'completed') {
              restoreAgent1Session(
                task.result as unknown as Record<string, unknown>,
                task.task_id,
                projectId ?? '',
              );
              setTaskVersionStatus((task.version_status as VersionStatus) ?? 'committed');
            }
          }).catch(() => {});
        }
      }
      await loadHistory(session?.taskId ?? null);
    }).catch(async () => {
      await loadHistory(null);
    });
  }, []);

  useEffect(() => {
    fetchDocuments(currentProjectId ?? undefined);
  }, [currentProjectId]);

  // Reload history when project switches
  useEffect(() => {
    loadHistory(null);
  }, [currentProjectId]);

  // Reload history when a new Agent 1 run completes; fetch version status
  useEffect(() => {
    if (taskStatus === 'completed' && !sseActive && agent1ActiveTaskId) {
      loadHistory(agent1ActiveTaskId);
      useQuotaStore.getState().fetch().catch(() => {});
      // Fetch the fresh task to read its version_status (always 'draft' on new runs)
      api.getTaskStatus(agent1ActiveTaskId).then((t) => {
        const vs = (t?.version_status as VersionStatus) ?? 'draft';
        setTaskVersionStatus(vs);
        pipelineSetVersion(agent1ActiveTaskId, vs);
      }).catch(() => {});
    }
  }, [taskStatus, sseActive, agent1ActiveTaskId]);

  useEffect(() => {
    if (!treeContainerRef.current) return;
    const el = treeContainerRef.current;
    const updateHeight = () => setTreeHeight(Math.max(300, Math.floor(el.clientHeight)));
    updateHeight();
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load parsed result from DB when task completes
  const parsedFlows: ParsedFlow[] = (() => {
    if (!taskResult) return [];
    const r = taskResult as unknown as {
      flows: ParsedFlow[];
      rawMarkdown: string;
      featureCount?: number;
    };
    return r.flows ?? [];
  })();

  // Keep selectedDocIds in sync with the current project's documents.
  // Must run unconditionally (not guarded by taskResult) so stale doc IDs from a
  // previously-restored session are cleared immediately when the project changes.
  useEffect(() => {
    if (selectedDocIds.length === 0) return;
    const existingDocIds = new Set(scopedDocuments.map(d => d.document_id));
    setSelectedDocIds(prev => {
      const next = prev.filter(id => existingDocIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [scopedDocuments]);

  const flowGroups = groupFlowsByFeature(parsedFlows);

  // Auto-select first feature when flows arrive
  useEffect(() => {
    if (flowGroups.length > 0 && !selectedFeature) {
      setSelectedFeature(flowGroups[0].featureName);
    }
  }, [flowGroups.length]);

  // ---- Run Agent 1 ----

  const handleRunAgent1 = async () => {
    if (!canRunWorkflow) {
      setRunError('Bạn chỉ có quyền xem project này');
      return;
    }
    if (selectedDocIds.length === 0) {
      setRunError('Vui lòng chọn ít nhất 1 tài liệu');
      return;
    }

    setRunning(true);
    setRunError(null);
    const promptToSend = feedbackPrompt.trim();
    try {
      await runExtractFlows(currentProjectId ?? '', selectedDocIds, promptToSend || undefined);
      setFeedbackPrompt('');
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : 'Không thể chạy Agent 1');
    } finally {
      setRunning(false);
    }
  };

  // ---- Commit Agent 1 result ----

  const handleCommit = async () => {
    if (!agent1ActiveTaskId) return;
    setCommitting(true);
    try {
      await pipelineCommit(agent1ActiveTaskId);
      setTaskVersionStatus('committed');
    } catch { /* silent — keep draft */ }
    finally { setCommitting(false); }
  };

  // ---- Toggle doc selection ----

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  // ---- Error classification ----

  const getErrorInfo = (error: string | null): { message: string; icon: string; color: string; canRetry: boolean } => {
    if (!error) return { message: '', icon: 'error', color: 'text-error', canRetry: false };
    
    const lowerError = error.toLowerCase();
    
    // Document errors
    if (lowerError.includes('document not found') || lowerError.includes('not found')) {
      return {
        message: 'Không tìm thấy tài liệu. Vui lòng chọn tài liệu khác và thử lại.',
        icon: 'folder_off',
        color: 'text-warning',
        canRetry: true,
      };
    }
    
    // Agent processing errors
    if (lowerError.includes('agent server error') || lowerError.includes('400') || lowerError.includes('500')) {
      return {
        message: `Lỗi xử lý AI: ${error.split(':')[2] || error}`,
        icon: 'smart_toy_off',
        color: 'text-error',
        canRetry: true,
      };
    }
    
    // Empty result
    if (lowerError.includes('empty result') || lowerError.includes('no flows')) {
      return {
        message: 'Agent không trích xuất được luồng nào từ tài liệu. Kiểm tra lại nội dung tài liệu.',
        icon: 'search_off',
        color: 'text-warning',
        canRetry: false,
      };
    }
    
    // Network/timeout
    if (lowerError.includes('network') || lowerError.includes('timeout') || lowerError.includes('connection')) {
      return {
        message: 'Kết nối bị gián đoạn. Vui lòng kiểm tra mạng và thử lại.',
        icon: 'wifi_off',
        color: 'text-warning',
        canRetry: true,
      };
    }
    
    // Generic error
    return {
      message: error,
      icon: 'error',
      color: 'text-error',
      canRetry: true,
    };
  };

  // ---- Selected flows ----

  const currentFlows = selectedFeature
    ? flowGroups.find((g) => g.featureName === selectedFeature)?.flows ?? []
    : [];

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <>
      <div className="px-6 py-4 flex flex-col h-full overflow-hidden animate-fade-up">
        {/* Header */}
        <div className="mb-6 flex justify-between items-end shrink-0">
          <div>
            <h1 className="text-2xl font-extrabold text-on-surface font-headline tracking-tight mb-1">
              Phân tích luồng
            </h1>
            <p className="text-sm text-on-surface-variant">
              Agent 1: Trích xuất và chuẩn hóa luồng người dùng từ tài liệu PRD & USER_FLOW.
            </p>
          </div>

          {/* Status badge */}
          {taskStatus === 'completed' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase tracking-widest">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {parsedFlows.length} flows
              </div>
              {(taskResult as any)?.featureCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-tertiary/10 text-tertiary rounded-full text-[10px] font-bold uppercase tracking-widest">
                  <span className="material-symbols-outlined text-sm">category</span>
                  {(taskResult as any).featureCount} features
                </div>
              )}
              {selectedDocIds.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/10 text-secondary rounded-full text-[10px] font-bold uppercase tracking-widest">
                  <span className="material-symbols-outlined text-sm">description</span>
                  {selectedDocIds.length} docs
                </div>
              )}
            </div>
          )}
          {sseActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-tertiary/10 text-tertiary rounded-full text-[10px] font-bold uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
              Đang xử lý
            </div>
          )}
        </div>

        <ResizablePanels storageKey="flow-analysis" defaultLeftPercent={28} minLeftPx={220} minRightPx={360} className="flex-1">
          {/* Left Panel: Doc Selector + Feature Tree */}
          <div className="flex flex-col gap-4 app-panel overflow-hidden h-full">
            {/* Doc Selector */}
            <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant/20">
              <span className="text-xs font-bold font-headline uppercase tracking-wide text-on-surface">
                Chọn tài liệu
              </span>
              <p className="text-[9px] text-on-surface-variant mt-0.5">
                Chọn PRD và/hoặc USER_FLOW
              </p>
            </div>

            <div ref={treeContainerRef} className="flex-1 overflow-hidden p-3">
              <div className="h-full rounded-xl border border-outline-variant/20 bg-surface-container-lowest overflow-hidden">
                {documentsLoading ? (
                  <div className="h-full flex items-center justify-center text-on-surface-variant text-xs">
                    <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                    Đang tải docs tree...
                  </div>
                ) : treeData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-on-surface-variant opacity-60 text-xs">
                    Chưa có tài liệu nào
                  </div>
                ) : (
                  <Tree<FlowTreeNode>
                    data={treeData}
                    width="100%"
                    height={treeHeight}
                    rowHeight={34}
                    indent={20}
                    openByDefault
                    onActivate={(node) => {
                      setCurrentProject(node.data.projectId);
                    }}
                    onSelect={(nodes) => {
                      const node = nodes[0];
                      if (!node) return;
                      setCurrentProject(node.data.projectId);
                    }}
                  >
                    {(props) => (
                      <FlowDocTreeNode
                        {...props}
                        selectedDocIds={selectedDocIds}
                        onToggleDoc={toggleDocSelection}
                      />
                    )}
                  </Tree>
                )}
              </div>
            </div>

            {/* Run button */}
            <div className="px-4 py-3 border-t border-outline-variant/10 space-y-2">
              {parsedFlows.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-[11px]">edit_note</span>
                    Chỉnh sửa (tùy chọn)
                  </label>
                  <textarea
                    value={feedbackPrompt}
                    onChange={(e) => setFeedbackPrompt(e.target.value)}
                    placeholder="Ví dụ: bỏ qua flow đăng xuất, chỉ lấy các flow liên quan đến thanh toán..."
                    rows={3}
                    className="w-full text-[11px] bg-surface-container-highest border border-outline-variant/30 rounded-lg px-2.5 py-2 text-on-surface placeholder:text-on-surface-variant/40 resize-none focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              )}
              <Button
                onClick={handleRunAgent1}
                disabled={running || sseActive || selectedDocIds.length === 0 || !canRunWorkflow}
                title={!canRunWorkflow ? 'Viewer chỉ có quyền xem project này' : undefined}
                className={`w-full py-2.5 text-xs ${parsedFlows.length > 0 && feedbackPrompt.trim() ? 'bg-primary text-white' : ''}`}
              >
                <span className="material-symbols-outlined text-base">
                  {sseActive ? 'hourglass_top' : parsedFlows.length > 0 && feedbackPrompt.trim() ? 'rate_review' : 'smart_toy'}
                </span>
                {sseActive ? t('agent.running') : parsedFlows.length > 0 ? feedbackPrompt.trim() ? 'Chạy lại với chỉnh sửa' : 'Chạy lại Agent 1' : t('agent.runAnalysis')}
              </Button>
              {currentProjectRole === 'viewer' && (
                <p className="text-[10px] text-on-surface-variant mt-1 text-center">
                  Viewer chỉ được xem kết quả, không thể chạy agent.
                </p>
              )}
              {runError && <p className="text-[10px] text-error mt-1 text-center">{runError}</p>}
            </div>

            {/* Feature Tree */}
            {flowGroups.length > 0 && (
              <>
                <div className="px-4 py-3 bg-surface-container-low border-t border-outline-variant/20">
                  <span className="text-xs font-bold font-headline uppercase tracking-wide text-on-surface">
                    Nhóm tính năng
                  </span>
                </div>
                <div className="overflow-y-auto p-4 custom-scrollbar flex-1">
                  {flowGroups.map((group) => {
                    const isActive = selectedFeature === group.featureName;
                    return (
                      <Button
                        key={group.featureName}
                        variant="ghost"
                        onClick={() => setSelectedFeature(group.featureName)}
                        className={`flex items-center text-left w-full py-1.5 px-3 rounded-lg text-xs font-medium transition-all mb-1
                          ${isActive
                            ? 'bg-primary/10 text-primary font-bold'
                            : 'text-on-surface hover:bg-surface-container-highest'
                          }`}
                      >
                        <span className={`material-symbols-outlined text-sm mr-2 ${isActive ? 'text-primary' : 'text-on-surface-variant opacity-60'}`}>
                          folder_open
                        </span>
                        {group.featureName}
                        <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-primary/20' : 'bg-surface-container-highest'}`}>
                          {group.flows.length}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </>
            )}

            {/* History panel — collapsible, at the bottom */}
            {(historyLoading || historyEntries.length > 0) && (
              <div className="border-t border-outline-variant/20 shrink-0">
                {/* Collapsible header */}
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-surface-container-low hover:bg-surface-container transition-colors"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex-1 text-left">
                    Lịch sử
                  </span>
                  {historyEntries.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-mono">
                      {historyEntries.length}
                    </span>
                  )}
                  <span
                    className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform duration-200 ${historyOpen ? 'rotate-0' : '-rotate-90'}`}
                  >
                    expand_more
                  </span>
                </button>

                {historyOpen && (
                  <div className="overflow-y-auto custom-scrollbar max-h-48">
                    <AgentHistoryPanel
                      entries={historyEntries}
                      activeTaskId={agent1ActiveTaskId}
                      loading={historyLoading}
                      onSelect={handleSelectHistory}
                      onDelete={handleDeleteHistory}
                      emptyText="Chưa có lần chạy nào"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel: Flow Cards */}
          <div className="flex flex-col app-panel overflow-hidden min-h-0 h-full">
            {/* Header */}
            <div className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">route</span>
                <div>
                  <h2 className="text-lg font-bold font-headline text-on-surface leading-tight">
                    {selectedFeature || 'Chọn nhóm tính năng'}
                  </h2>
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                    {selectedFeature ? `${currentFlows.length} luồng` : 'Luồng người dùng đã trích xuất'}
                  </span>
                </div>
              </div>
            </div>

            {/* Stage Gate Banner */}
            {taskStatus === 'completed' && !sseActive && taskVersionStatus === 'draft' && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-base">pending_actions</span>
                  <div>
                    <p className="text-xs font-bold text-amber-800">Kết quả chưa được xác nhận (draft)</p>
                    <p className="text-[10px] text-amber-700">Xác nhận để mở khoá Agent 2. Bạn vẫn có thể chạy lại HITL trước khi xác nhận.</p>
                  </div>
                </div>
                <Button
                  onClick={handleCommit}
                  disabled={committing || !canRunWorkflow}
                  className="text-xs px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white border-none shrink-0"
                >
                  {committing ? (
                    <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Đang xác nhận...</>
                  ) : (
                    <><span className="material-symbols-outlined text-sm">check_circle</span> Xác nhận kết quả</>
                  )}
                </Button>
              </div>
            )}
            {taskStatus === 'completed' && !sseActive && taskVersionStatus === 'committed' && (
              <div className="px-6 py-2 bg-green-50 border-b border-green-200 flex items-center gap-2 shrink-0">
                <span className="material-symbols-outlined text-green-600 text-base">verified</span>
                <p className="text-xs font-medium text-green-800">Kết quả đã được xác nhận — Agent 2 đã được mở khoá.</p>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-surface-container-lowest custom-scrollbar">
              {/* No flows yet */}
              {!taskResult && !sseActive && (
                <div className="h-full flex flex-col items-center justify-center opacity-40">
                  <span className="material-symbols-outlined text-6xl mb-4">account_tree</span>
                  <p className="text-sm font-medium">Chọn tài liệu và chạy Agent 1 để trích xuất luồng.</p>
                </div>
              )}

              {/* Running */}
              {sseActive && (
                <div className="h-full flex flex-col items-center justify-center">
                  <span className="material-symbols-outlined text-5xl mb-4 animate-spin text-primary">progress_activity</span>
                  <p className="text-sm font-bold text-on-surface mb-2">
                    Agent 1 đang phân tích {selectedDocIds.length > 1 ? `${selectedDocIds.length} tài liệu` : ''}...
                  </p>
                  
                  {/* Progress indicators */}
                  <div className="flex items-center gap-6 mb-4">
                    <div className="flex flex-col items-center">
                      <span className="text-2xl font-bold text-primary font-mono">{sseTokenCount}</span>
                      <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">tokens</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-2xl font-bold text-tertiary font-mono">{elapsed}s</span>
                      <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">elapsed</span>
                    </div>
                  </div>

                  {/* Progress bar animation */}
                  <div className="w-full max-w-md mb-4">
                    <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-primary to-tertiary rounded-full transition-all duration-500"
                        style={{ 
                          width: `${Math.min((sseTokenCount / 500) * 100, 95)}%`,
                          animation: 'pulse 2s ease-in-out infinite'
                        }}
                      />
                    </div>
                  </div>

                  {/* Collapsible log terminal */}
                  <details className="w-full max-w-lg group">
                    <summary className="cursor-pointer text-[10px] text-on-surface-variant hover:text-on-surface transition-colors text-center">
                      <span className="group-open:hidden">Show logs ▸</span>
                      <span className="hidden group-open:inline">Hide logs ▾</span>
                    </summary>
                    <div className="mt-2 bg-[#1E1E1E] rounded-xl p-3 font-mono text-[10px] text-primary-fixed-dim/80 max-h-32 overflow-y-auto">
                      {sseLogs.slice(-20).map((log, i) => (
                        <div key={i} className="mb-0.5 truncate">{log}</div>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              {/* Error */}
              {taskError && !sseActive && (() => {
                const errorInfo = getErrorInfo(taskError);
                return (
                  <div className="h-full flex flex-col items-center justify-center">
                    <span className={`material-symbols-outlined text-5xl mb-3 ${errorInfo.color}`}>
                      {errorInfo.icon}
                    </span>
                    <p className={`text-sm font-bold ${errorInfo.color} mb-4 text-center max-w-md`}>
                      {errorInfo.message}
                    </p>
                    {errorInfo.canRetry && (
                      <Button
                        variant="primary"
                        onClick={handleRunAgent1}
                        disabled={!canRunWorkflow}
                        title={!canRunWorkflow ? 'Viewer chỉ có quyền xem project này' : undefined}
                        className="px-4 py-2 text-xs"
                      >
                        <span className="material-symbols-outlined text-base">refresh</span>
                        Thử lại
                      </Button>
                    )}
                  </div>
                );
              })()}

              {/* Flows grid */}
              {selectedFeature && currentFlows.length > 0 && !sseActive && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {currentFlows.map((flow, fIdx) => (
                    <div
                      key={fIdx}
                      className="flex flex-col bg-surface-container-low border border-outline-variant/30 rounded-xl shadow-sm hover:shadow-md hover:border-primary/30 transition-all overflow-hidden group"
                    >
                      <div className="px-4 py-3 bg-surface border-b border-outline-variant/10 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-base text-primary">flag</span>
                          <h3 className="text-sm font-bold text-on-surface truncate">{flow.flowName}</h3>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 bg-surface-container-highest rounded text-on-surface-variant font-mono uppercase font-bold tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                          {flow.steps.length} steps
                        </span>
                      </div>
                      <div className="p-4 flex-1">
                        <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider mb-3">
                          Các bước
                        </p>
                        <ol className="space-y-3 relative before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-outline-variant/30 ml-1">
                          {flow.steps.map((step, sIdx) => (
                            <li
                              key={sIdx}
                              className="relative pl-7 text-[11px] text-on-surface leading-snug"
                            >
                              <span className="absolute left-0 top-0.5 w-[22px] h-[22px] flex items-center justify-center bg-surface-container-highest text-on-surface-variant rounded-full text-[9px] font-bold border-2 border-surface-container-low ring-1 ring-outline-variant/20">
                                {sIdx + 1}
                              </span>
                              {step}
                            </li>
                          ))}
                        </ol>
                        {flow.source && (
                          <div className="mt-3 pt-3 border-t border-outline-variant/10">
                            <span className="text-[9px] text-on-surface-variant uppercase tracking-wider font-bold">
                              Nguồn:
                            </span>
                            <span className="text-[10px] text-primary ml-1 font-medium">
                              {flow.source}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Completed but no flows */}
              {taskStatus === 'completed' && parsedFlows.length === 0 && !sseActive && (
                <div className="h-full flex flex-col items-center justify-center opacity-40">
                  <span className="material-symbols-outlined text-4xl mb-3 text-on-surface-variant">hourglass_empty</span>
                  <p className="text-sm font-medium">Không tìm thấy luồng nào trong tài liệu.</p>
                </div>
              )}
            </div>
          </div>
        </ResizablePanels>
      </div>

      <ConfirmDialog
        open={deleteConfirmTaskId !== null}
        title="Xoá lần phân tích này?"
        description="Tất cả test scenario (Bước 3) và automation script (Bước 4) được tạo từ lần phân tích này sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác."
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        danger
        onConfirm={confirmDeleteHistory}
        onCancel={() => setDeleteConfirmTaskId(null)}
      />
    </>
  );
};
