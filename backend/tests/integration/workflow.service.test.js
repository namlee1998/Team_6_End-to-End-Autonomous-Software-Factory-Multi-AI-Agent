jest.mock('uuid', () => ({
  v4: jest.fn(() => 'generated-task-id'),
}));

jest.mock('../../src/models', () => ({
  Task: {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdWithDocument: jest.fn(),
    findLatestByProject: jest.fn(),
    update: jest.fn(),
  },
  Document: {
    findById: jest.fn(),
  },
  Testcase: {
    findByTaskId: jest.fn(),
  },
  AgentArtifact: {
    bulkUpsert: jest.fn(),
    findByTaskId: jest.fn(),
    findByTaskIdAndType: jest.fn(),
    deleteByTaskId: jest.fn(),
  },
}));

jest.mock('../../src/services/DocumentService', () => ({
  getContent: jest.fn(),
}));

jest.mock('../../src/services/AgentService', () => ({
  runAgent: jest.fn(),
  resolveUnknowns: jest.fn(),
}));

jest.mock('../../src/services/MembershipService', () => ({
  requireProjectRole: jest.fn(),
}));

const { EventEmitter } = require('events');
const WorkflowService = require('../../src/services/WorkflowService');
const AgentService = require('../../src/services/AgentService');
const MembershipService = require('../../src/services/MembershipService');
const { Task, Document, AgentArtifact } = require('../../src/models');


const emitCompletedStream = (stream, data) => {
  stream.emit('data', Buffer.from(`event: completed\ndata: ${JSON.stringify(data)}\n\n`));
  stream.emit('end');
};

const waitForAsyncListeners = () => new Promise((resolve) => setImmediate(resolve));

