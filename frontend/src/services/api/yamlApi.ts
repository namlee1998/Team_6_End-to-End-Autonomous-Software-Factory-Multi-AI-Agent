import api from './client';
import type { GenerateAutomationRequest, GenerateAutomationResponse } from './types';

/**
 * Start Agent 3 to generate YAML automation scripts.
 * POST /api/v1/workflows/generate-automation
 */
export async function generateAutomation(
  payload: GenerateAutomationRequest,
): Promise<GenerateAutomationResponse> {
  const { data } = await api.post<GenerateAutomationResponse>(
    '/workflows/generate-automation',
    payload,
  );
  return data;
}
