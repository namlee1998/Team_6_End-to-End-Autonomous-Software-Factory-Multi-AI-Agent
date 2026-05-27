import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import { useWorkflowState } from '@/hooks/useWorkflowState';
import { useAppStore } from '@/store';


const resetStore = () => {
  useAppStore.setState({
    documents: [],
    projects: [],
    folders: [],
    currentProjectId: null,
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
    sseLogs: [],
    sseActive: false,
    sseTokenCount: 0,
    sseStartTime: null,
    activeTab: 'documents',
  });
};

describe('useWorkflowState', () => {
  beforeEach(() => {
    resetStore();
  });

  test('derives locked and available steps from the current store state', async () => {
    act(() => {
      useAppStore.setState({
        currentProjectId: 'project-1',
        documents: [
          {
            document_id: 'doc-1',
            project_id: 'project-1',
            file_name: 'PRD.md',
            file_type: 'md',
            file_size: 100,
            status: 'processed',
            created_at: '2026-01-01',
          },
        ],
        agent1Result: {
          flows: [{ flowName: 'Add Transaction', source: 'Transaction > Add', steps: ['Open'] }],
        },
        taskProjectId: 'project-1',
        taskStatus: 'completed',
        taskResult: { testcases: [{ id: 'tc-1' }] },
        activeAgentType: 'agent2',
      });
    });

    const { result } = renderHook(() => useWorkflowState());

    await waitFor(() => {
      expect(result.current.steps.map((step) => step.status)).toEqual([
        'done',
        'done',
        'done',
        'available',
      ]);
    });
  });

  test('resets active step when the project changes', async () => {
    act(() => {
      useAppStore.setState({
        currentProjectId: 'project-1',
        documents: [
          {
            document_id: 'doc-1',
            project_id: 'project-1',
            file_name: 'PRD.md',
            file_type: 'md',
            file_size: 100,
            status: 'processed',
            created_at: '2026-01-01',
          },
        ],
      });
    });

    const { result } = renderHook(() => useWorkflowState());

    act(() => {
      result.current.setActiveStep('flows');
    });
    expect(result.current.activeStep).toBe('flows');

    act(() => {
      useAppStore.setState({ currentProjectId: 'project-2' });
    });

    await waitFor(() => {
      expect(result.current.activeStep).toBe('documents');
    });
  });
});
