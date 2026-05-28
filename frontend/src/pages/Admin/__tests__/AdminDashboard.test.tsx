import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboard } from '../AdminDashboard';
import { getAdminStats, getAdminFunnel } from '@/services/adminApi';

vi.mock('@/services/adminApi', () => ({
  getAdminStats: vi.fn(),
  getAdminFunnel: vi.fn(),
}));

const stats = {
  '7d': {
    id: 'snapshot-7d',
    snapshot_at: '2026-05-12T00:00:00.000Z',
    time_window: '7d',
    data: {
      total_users: 12,
      active_users: 5,
      quota_exceeded_users: 1,
      suspended_users: 0,
      users_by_plan: { free: 8, pro: 4 },
      total_runs: 20,
      successful_runs: 18,
      failed_runs: 2,
      total_credits: 44,
      runs_by_agent: { agent_1: 10 },
    },
  },
  live: {
    window: '7d',
    updatedAt: '2026-05-12T01:00:00.000Z',
    runsByAgent: {
      agent_1: {
        agentType: 'agent_1',
        label: 'Agent 1',
        total: 10,
        success: 9,
        failed: 1,
        failureRate: 10,
        successRate: 90,
      },
    },
    latencyByAgent: {
      agent_1: {
        agentType: 'agent_1',
        label: 'Agent 1',
        avg: 900,
        p95: 2000,
        max: 2500,
        sampleCount: 3,
      },
    },
    tokens: { input: 1000, output: 500, total: 1500 },
    credits: 7,
    activeProjects: 3,
    activeUsers: 6,
  },
  recentFailures: { rows: [], count: 0, limit: 10, offset: 0 },
  recentTraces: { rows: [], count: 0, limit: 10, offset: 0 },
  selectedWindow: '7d',
};

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminStats).mockResolvedValue(stats as never);
    vi.mocked(getAdminFunnel).mockResolvedValue({
      steps: [
        { agent: 'intent', label: 'Intent', count: 100, rate: 100 },
        { agent: 'po', label: 'PO', count: 80, rate: 80 },
        { agent: 'ux', label: 'UX', count: 60, rate: 75 },
        { agent: 'dev', label: 'DEV', count: 30, rate: 50 }
      ],
      overall_rate: 30
    } as never);
  });

  it('renders snapshot cards, live agent health, and empty states', async () => {
    render(<AdminDashboard />);

    await waitFor(() => expect(getAdminStats).toHaveBeenCalledWith('7d', {
      failuresLimit: 10,
      failuresOffset: 0,
      tracesLimit: 10,
      tracesOffset: 0,
    }));

    expect(screen.getByText('Total users')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('900 ms')).toBeInTheDocument();
    expect(screen.getByText('No failed agent runs in this window')).toBeInTheDocument();
    expect(screen.getByText('No traced agent runs in this window')).toBeInTheDocument();
  });

  it('renders trace links only when a trace URL exists', async () => {
    vi.mocked(getAdminStats).mockResolvedValue({
      ...stats,
      recentFailures: {
        rows: [
          {
            taskId: 'failed-task',
            projectId: 'project-1',
            type: 'extract-flows',
            label: 'Agent 1',
            status: 'failed',
            error: 'Failed',
            failedAt: '2026-05-12T01:00:00.000Z',
            latencyMs: 300,
            model: 'model-a',
            traceUrl: 'https://trace.test/failed',
            sourceRunId: 'run-1',
          },
        ],
        count: 1,
        limit: 10,
        offset: 0,
      },
      recentTraces: {
        rows: [
          {
            taskId: 'trace-task',
            projectId: 'project-1',
            type: 'extract-flows',
            label: 'Agent 1',
            status: 'completed',
            completedAt: '2026-05-12T01:00:00.000Z',
            failedAt: null,
            latencyMs: 300,
            model: 'model-a',
            traceUrl: null,
          },
        ],
        count: 1,
        limit: 10,
        offset: 0,
      },
    } as never);

    render(<AdminDashboard />);

    await waitFor(() => expect(screen.getByText('failed-t')).toBeInTheDocument());

    const enabledTrace = screen.getAllByRole('link', { name: /trace/i })[0];
    expect(enabledTrace).toHaveAttribute('href', 'https://trace.test/failed');
    expect(screen.getByRole('button', { name: /trace/i })).toBeDisabled();
  });

  it('paginates recent issues and resets offsets when the window changes', async () => {
    vi.mocked(getAdminStats).mockResolvedValue({
      ...stats,
      recentFailures: { rows: [], count: 12, limit: 10, offset: 0 },
    } as never);

    render(<AdminDashboard />);

    await waitFor(() => expect(screen.getByText('1-10 of 12')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);

    await waitFor(() => expect(getAdminStats).toHaveBeenLastCalledWith('7d', {
      failuresLimit: 10,
      failuresOffset: 10,
      tracesLimit: 10,
      tracesOffset: 0,
    }));

    fireEvent.click(screen.getByRole('button', { name: '1d' }));

    await waitFor(() => expect(getAdminStats).toHaveBeenLastCalledWith('1d', {
      failuresLimit: 10,
      failuresOffset: 0,
      tracesLimit: 10,
      tracesOffset: 0,
    }));
  });
});
