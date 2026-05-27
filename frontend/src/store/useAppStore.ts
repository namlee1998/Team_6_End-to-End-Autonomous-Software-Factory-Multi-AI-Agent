import { create } from 'zustand';
import * as api from '@/services/api';
import type {
  DocumentItem,
  FolderItem,
  ProjectItem,
  TaskItem,
  TaskStatus,
  UnknownResolution,
} from '@/services/api';

export interface DocPreviewCacheItem {
  url: string | null;
  text: string | null;
  docxBuffer: ArrayBuffer | null;
  error: string | null;
}

// =============================================================================
// State
// =============================================================================

interface AppState {
  // --- Documents ---
  documents: DocumentItem[];
  projects: ProjectItem[];
  folders: FolderItem[];
  currentProjectId: string | null;
  currentDocumentId: string | null;
  documentsLoading: boolean;
  treeLoaded: boolean;
  docMgmtSelectedNodeId: string | null;
  docMgmtSelectedDocId: string | null;
  docMgmtPreviewCache: Record<string, DocPreviewCacheItem>;

  // --- Tasks ---
  currentTaskId: string | null;
  currentTask: TaskItem | null;
  taskStatus: TaskStatus | null;
  taskResult: Record<string, unknown> | null;
  taskError: string | null;

  // --- Pipeline context ---
  taskProjectId: string | null; // project ID khi task chạy
  activeAgentType: 'agent1' | 'agent2' | 'agent3' | null;
  agent1Result: Record<string, unknown> | null; // kết quả Agent 1 riêng, không bị ghi đè bởi Agent 2

  // --- History: active task per agent (cross-page shared state) ---
  agent1ActiveTaskId: string | null;
  agent2ActiveTaskId: string | null;
  agent3ActiveTaskId: string | null;

  // --- SSE / Progress ---
  sseLogs: string[];
  sseActive: boolean;
  sseTokenCount: number;
  sseStartTime: number | null;

  // --- UI State ---
  activeTab: string;

  // --- Actions: Documents ---
  fetchDocuments: (projectId?: string | null) => Promise<void>;
  fetchTree: () => Promise<void>;
  upsertProject: (project: ProjectItem) => void;
  removeProject: (projectId: string) => void;
  upsertFolder: (folder: FolderItem) => void;
  removeFolder: (folderId: string) => void;
  upsertDocument: (document: DocumentItem) => void;
  removeDocument: (documentId: string) => void;
  setDocMgmtSelection: (nodeId: string | null, docId: string | null) => void;
  setDocMgmtPreviewCache: (documentId: string, value: DocPreviewCacheItem) => void;
  clearDocMgmtPreviewCache: (documentId: string) => void;
  setCurrentProject: (id: string | null) => void;
  setCurrentDocument: (id: string | null) => void;

  // --- Actions: Workflows ---
  runExtractFlows: (projectId: string, documentIds: string[], feedbackPrompt?: string) => Promise<void>;
  runGenerateTestcases: (sourceTaskId: string) => Promise<void>;
  runGenerateAutomation: (sourceTaskId: string) => Promise<void>;
  resolveUnknowns: (resolutions: UnknownResolution[]) => Promise<void>;
  notifyAgent2Started: (taskId: string, projectId: string) => void;
  notifyAgent2Completed: (projectId: string, taskId?: string) => void;
  notifyAgent3Completed: (taskId: string) => void;
  setAgentActiveTask: (agent: 'agent1' | 'agent2' | 'agent3', taskId: string | null) => void;

  // --- Actions: SSE ---
  startSSE: (taskId: string) => void;
  stopSSE: () => void;

  // --- Actions: Task result ---
  setTaskResult: (result: Record<string, unknown>) => void;
  setCurrentTaskId: (taskId: string | null) => void;
  fetchTaskResult: (taskId: string) => Promise<void>;
  clearTaskState: () => void;
  restoreAgent1Session: (
    result: Record<string, unknown>,
    taskId: string,
    projectId: string,
  ) => void;
  restoreAgent2Session: (taskId: string, projectId: string) => void;
  restoreAgent3Session: (taskId: string, projectId: string) => void;
  restoreAllSessions: () => Promise<void>;

