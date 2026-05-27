import { useMemo } from 'react';
import * as api from '@/services/api';

export function useApiActions() {
  return useMemo(
    () => ({
      createProject: api.createProject,
      createFolder: api.createFolder,
      createTaskEventSource: api.createTaskEventSource,
      deleteDocument: api.deleteDocument,
      deleteFolder: api.deleteFolder,
      deleteProject: api.deleteProject,
      deleteSessionState: api.deleteSessionState,
      deleteTask: api.deleteTask,
      generateAutomation: api.generateAutomation,
      generateTestcases: api.generateTestcases,
      getDocument: api.getDocument,
      getDocumentContent: api.getDocumentContent,
      getDocumentPreview: api.getDocumentPreview,
      getSessionState: api.getSessionState,
      getTaskStatus: api.getTaskStatus,
      listWorkflowTasks: api.listWorkflowTasks,
      moveDocument: api.moveDocument,
      moveFolder: api.moveFolder,
      renameDocument: api.renameDocument,
      renameFolder: api.renameFolder,
      renameProject: api.renameProject,
      saveSessionState: api.saveSessionState,
      subscribeTaskSSE: api.subscribeTaskSSE,
      uploadDocument: api.uploadDocument,
    }),
    [],
  );
}
