jest.mock('../../src/services/WorkflowService', () => ({
  extractFlows: jest.fn(),
  generateTestcases: jest.fn(),
  generateAutomation: jest.fn(),
  getTaskStatus: jest.fn(),
}));

jest.mock('../../src/middleware/quotaMiddleware', () => (_req, _res, next) => next());

const express = require('express');
const request = require('supertest');
const WorkflowService = require('../../src/services/WorkflowService');
const workflowsRouter = require('../../src/routes/workflows');


const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/workflows', workflowsRouter);
  app.use((error, _req, res, _next) => {
    res.status(500).json({ status: 'error', message: error.message });
  });
  return app;
};

describe('workflow routes', () => {
  test('POST /extract-flows returns 400 when document_ids is missing', async () => {
    const response = await request(createApp())
      .post('/workflows/extract-flows')
      .send({ project_id: 'project-1' });

    console.log(response.body); expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 'error',
      message: 'document_ids array is required',
    });
  });

  test('POST /extract-flows returns 400 when project_id is missing', async () => {
    const response = await request(createApp())
      .post('/workflows/extract-flows')
      .send({ document_ids: ['doc-1'] });

    console.log(response.body); expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 'error',
      message: 'project_id is required',
    });
  });

  test('POST endpoints return 202 with task ids for happy-path workflow starts', async () => {
    WorkflowService.extractFlows.mockResolvedValue({ id: 'task-1', status: 'pending' });
    WorkflowService.generateTestcases.mockResolvedValue({ id: 'task-2', status: 'pending' });
    WorkflowService.generateAutomation.mockResolvedValue({ id: 'task-3', status: 'pending' });

    const app = createApp();

    const extract = await request(app)
      .post('/workflows/extract-flows')
      .send({ project_id: 'project-1', document_ids: ['doc-1', 'doc-2'] });
    const testcases = await request(app)
      .post('/workflows/generate-testcases')
      .send({ task_id: 'task-source' });
    const automation = await request(app)
      .post('/workflows/generate-automation')
      .send({ task_id: 'task-source', framework: 'appium' });

    expect(extract.status).toBe(202);
    expect(extract.body).toEqual({ task_id: 'task-1', status: 'pending' });
    expect(testcases.status).toBe(202);
    expect(testcases.body).toEqual({ task_id: 'task-2', status: 'pending' });
    expect(automation.status).toBe(202);
    expect(automation.body).toEqual({ task_id: 'task-3', status: 'pending' });
  });

  test('GET /tasks/:task_id maps completed task payloads with result and testcases', async () => {
    WorkflowService.getTaskStatus.mockResolvedValue({
      id: 'task-9',
      type: 'generate-testcases',
      status: 'completed',
      result: { scenarios: [{ id: 'TC_1' }] },
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:05:00.000Z',
      artifacts: [{ id: 'artifact-1' }],
      testcases: [{ id: 'tc-db-1' }],
    });

    const response = await request(createApp()).get('/workflows/tasks/task-9');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'success',
      data: {
        task_id: 'task-9',
        type: 'generate-testcases',
        status: 'completed',
        result: { scenarios: [{ id: 'TC_1' }] },
        error: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:05:00.000Z',
        artifacts: [{ id: 'artifact-1' }],
        testcases: [{ id: 'tc-db-1' }],
      },
    });
  });

  test('GET /tasks/:task_id returns 404 when the task does not exist', async () => {
    WorkflowService.getTaskStatus.mockResolvedValue(null);

    const response = await request(createApp()).get('/workflows/tasks/unknown-task');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Task not found',
    });
  });
});