describe('WorkflowService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    Task.update.mockResolvedValue({});
    AgentArtifact.bulkUpsert.mockResolvedValue([]);
  });

  test('extractFlows creates a pending task and schedules agent 1 execution', async () => {
    Task.create.mockResolvedValue({
      id: 'generated-task-id',
      projectId: 'project-1',
      type: 'extract-flows',
      status: 'pending',
    });

    const runner = jest
      .spyOn(WorkflowService, '_runAgent1Extraction')
      .mockResolvedValue(undefined);

    const task = await WorkflowService.extractFlows({
      projectId: 'project-1',
      documentIds: ['doc-1'],
      promptProfile: 'fixture-profile',
    });

    expect(Task.create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'generated-task-id',
      projectId: 'project-1',
      type: 'extract-flows',
      status: 'pending',
      promptProfile: 'fixture-profile',
      versionStatus: 'draft',
    }));
    expect(runner).toHaveBeenCalledWith(task, ['doc-1'], '', undefined);
    expect(task.status).toBe('pending');
  });

  test('getTaskStatus attaches persisted testcases to the task', async () => {
    Task.findByIdWithDocument.mockResolvedValue({
      id: 'task-1',
      status: 'completed',
      type: 'generate-testcases',
    });
    AgentArtifact.findByTaskId.mockResolvedValue([
      {
        id: 'artifact-1',
        taskId: 'task-1',
        projectId: 'project-1',
        artifactType: 'scenario',
        title: 'Scenario 1',
        contentJson: { id: 'TC_1', name: 'Scenario 1', flow_name: 'Flow A', feature_name: 'Feature A' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const task = await WorkflowService.getTaskStatus('task-1');

    expect(task.artifacts).toHaveLength(1);
    expect(task.testcases).toEqual([
      expect.objectContaining({
        id: 'artifact-1',
        scenarioData: { id: 'TC_1', name: 'Scenario 1', flow_name: 'Flow A', feature_name: 'Feature A' },
      }),
    ]);
  });

  test('getTaskPartialTestcases returns only rows after the provided offset', async () => {
    Task.findById.mockResolvedValue({ id: 'task-1', type: 'generate-testcases', projectId: 'project-1' });
    AgentArtifact.findByTaskIdAndType.mockResolvedValue([
      { id: 'a-1', taskId: 'task-1', projectId: 'project-1', artifactType: 'scenario', contentJson: { id: 'TC_1' } },
      { id: 'a-2', taskId: 'task-1', projectId: 'project-1', artifactType: 'scenario', contentJson: { id: 'TC_2' } },
      { id: 'a-3', taskId: 'task-1', projectId: 'project-1', artifactType: 'scenario', contentJson: { id: 'TC_3' } },
    ]);

    const result = await WorkflowService.getTaskPartialTestcases('task-1', 1);

    expect(result.artifacts).toEqual([
      expect.objectContaining({ id: 'a-2' }),
      expect.objectContaining({ id: 'a-3' }),
    ]);
    expect(result.testcases).toHaveLength(2);
    expect(result.nextOffset).toBe(3);
  });

  test('generateTestcases rejects non extract-flows source tasks', async () => {
    Task.findById.mockResolvedValue({
      id: 'task-source',
      type: 'generate-automation',
    });

    await expect(
      WorkflowService.generateTestcases({ taskId: 'task-source' }),
    ).rejects.toThrow('Source task must be an extract-flows task');
  });

  test('generateAutomation rejects non testcase source tasks', async () => {
    Task.findById.mockResolvedValue({
      id: 'task-source',
      type: 'extract-flows',
    });

    await expect(
      WorkflowService.generateAutomation({ taskId: 'task-source', framework: 'appium' }),
    ).rejects.toThrow('Source task must be a generate-testcases task');
  });

  test('getLatestCompletedTask checks access on the document project', async () => {
    const user = { id: 'user-1' };
    const latestTask = { id: 'task-latest', projectId: 'project-1', status: 'completed' };
    Document.findById.mockResolvedValue({ id: 'doc-1', projectId: 'project-1' });
    MembershipService.requireProjectRole.mockResolvedValue({ role: 'viewer' });
    Task.findLatestByProject.mockResolvedValue(latestTask);

    await expect(
      WorkflowService.getLatestCompletedTask('doc-1', 'extract-flows', user),
    ).resolves.toBe(latestTask);

    expect(MembershipService.requireProjectRole).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      ['owner', 'admin', 'editor', 'viewer'],
    );
    expect(Task.findLatestByProject).toHaveBeenCalledWith('project-1', 'extract-flows', 'completed', 'committed');
  });

  test('agent 2 preserves scenarios when agent returns duplicate scenario IDs', async () => {
    const stream = new EventEmitter();
    AgentService.runAgent.mockResolvedValue({ data: stream });
    AgentArtifact.findByTaskIdAndType
      .mockResolvedValueOnce([
        {
          id: 'flow-artifact-1',
          artifactType: 'flow',
          contentJson: { flowName: 'Login', source: 'Auth', steps: ['Open login'] },
        },
        {
          id: 'flow-artifact-2',
          artifactType: 'flow',
          contentJson: { flowName: 'Register', source: 'Auth', steps: ['Open register'] },
        },
      ])
      .mockResolvedValueOnce([
        { id: 'scenario-artifact-1', artifactType: 'scenario', contentJson: { id: 'TC_001', flow_name: 'Login' } },
        { id: 'scenario-artifact-2', artifactType: 'scenario', contentJson: { id: 'TC_001', flow_name: 'Register' } },
      ]);

    await WorkflowService._runAgent2Generation(
      { id: 'task-agent-2', projectId: 'project-1' },
      { id: 'source-task-1', result: { feature_name: 'Auth' } },
    );

    emitCompletedStream(stream, {
      feature_name: 'Auth',
      scenarios: [
        { id: 'TC_001', name: 'Login works', flow_name: 'Login', feature_name: 'Auth' },
        { id: 'TC_001', name: 'Register works', flow_name: 'Register', feature_name: 'Auth' },
      ],
      markdown: 'two scenarios',
    });
    await waitForAsyncListeners();

    const scenarioRecords = AgentArtifact.bulkUpsert.mock.calls
      .map(([records]) => records)
      .find((records) => records?.every((record) => record.artifactType === 'scenario'));
    expect(scenarioRecords).toHaveLength(2);
    expect(scenarioRecords.map((record) => record.contentJson.flow_name)).toEqual(['Login', 'Register']);
    expect(new Set(scenarioRecords.map((record) => record.artifactKey)).size).toBe(2);
  });

  test('agent 3 preserves YAML files when agent returns duplicate filenames', async () => {
    const stream = new EventEmitter();
    AgentService.runAgent.mockResolvedValue({ data: stream });
    AgentArtifact.findByTaskIdAndType
      .mockResolvedValueOnce([
        {
          id: 'scenario-artifact-1',
          artifactType: 'scenario',
          contentJson: { id: 'TC_001', name: 'Login works', flow_name: 'Login', steps: [] },
        },
        {
          id: 'scenario-artifact-2',
          artifactType: 'scenario',
          contentJson: { id: 'TC_002', name: 'Register works', flow_name: 'Register', steps: [] },
        },
      ])
      .mockResolvedValueOnce([
        { id: 'yaml-artifact-1', artifactType: 'yaml', contentJson: { filename: 'TC_001.yaml' }, contentText: 'name: login' },
        { id: 'yaml-artifact-2', artifactType: 'yaml', contentJson: { filename: 'TC_001.yaml' }, contentText: 'name: register' },
      ]);

    await WorkflowService._runAgent3Automation(
      { id: 'task-agent-3', projectId: 'project-1' },
      { id: 'source-task-2', result: { feature_name: 'Auth' } },
      'Mobile Auto Platform',
    );

    emitCompletedStream(stream, {
      yaml_files: [
        { filename: 'TC_001.yaml', content: 'name: login' },
        { filename: 'TC_001.yaml', content: 'name: register' },
      ],
      summary: 'two files',
    });
    await waitForAsyncListeners();

    const yamlRecords = AgentArtifact.bulkUpsert.mock.calls
      .map(([records]) => records)
      .find((records) => records?.every((record) => record.artifactType === 'yaml'));
    expect(yamlRecords).toHaveLength(2);
    expect(yamlRecords.map((record) => record.contentText)).toEqual(['name: login', 'name: register']);
    expect(new Set(yamlRecords.map((record) => record.artifactKey)).size).toBe(2);
  });
});
