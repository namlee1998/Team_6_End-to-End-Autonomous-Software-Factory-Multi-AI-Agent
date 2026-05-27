import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/services/api', () => ({
  subscribeTaskSSE: vi.fn(),
  deleteSessionState: vi.fn().mockResolvedValue(undefined),
}));

describe('useAppStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  test('restores agent 1 session state into the store', async () => {
    const { useAppStore } = await import('@/store/useAppStore');

    useAppStore.getState().restoreAgent1Session({ flows: [] }, 'task-1', 'project-1');

    expect(useAppStore.getState().agent1Result).toEqual({ flows: [] });
    expect(useAppStore.getState().currentTaskId).toBe('task-1');
    expect(useAppStore.getState().taskStatus).toBe('completed');
    expect(useAppStore.getState().activeAgentType).toBe('agent1');
  });

  test('startSSE and stopSSE update progress state and abort active streams', async () => {
    const api = await import('@/services/api');
    const abort = vi.fn();
    let handlers: Parameters<typeof api.subscribeTaskSSE>[1] | undefined;

    vi.mocked(api.subscribeTaskSSE).mockImplementation((_taskId, nextHandlers) => {
      handlers = nextHandlers;
      return { abort } as unknown as AbortController;
    });

    const { useAppStore } = await import('@/store/useAppStore');

    useAppStore.setState({ activeAgentType: 'agent1' });
    useAppStore.getState().startSSE('task-1');
    handlers?.onProgress?.({ event: 'progress', data: { step: 'extract-flows', log: 'working' } });
    handlers?.onCompleted?.({ event: 'completed', data: { flows: [{ flowName: 'A' }] } });

    expect(useAppStore.getState().sseLogs).toEqual(['working']);
    expect(useAppStore.getState().taskStatus).toBe('completed');
    expect(useAppStore.getState().agent1Result).toEqual({ flows: [{ flowName: 'A' }] });

    useAppStore.getState().stopSSE();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().sseActive).toBe(false);
  });

  test('changing project clears workflow state and drops the existing SSE session', async () => {
    const api = await import('@/services/api');
    const abort = vi.fn();

    vi.mocked(api.subscribeTaskSSE).mockReturnValue({ abort } as unknown as AbortController);

    const { useAppStore } = await import('@/store/useAppStore');

    useAppStore.setState({
      currentProjectId: 'project-1',
      currentTaskId: 'task-1',
      taskStatus: 'processing',
      activeAgentType: 'agent2',
      taskResult: { scenarios: [] },
      agent1Result: { flows: [] },
      sseLogs: ['hello'],
      sseActive: true,
    });

    useAppStore.getState().startSSE('task-1');
    useAppStore.getState().setCurrentProject('project-2');

    expect(abort).toHaveBeenCalled();
    expect(api.deleteSessionState).toHaveBeenCalledWith('flow_analysis', 'project-1');
    expect(useAppStore.getState().currentProjectId).toBe('project-2');
    expect(useAppStore.getState().currentTaskId).toBeNull();
    expect(useAppStore.getState().agent1Result).toBeNull();
    expect(localStorage.getItem('currentProjectId')).toBe('project-2');
  });
});
