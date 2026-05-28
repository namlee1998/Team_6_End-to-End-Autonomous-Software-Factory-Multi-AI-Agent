const SdlcWorkflowService = require('../services/SdlcWorkflowService');

class SdlcController {
  // ─── IntentGate ──────────────────────────────────────────────────────────

  async runIntentAgent(req, res, next) {
    try {
      const { project_id, feature_request, feedback_prompt } = req.body;
      if (!project_id) return res.status(400).json({ status: 'error', message: 'project_id is required' });
      if (!feature_request || !feature_request.title) {
        return res.status(400).json({ status: 'error', message: 'feature_request.title is required' });
      }

      const task = await SdlcWorkflowService.runIntentAgent({
        projectId: project_id,
        featureRequest: feature_request,
        feedbackPrompt: feedback_prompt || '',
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  // ─── Run Agents ──────────────────────────────────────────────────────────

  async runPOAgent(req, res, next) {
    try {
      const { source_task_id, feedback_prompt } = req.body;
      if (!source_task_id) return res.status(400).json({ status: 'error', message: 'source_task_id is required' });

      const task = await SdlcWorkflowService.runPOAgent({
        projectId: req.body.project_id,
        sourceTaskId: source_task_id,
        feedbackPrompt: feedback_prompt || '',
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  async runUXAgent(req, res, next) {
    try {
      const { source_task_id, feedback_prompt } = req.body;
      if (!source_task_id) return res.status(400).json({ status: 'error', message: 'source_task_id is required' });

      const task = await SdlcWorkflowService.runUXAgent({
        projectId: req.body.project_id,
        sourceTaskId: source_task_id,
        feedbackPrompt: feedback_prompt || '',
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  async runDEVAgent(req, res, next) {
    try {
      const { source_task_id, feedback_prompt } = req.body;
      if (!source_task_id) return res.status(400).json({ status: 'error', message: 'source_task_id is required' });

      const task = await SdlcWorkflowService.runDEVAgent({
        projectId: req.body.project_id,
        sourceTaskId: source_task_id,
        feedbackPrompt: feedback_prompt || '',
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  async runQAAgent(req, res, next) {
    try {
      const { source_task_id, feedback_prompt } = req.body;
      if (!source_task_id) return res.status(400).json({ status: 'error', message: 'source_task_id is required' });

      const task = await SdlcWorkflowService.runQAAgent({
        projectId: req.body.project_id,
        sourceTaskId: source_task_id,
        feedbackPrompt: feedback_prompt || '',
        user: req.user,
      });

      return res.status(202).json({ task_id: task.id, status: task.status, type: task.type });
    } catch (err) { next(err); }
  }

  // ─── HITL Gate ───────────────────────────────────────────────────────────

  async submitGateDecision(req, res, next) {
    try {
      const { task_id } = req.params;
      const { decision, comment } = req.body;

      const result = await SdlcWorkflowService.submitGateDecision({
        taskId: task_id,
        decision,
        comment,
        user: req.user,
      });

      return res.json({
        status: 'success',
        data: {
          task_id: result.task.id,
          gate: result.hitlDecision.gate,
          decision: result.hitlDecision.decision,
          comment: result.hitlDecision.comment,
          created_at: result.hitlDecision.createdAt,
        },
      });
    } catch (err) { next(err); }
  }

  // ─── Status & Data ───────────────────────────────────────────────────────

  async getTaskStatus(req, res, next) {
    try {
      const { task_id } = req.params;
      const task = await SdlcWorkflowService.getTaskStatus(task_id, req.user);
      if (!task) return res.status(404).json({ status: 'error', message: 'Task not found' });

      return res.json({
        status: 'success',
        data: {
          task_id: task.id,
          type: task.type,
          status: task.status,
          version_status: task.versionStatus,
          gate: task.gate,
          next_agent: task.nextAgent,
          result: task.result,
          artifacts: task.artifacts || [],
          hitl_decision: task.hitlDecision || null,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
        },
      });
    } catch (err) { next(err); }
  }

  async streamStatus(req, res, next) {
    try {
      const { task_id } = req.params;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sendEvent = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent('progress', {
        step: 'connected',
        log: 'Connected to SDLC task stream...',
      });

      const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 15000);

      let pollInterval;
      const stopAll = () => {
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
      };

      pollInterval = setInterval(async () => {
        try {
          const task = await SdlcWorkflowService.getTaskStatus(task_id, req.user);

          if (!task) {
            sendEvent('error', { message: 'Task not found' });
            stopAll(); res.end(); return;
          }

          if (task.status === 'completed') {
            sendEvent('completed', {
              ...task.result,
              artifacts: task.artifacts || [],
              hitlDecision: task.hitlDecision || null,
            });
            stopAll(); res.end(); return;
          }

          if (task.status === 'failed') {
            sendEvent('error', { message: task.error || 'Task failed' });
            stopAll(); res.end(); return;
          }

          sendEvent('progress', {
            step: task.type,
            status: task.status,
            log: `Processing: ${task.type}`,
          });
        } catch (error) {
          sendEvent('error', { message: error.message });
          stopAll();
          res.end();
        }
      }, 2000);

      req.on('close', () => {
        stopAll();
        res.end();
      });
    } catch (err) {
      next(err);
    }
  }

  async getWorkflowStatus(req, res, next) {
    try {
      const { project_id } = req.query;
      if (!project_id) return res.status(400).json({ status: 'error', message: 'project_id is required' });

      const result = await SdlcWorkflowService.getWorkflowStatus(project_id, req.user);
      return res.json({ status: 'success', data: result });
    } catch (err) { next(err); }
  }

  async getFinalReviewPacket(req, res, next) {
    try {
      const { project_id } = req.params;
      const packet = await SdlcWorkflowService.getFinalReviewPacket(project_id, req.user);
      return res.json({ status: 'success', data: packet });
    } catch (err) { next(err); }
  }

  async getAuditTrail(req, res, next) {
    try {
      const { project_id } = req.params;
      const trail = await SdlcWorkflowService.getAuditTrail(project_id, req.user);
      return res.json({ status: 'success', data: trail });
    } catch (err) { next(err); }
  }
}

module.exports = new SdlcController();
