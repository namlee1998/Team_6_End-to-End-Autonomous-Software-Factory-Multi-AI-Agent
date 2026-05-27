import axios from 'axios';

const BASE = '/api/v1/sdlc';

export interface FeatureRequest {
  title: string;
  description?: string;
  priority?: 'High' | 'Medium' | 'Low';
  target_user?: string;
  business_goal?: string;
  constraints?: string[];
}

export interface GateDecisionPayload {
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  comment?: string;
}

// ── IntentGate ────────────────────────────────────────────────────────────

export const runIntentAgent = (projectId: string, featureRequest: FeatureRequest) =>
  axios.post(`${BASE}/run-intent-agent`, { project_id: projectId, feature_request: featureRequest })
    .then((r) => r.data);

// ── Run Agents ────────────────────────────────────────────────────────────

export const runPOAgent = (projectId: string, featureRequest: FeatureRequest, projectContext = {}) =>
  axios.post(`${BASE}/run-po-agent`, { project_id: projectId, source_task_id: projectContext.intent_task_id || '', feature_request: featureRequest, project_context: projectContext })
    .then((r) => r.data);

export const runUXAgent = (sourceTaskId: string, feedbackPrompt = '') =>
  axios.post(`${BASE}/run-ux-agent`, { source_task_id: sourceTaskId, feedback_prompt: feedbackPrompt })
    .then((r) => r.data);

export const runDEVAgent = (sourceTaskId: string, feedbackPrompt = '') =>
  axios.post(`${BASE}/run-dev-agent`, { source_task_id: sourceTaskId, feedback_prompt: feedbackPrompt })
    .then((r) => r.data);

export const runQAAgent = (sourceTaskId: string, feedbackPrompt = '') =>
  axios.post(`${BASE}/run-qa-agent`, { source_task_id: sourceTaskId, feedback_prompt: feedbackPrompt })
    .then((r) => r.data);

// ── HITL ──────────────────────────────────────────────────────────────────

export const submitGateDecision = (taskId: string, payload: GateDecisionPayload) =>
  axios.post(`${BASE}/tasks/${taskId}/gate-decision`, payload).then((r) => r.data);

// ── Status ────────────────────────────────────────────────────────────────

export const getSdlcTaskStatus = (taskId: string) =>
  axios.get(`${BASE}/tasks/${taskId}`).then((r) => r.data.data);

export const getWorkflowStatus = (projectId: string) =>
  axios.get(`${BASE}/workflow-status`, { params: { project_id: projectId } }).then((r) => r.data.data);

export const getFinalReviewPacket = (projectId: string) =>
  axios.get(`${BASE}/final-review-packet/${projectId}`).then((r) => r.data.data);

export const getAuditTrail = (projectId: string) =>
  axios.get(`${BASE}/audit-trail/${projectId}`).then((r) => r.data.data);

// ── SSE subscription (reuses same pattern as original API) ────────────────

export const subscribeTaskSSE = (
  taskId: string,
  handlers: {
    onProgress?: (data: Record<string, unknown>) => void;
    onCompleted?: (data: Record<string, unknown>) => void;
    onError?: (data: Record<string, unknown>) => void;
  }
): AbortController => {
  const abort = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${BASE}/status/${taskId}`, { signal: abort.signal });
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'progress') handlers.onProgress?.(data);
              else if (currentEvent === 'completed') handlers.onCompleted?.(data);
              else if (currentEvent === 'error') handlers.onError?.(data);
            } catch (_) {}
            currentEvent = null;
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        handlers.onError?.({ message: 'SSE connection error' });
      }
    }
  })();

  return abort;
};
