jest.mock('../../src/services/WorkflowService', () => ({
  getTaskStatus: jest.fn(),
  getTaskPartialTestcases: jest.fn(),
}));

const WorkflowController = require('../../src/controllers/WorkflowController');
const WorkflowService = require('../../src/services/WorkflowService');


const createReq = () => {
  const listeners = {};
  return {
    params: { task_id: 'task-1' },
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
    listeners,
  };
};

const createRes = () => {
  const writes = [];
  return {
    writes,
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk) => {
      writes.push(chunk);
    }),
    end: jest.fn(),
  };
};

describe('WorkflowController.streamStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('streams progress, partial testcases, and completion payloads', async () => {
    WorkflowService.getTaskStatus
      .mockResolvedValueOnce({ id: 'task-1', type: 'generate-testcases', status: 'processing' })
      .mockResolvedValueOnce({
        id: 'task-1',
        type: 'generate-testcases',
        status: 'completed',
        result: { scenarios: [{ id: 'TC_1' }] },
      });
    WorkflowService.getTaskPartialTestcases
      .mockResolvedValueOnce({ artifacts: [{ id: 'artifact-1' }], testcases: [{ id: 'tc-1' }], nextOffset: 1 })
      .mockResolvedValueOnce({ artifacts: [{ id: 'artifact-2' }], testcases: [{ id: 'tc-2' }], nextOffset: 2 });

    const req = createReq();
    const res = createRes();

    await WorkflowController.streamStatus(req, res, jest.fn());
    await jest.advanceTimersByTimeAsync(4000);

    const output = res.writes.join('');
    expect(output).toContain('event: progress');
    expect(output).toContain('event: partial');
    expect(output).toContain('"artifacts":[{"id":"artifact-1"}]');
    expect(output).toContain('"artifacts":[{"id":"artifact-2"}]');
    expect(output).toContain('"testcases":[{"id":"tc-1"}]');
    expect(output).toContain('"testcases":[{"id":"tc-2"}]');
    expect(output).toContain('event: completed');
    expect(res.end).toHaveBeenCalled();
  });

  test('streams task-not-found errors and closes the connection', async () => {
    WorkflowService.getTaskStatus.mockResolvedValue(null);

    const req = createReq();
    const res = createRes();

    await WorkflowController.streamStatus(req, res, jest.fn());
    await jest.advanceTimersByTimeAsync(2000);

    const output = res.writes.join('');
    expect(output).toContain('event: error');
    expect(output).toContain('Task not found');
    expect(res.end).toHaveBeenCalled();
  });

  test('streams failed task errors with the backend error message', async () => {
    WorkflowService.getTaskStatus.mockResolvedValue({
      id: 'task-1',
      type: 'generate-automation',
      status: 'failed',
      error: 'Agent 3 crashed',
    });

    const req = createReq();
    const res = createRes();

    await WorkflowController.streamStatus(req, res, jest.fn());
    await jest.advanceTimersByTimeAsync(2000);

    const output = res.writes.join('');
    expect(output).toContain('event: error');
    expect(output).toContain('Agent 3 crashed');
    expect(res.end).toHaveBeenCalled();
  });
});
