const mockTable = {
  select: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  from: jest.fn(() => mockTable),
}));

const supabase = require('../../src/config/database');
const SessionState = require('../../src/models/SessionState');

describe('SessionState model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTable.select.mockReturnValue(mockTable);
    mockTable.update.mockReturnValue(mockTable);
    mockTable.delete.mockReturnValue(mockTable);
    mockTable.eq.mockReturnValue(mockTable);
    mockTable.single.mockReturnValue(mockTable);
  });

  test('removeDocIds updates and deletes project-scoped session states', async () => {
    const rows = [
      {
        id: 'state-keep',
        page: 'flow_analysis',
        user_id: 'user-1',
        project_id: 'project-1',
        selected_doc_ids: ['doc-1', 'doc-2'],
        task_id: 'task-1',
        metadata: {},
      },
      {
        id: 'state-delete',
        page: 'flow_analysis',
        user_id: 'user-2',
        project_id: 'project-1',
        selected_doc_ids: ['doc-1'],
        task_id: 'task-2',
        metadata: {},
      },
      {
        id: 'state-untouched',
        page: 'flow_analysis',
        user_id: 'user-3',
        project_id: 'project-1',
        selected_doc_ids: ['doc-3'],
        task_id: 'task-3',
        metadata: {},
      },
    ];

    mockTable.eq.mockImplementation((_column, value) => {
      if (value === 'project-1') return Promise.resolve({ data: rows, error: null });
      return mockTable;
    });

    const updates = [];
    mockTable.update.mockImplementation((payload) => {
      updates.push(payload);
      return mockTable;
    });
    mockTable.single.mockResolvedValue({
      data: { ...rows[0], selected_doc_ids: ['doc-2'] },
      error: null,
    });

    await SessionState.removeDocIds(['doc-1'], { projectId: 'project-1' });

    expect(supabase.from).toHaveBeenCalledWith('session_states');
    expect(mockTable.eq).toHaveBeenCalledWith('project_id', 'project-1');
    expect(updates).toEqual([
      expect.objectContaining({ selected_doc_ids: ['doc-2'] }),
    ]);
    expect(mockTable.delete).toHaveBeenCalledTimes(1);
    expect(mockTable.eq).toHaveBeenCalledWith('id', 'state-delete');
  });
});
