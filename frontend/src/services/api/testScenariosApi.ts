import api from './client';
import type { GenerateTestcasesRequest, GenerateTestcasesResponse } from './types';

/**
 * Start Agent 2 to generate QA scenarios from Agent 1 results.
 * POST /api/v1/workflows/generate-testcases
 */
export async function generateTestcases(
  payload: GenerateTestcasesRequest,
): Promise<GenerateTestcasesResponse> {
  const { data } = await api.post<GenerateTestcasesResponse>(
    '/workflows/generate-testcases',
    payload,
  );
  return data;
}
