import api from './client';

export type VersionStatus = 'draft' | 'committed';

export interface StalenessAgentInfo {
  taskId: string;
  versionStatus: VersionStatus;
  outputContentHash: string | null;
  isDraft: boolean;
  isStale?: boolean;
  upstreamHash?: string | null;
}

export interface StalenessResult {
  agent1: StalenessAgentInfo | null;
  agent2: (StalenessAgentInfo & { isStale: boolean; upstreamHash: string | null }) | null;
  agent3: (StalenessAgentInfo & { isStale: boolean; upstreamHash: string | null }) | null;
}

export async function commitTask(taskId: string): Promise<{ task_id: string; version_status: VersionStatus }> {
  const { data } = await api.post<{ status: string; data: { task_id: string; type: string; version_status: VersionStatus } }>(
    `/workflows/tasks/${taskId}/commit`,
  );
  return data.data;
}

export async function checkStaleness(projectId: string): Promise<StalenessResult> {
  const { data } = await api.get<{ status: string; data: StalenessResult }>(
    '/workflows/staleness',
    { params: { project_id: projectId } },
  );
  return data.data;
}