  // --- Actions: UI ---
  setActiveTab: (tab: string) => void;
}

// =============================================================================
// SSE controller (singleton)
// =============================================================================

let sseAbort: AbortController | null = null;

// =============================================================================
// Store
// =============================================================================

export const useAppStore = create<AppState>((set, get) => ({
  // --- Initial state ---
  documents: [],
  projects: [],
  folders: [],
  currentProjectId: localStorage.getItem('currentProjectId'),
  currentDocumentId: null,
  documentsLoading: false,
  treeLoaded: false,
  docMgmtSelectedNodeId: null,
  docMgmtSelectedDocId: null,
  docMgmtPreviewCache: {},

  currentTaskId: null,
  currentTask: null,
  taskStatus: null,
  taskResult: null,
  taskError: null,

  taskProjectId: null,
  activeAgentType: null,
  agent1Result: null,

  agent1ActiveTaskId: null,
  agent2ActiveTaskId: null,
  agent3ActiveTaskId: null,

  sseLogs: [],
  sseActive: false,
  sseTokenCount: 0,
  sseStartTime: null,

  activeTab: 'documents',

  // --- Documents ---

  fetchDocuments: async (projectId) => {
    const targetProjectId = projectId ?? get().currentProjectId;
    set({ documentsLoading: true });
    try {
      const res = await api.listDocuments({ projectId: targetProjectId ?? undefined });
      set({ documents: res.data, documentsLoading: false });
    } catch {
      set({ documentsLoading: false });
    }
  },

  fetchTree: async () => {
    set({ documentsLoading: true });
    try {
      const res = await api.getDocumentTree();
      const projectId = get().currentProjectId || res.data.projects[0]?.project_id || null;
      if (projectId) {
        localStorage.setItem('currentProjectId', projectId);
      }
      set({
        projects: res.data.projects,
        folders: res.data.folders,
        currentProjectId: projectId,
        documents: res.data.documents,
        documentsLoading: false,
        treeLoaded: true,
      });
    } catch {
      set({ documentsLoading: false });
    }
  },

  upsertProject: (project) =>
    set((state) => {
      const idx = state.projects.findIndex((p) => p.project_id === project.project_id);
      if (idx >= 0) {
        const next = [...state.projects];
        next[idx] = project;
        return { projects: next };
      }
      return { projects: [...state.projects, project] };
    }),

  removeProject: (projectId) =>
    set((state) => {
      const folderIds = new Set(
        state.folders.filter((f) => f.project_id === projectId).map((f) => f.folder_id),
      );
      const removedDocIds = state.documents
        .filter((d) => d.project_id === projectId || (d.folder_id && folderIds.has(d.folder_id)))
        .map((d) => d.document_id);

      const nextPreviewCache = { ...state.docMgmtPreviewCache };
      removedDocIds.forEach((id) => {
        delete nextPreviewCache[id];
      });

      return {
        projects: state.projects.filter((p) => p.project_id !== projectId),
        folders: state.folders.filter((f) => f.project_id !== projectId),
        documents: state.documents.filter((d) => d.project_id !== projectId),
        docMgmtPreviewCache: nextPreviewCache,
        docMgmtSelectedNodeId:
          state.docMgmtSelectedNodeId === `project:${projectId}`
            ? null
            : state.docMgmtSelectedNodeId,
        docMgmtSelectedDocId:
          state.docMgmtSelectedDocId && removedDocIds.includes(state.docMgmtSelectedDocId)
            ? null
            : state.docMgmtSelectedDocId,
      };
    }),

  upsertFolder: (folder) =>
    set((state) => {
      const idx = state.folders.findIndex((f) => f.folder_id === folder.folder_id);
      if (idx >= 0) {
        const next = [...state.folders];
        next[idx] = folder;
        return { folders: next };
      }
      return { folders: [...state.folders, folder] };
    }),

  removeFolder: (folderId) =>
    set((state) => {
      const descendants = new Set<string>();
      const collect = (targetId: string) => {
        descendants.add(targetId);
        state.folders.filter((f) => f.parent_id === targetId).forEach((f) => collect(f.folder_id));
      };
      collect(folderId);

      const removedDocIds = state.documents
        .filter((d) => d.folder_id && descendants.has(d.folder_id))
        .map((d) => d.document_id);
      const nextPreviewCache = { ...state.docMgmtPreviewCache };
      removedDocIds.forEach((id) => {
        delete nextPreviewCache[id];
      });

      return {
        folders: state.folders.filter((f) => !descendants.has(f.folder_id)),
        documents: state.documents.filter((d) => !(d.folder_id && descendants.has(d.folder_id))),
        docMgmtPreviewCache: nextPreviewCache,
        docMgmtSelectedNodeId:
          state.docMgmtSelectedNodeId &&
          Array.from(descendants).some((id) => state.docMgmtSelectedNodeId === `folder:${id}`)
            ? null
            : state.docMgmtSelectedNodeId,
        docMgmtSelectedDocId:
          state.docMgmtSelectedDocId && removedDocIds.includes(state.docMgmtSelectedDocId)
            ? null
            : state.docMgmtSelectedDocId,
      };
    }),

  upsertDocument: (document) =>
    set((state) => {
      const idx = state.documents.findIndex((d) => d.document_id === document.document_id);
      if (idx >= 0) {
        const next = [...state.documents];
        next[idx] = document;
        return { documents: next };
      }
      return { documents: [...state.documents, document] };
    }),

  removeDocument: (documentId) =>
    set((state) => {
      const nextPreviewCache = { ...state.docMgmtPreviewCache };
      delete nextPreviewCache[documentId];
      return {
        documents: state.documents.filter((d) => d.document_id !== documentId),
        docMgmtPreviewCache: nextPreviewCache,
        docMgmtSelectedNodeId:
          state.docMgmtSelectedNodeId === `file:${documentId}` ? null : state.docMgmtSelectedNodeId,
        docMgmtSelectedDocId:
          state.docMgmtSelectedDocId === documentId ? null : state.docMgmtSelectedDocId,
      };
    }),

  setDocMgmtSelection: (nodeId, docId) =>
    set({ docMgmtSelectedNodeId: nodeId, docMgmtSelectedDocId: docId }),

  setDocMgmtPreviewCache: (documentId, value) =>
    set((state) => ({
      docMgmtPreviewCache: {
        ...state.docMgmtPreviewCache,
        [documentId]: value,
      },
    })),

  clearDocMgmtPreviewCache: (documentId) =>
    set((state) => {
      const next = { ...state.docMgmtPreviewCache };
      delete next[documentId];
      return { docMgmtPreviewCache: next };
    }),

  setCurrentProject: (id) => {
    const current = get().currentProjectId;
    // Không reset nếu không đổi project
    if (current === id) return;

    // Dừng SSE nếu đang chạy
    if (sseAbort) {
      sseAbort.abort();
      sseAbort = null;
    }

    // Xóa session state phía backend (fire-and-forget)
    api.deleteSessionState('flow_analysis', current).catch(() => {});

    if (id) localStorage.setItem('currentProjectId', id);
    else localStorage.removeItem('currentProjectId');

    set({
      currentProjectId: id,
      // Reset pipeline state
      currentTaskId: null,
      currentTask: null,
      taskStatus: null,
      taskResult: null,
      taskError: null,
      taskProjectId: null,
      activeAgentType: null,
      agent1Result: null,
      agent1ActiveTaskId: null,
      agent2ActiveTaskId: null,
      agent3ActiveTaskId: null,
      sseLogs: [],
      sseActive: false,
      sseTokenCount: 0,
      sseStartTime: null,
      // Reset doc selection
      docMgmtSelectedNodeId: null,
      docMgmtSelectedDocId: null,
      currentDocumentId: null,
    });
  },

  setCurrentDocument: (id) => set({ currentDocumentId: id }),

  // --- Workflow: Agent 1 ---

  runExtractFlows: async (projectId: string, documentIds: string[], feedbackPrompt?: string) => {
    const res = await api.extractFlows({
      project_id: projectId,
      document_ids: documentIds,
      ...(feedbackPrompt?.trim() ? { feedback_prompt: feedbackPrompt.trim() } : {}),
    });

    try {
      await api.saveSessionState('flow_analysis', {
        selectedDocIds: documentIds,
        taskId: res.task_id,
        metadata: {
          lastRunAt: new Date().toISOString(),
          docCount: documentIds.length,
          projectId: projectId || undefined,
        },
      });
    } catch (e) {
      console.error('Failed to save session state:', e);
    }

    set({
      currentTaskId: res.task_id,
      taskStatus: res.status,
      taskProjectId: projectId || get().currentProjectId,
      activeAgentType: 'agent1',
      agent1Result: null, // clear kết quả Agent 1 cũ
      sseLogs: [],
      taskError: null,
      taskResult: null,
      sseTokenCount: 0,
      sseStartTime: null,
    });
    get().startSSE(res.task_id);
  },

  // --- Workflow: Agent 2 ---

  runGenerateTestcases: async (sourceTaskId: string) => {
    const projectId = get().currentProjectId;
    const res = await api.generateTestcases({ task_id: sourceTaskId });
    set({
      currentTaskId: res.task_id,
      taskStatus: res.status,
      taskProjectId: projectId,
      activeAgentType: 'agent2',
      sseLogs: [],
      taskError: null,
      taskResult: null,
      sseTokenCount: 0,
      sseStartTime: null,
    });
    get().startSSE(res.task_id);
  },

  // --- Workflow: Agent 3 ---

  runGenerateAutomation: async (sourceTaskId: string) => {
    const res = await api.generateAutomation({ task_id: sourceTaskId });
    set({
      currentTaskId: res.task_id,
      taskStatus: res.status,
      sseLogs: [],
      taskError: null,
      taskResult: null,
      sseTokenCount: 0,
      sseStartTime: null,
    });
    get().startSSE(res.task_id);
  },

  // --- Resolve Unknowns ---

  resolveUnknowns: async (resolutions: UnknownResolution[]) => {
    const taskId = get().currentTaskId;
    if (!taskId) return;
    try {
      await api.resolveUnknowns({ task_id: taskId, resolutions });
      // Re-start SSE to get updated result
      get().startSSE(taskId);
    } catch (e: unknown) {
      set({
        taskError: e instanceof Error ? e.message : 'Failed to resolve unknowns',
      });
    }
  },

  // Bridge: called by TestScenarios page (which manages its own SSE) to sync store state
  notifyAgent2Started: (taskId, projectId) =>
    set({
      currentTaskId: taskId,
      taskStatus: 'processing',
      taskProjectId: projectId,
      activeAgentType: 'agent2',
      taskResult: null,
      taskError: null,
    }),

  notifyAgent2Completed: (projectId, taskId) =>
    set({
      taskStatus: 'completed',
      taskProjectId: projectId,
      activeAgentType: 'agent2',
      sseActive: false,
      ...(taskId ? { agent2ActiveTaskId: taskId } : {}),
    }),

  notifyAgent3Completed: (taskId) =>
    set({
      agent3ActiveTaskId: taskId,
    }),

  setAgentActiveTask: (agent, taskId) =>
    set(
      agent === 'agent1'
        ? { agent1ActiveTaskId: taskId }
        : agent === 'agent2'
          ? { agent2ActiveTaskId: taskId }
          : { agent3ActiveTaskId: taskId }
    ),

  // --- SSE ---

  startSSE: (taskId: string) => {
    if (sseAbort) sseAbort.abort();

    // Capture at call time — not inside the async callback — to avoid TOCTOU
    // where activeAgentType could point to a different agent by the time the event arrives.
    const capturedAgentType = get().activeAgentType;
    const capturedTaskId = taskId;

    const startTime = Date.now();
    set({ sseStartTime: startTime, sseTokenCount: 0 });

    sseAbort = api.subscribeTaskSSE(taskId, {
      onProgress: (event) => {
        const log = event.data.log ?? event.data.step ?? '';
        set((s) => ({
          sseLogs: [...s.sseLogs.slice(-200), log],
          sseActive: true,
          sseTokenCount: s.sseTokenCount + 1,
        }));
      },
      onCompleted: (event) => {
        set({
          taskResult: event.data,
          taskStatus: 'completed',
          sseActive: false,
          ...(capturedAgentType === 'agent1'
            ? { agent1Result: event.data, agent1ActiveTaskId: capturedTaskId }
            : {}),
          ...(capturedAgentType === 'agent2' ? { agent2ActiveTaskId: capturedTaskId } : {}),
          ...(capturedAgentType === 'agent3' ? { agent3ActiveTaskId: capturedTaskId } : {}),
        });
      },
      onError: (event) => {
        set({
          taskError: event.data.message,
          taskStatus: 'failed',
          sseActive: false,
        });
      },
    });

    set({ sseActive: true, sseLogs: [] });
  },

  stopSSE: () => {
    if (sseAbort) {
      sseAbort.abort();
      sseAbort = null;
    }
    set({ sseActive: false });
  },

  // --- Task helpers ---

  setTaskResult: (result) => set({ taskResult: result }),
  setCurrentTaskId: (taskId) => set({ currentTaskId: taskId }),

  fetchTaskResult: async (taskId: string) => {
    try {
      const task = await api.getTaskStatus(taskId);
      if (task.result) {
        set({
          taskResult: task.result as unknown as Record<string, unknown>,
          taskStatus: task.status,
        });
      }
    } catch {
      // silent
    }
  },

  clearTaskState: () =>
    set({
      currentTaskId: null,
      currentTask: null,
      taskStatus: null,
      taskResult: null,
      taskError: null,
      taskProjectId: null,
      activeAgentType: null,
      agent1Result: null,
      sseLogs: [],
      sseActive: false,
      sseTokenCount: 0,
      sseStartTime: null,
    }),

  restoreAgent1Session: (result, taskId, projectId) =>
    set({
      taskResult: result,
      agent1Result: result,
      currentTaskId: taskId,
      taskStatus: 'completed',
      taskProjectId: projectId,
      activeAgentType: 'agent1',
      agent1ActiveTaskId: taskId,
    }),

  restoreAgent2Session: (taskId, projectId) =>
    set({
      currentTaskId: taskId,
      taskStatus: 'completed',
      taskProjectId: projectId,
      activeAgentType: 'agent2',
      agent2ActiveTaskId: taskId,
    }),

  restoreAgent3Session: (taskId, projectId) =>
    set({
      currentTaskId: taskId,
      taskStatus: 'completed',
      taskProjectId: projectId,
      activeAgentType: 'agent3',
      agent3ActiveTaskId: taskId,
    }),

  restoreAllSessions: async () => {
    const projectId = get().currentProjectId ?? '';
    try {
      const s1 = await api.getSessionState('flow_analysis', projectId);
      if (s1?.taskId) {
        const t1 = await api.getTaskStatus(s1.taskId);
        if (t1?.status === 'completed' && t1.result) {
          get().restoreAgent1Session(
            t1.result as Record<string, unknown>,
            s1.taskId,
            projectId,
          );
        }
      }
    } catch { /* no session */ }

    try {
      const s2 = await api.getSessionState('test_scenarios', projectId);
      if (s2?.taskId) {
        const t2 = await api.getTaskStatus(s2.taskId);
        if (t2?.status === 'completed') get().restoreAgent2Session(s2.taskId, projectId);
      }
    } catch { /* no session */ }

    try {
      const s3 = await api.getSessionState('yaml_export', projectId);
      if (s3?.taskId) {
        const t3 = await api.getTaskStatus(s3.taskId);
        if (t3?.status === 'completed') get().restoreAgent3Session(s3.taskId, projectId);
      }
    } catch { /* no session */ }
  },

  // --- UI ---

  setActiveTab: (tab) => set({ activeTab: tab }),
}));
