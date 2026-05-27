const WorkflowService = require('../services/WorkflowService');

function observabilityPayload(task) {
  const observability = task?.observability || {};
  return Object.keys(observability).length > 0 ? { observability } : {};
}

class WorkflowController {
  /**
   * Start flow extraction (Agent 1)
   * POST /api/v1/workflows/extract-flows
   */
  async extractFlows(req, res, next) {
    try {
      const { project_id, document_ids, prompt_profile, feedback_prompt } = req.body;

      if (!project_id) {
        return res.status(400).json({ status: 'error', message: 'project_id is required' });
      }
      if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
        return res.status(400).json({ status: 'error', message: 'document_ids array is required' });
      }

      const task = await WorkflowService.extractFlows({
        projectId: project_id,
        documentIds: document_ids,
        promptProfile: prompt_profile,
        feedbackPrompt: feedback_prompt || '',
        user: req.user,
      });

      return res.status(202).json({
        task_id: task.id,
        status: task.status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Stream task status via SSE
   * GET /api/v1/workflows/status/:task_id
   */
  async streamStatus(req, res, next) {
    try {
      const { task_id } = req.params;

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      // Send initial progress
      const sendEvent = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent('progress', {
        step: 'connected',
        log: '📡 Connected to task stream...',
      });

      // Heartbeat every 15s to keep proxy/browser connection alive
      const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 15000);

      // Track testcases already forwarded to this SSE client (for progressive reveal)
      let sentTestcaseCount = 0;

      // Helper: check for new testcases in DB and emit 'partial' events
      const flushPartialTestcases = async () => {
        try {
          const result = await WorkflowService.getTaskPartialTestcases(task_id, sentTestcaseCount, req.user);
          if (result.testcases.length > 0 || result.artifacts?.length > 0) {
            sendEvent('partial', { artifacts: result.artifacts || [], testcases: result.testcases });
            sentTestcaseCount = result.nextOffset;
          }
        } catch (_) { /* ignore, will retry next cycle */ }
      };

      // Poll task status and stream updates
      const pollInterval = setInterval(async () => {
        try {
          const task = await WorkflowService.getTaskStatus(task_id, req.user);

          const stopAll = () => {
            clearInterval(pollInterval);
            clearInterval(heartbeatInterval);
          };

          if (!task) {
            sendEvent('error', { message: 'Task not found' });
            stopAll(); res.end(); return;
          }

          // For agent_2 and agent_3 tasks: flush any newly-persisted testcases as 'partial' events
          if ((task.type === 'generate-testcases' || task.type === 'generate-automation') && task.status === 'processing') {
            await flushPartialTestcases();
          }

          if (task.status === 'completed') {
            // Final flush before closing — catches any testcases saved right at the end
            if (task.type === 'generate-testcases' || task.type === 'generate-automation') {
              await flushPartialTestcases();
            }
            sendEvent('completed', task.result);
            stopAll(); res.end(); return;
          }

          if (task.status === 'failed') {
            sendEvent('error', { message: task.error || 'Task failed' });
            stopAll(); res.end(); return;
          }

          sendEvent('progress', {
            step: task.type,
            status: task.status,
            log: `⏳ Processing: ${task.type}`,
          });
        } catch (error) {
          sendEvent('error', { message: error.message });
          clearInterval(pollInterval);
          clearInterval(heartbeatInterval);
          res.end();
        }
      }, 2000);

      // Clean up on client disconnect
      req.on('close', () => {
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        res.end();
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resolve unknowns from Agent 1 output
   * POST /api/v1/workflows/resolve-unknowns
   */
  async resolveUnknowns(req, res, next) {
    try {
      const { task_id, resolutions } = req.body;

      if (!task_id || !resolutions || !Array.isArray(resolutions)) {
        return res.status(400).json({
          status: 'error',
          message: 'task_id and resolutions array are required',
        });
      }

      const task = await WorkflowService.resolveUnknowns({
        taskId: task_id,
        resolutions,
        user: req.user,
      });

      return res.json({
        status: 'success',
        data: {
          task_id: task.id,
          status: task.status,
          result: task.result,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate test scenarios (Agent 2)
   * POST /api/v1/workflows/generate-testcases
   */
  async generateTestcases(req, res, next) {
    try {
      const { task_id, feedback_prompt, selected_flow_names, previous_task_id } = req.body;

      if (!task_id) {
        return res.status(400).json({
          status: 'error',
          message: 'task_id is required',
        });
      }

      const task = await WorkflowService.generateTestcases({
        taskId: task_id,
        feedbackPrompt: feedback_prompt || '',
        selectedFlowNames: Array.isArray(selected_flow_names) ? selected_flow_names : [],
        previousTaskId: previous_task_id || '',
        user: req.user,
      });

      return res.status(202).json({
        task_id: task.id,
        status: task.status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate automation code (Agent 3)
   * POST /api/v1/workflows/generate-automation
   */
  async generateAutomation(req, res, next) {
    try {
      const { task_id, framework, feedback_prompt, selected_scenario_ids, previous_task_id } = req.body;

      if (!task_id) {
        return res.status(400).json({
          status: 'error',
          message: 'task_id is required',
        });
      }

      const task = await WorkflowService.generateAutomation({
        taskId: task_id,
        framework,
        feedbackPrompt: feedback_prompt || '',
        selectedScenarioIds: Array.isArray(selected_scenario_ids) ? selected_scenario_ids : [],
        previousTaskId: previous_task_id || '',
        user: req.user,
      });

      // For automation, we can wait for completion or return task ID
      // In a real implementation, this would also use SSE
      return res.status(202).json({
        task_id: task.id,
        status: task.status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get task status (non-streaming)
   * GET /api/v1/workflows/tasks/:task_id
   */
  async getTaskStatus(req, res, next) {
    try {
      const { task_id } = req.params;
      const task = await WorkflowService.getTaskStatus(task_id, req.user);

      if (!task) {
        return res.status(404).json({
          status: 'error',
          message: 'Task not found',
        });
      }

      return res.json({
        status: 'success',
        data: {
          task_id: task.id,
          type: task.type,
          status: task.status,
          result: task.result,
          error: task.error,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
          artifacts: task.artifacts || [],
          testcases: task.testcases || [],
          version_status: task.versionStatus,
          input_content_hash: task.inputContentHash,
          output_content_hash: task.outputContentHash,
          source_run_id: task.sourceRunId,
          ...observabilityPayload(task),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Commit a draft task (Stage Gate: user accepts and unlocks next agent)
   * POST /api/v1/workflows/tasks/:task_id/commit
   */
  async commitTask(req, res, next) {
    try {
      const { task_id } = req.params;
      const task = await WorkflowService.commitTask(task_id, req.user);
      return res.json({
        status: 'success',
        data: {
          task_id: task.id,
          type: task.type,
          version_status: task.versionStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check staleness for all agent stages in a project
   * GET /api/v1/workflows/staleness?project_id=xxx
   */
  async checkStaleness(req, res, next) {
    try {
      const { project_id } = req.query;
      if (!project_id) {
        return res.status(400).json({ status: 'error', message: 'project_id is required' });
      }
      const result = await WorkflowService.checkStaleness(project_id, req.user);
      return res.json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List tasks with optional filters
   * GET /api/v1/workflows/tasks?type=extract-flows&status=completed&limit=50
   */
  async listTasks(req, res, next) {
    try {
      const { type, status, limit, project_id } = req.query;
      const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 50;
      const tasks = await WorkflowService.listTasks({
        type: type || undefined,
        status: status || undefined,
        projectId: project_id || undefined,
        limit: parsedLimit,
        user: req.user,
      });

      return res.json({
        status: 'success',
        data: tasks.map((task) => ({
          task_id: task.id,
          type: task.type,
          status: task.status,
          result: task.result,
          error: task.error,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
          ...observabilityPayload(task),
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get the latest completed task for a document
   * GET /api/v1/workflows/latest/:documentId
   */
  async getLatestTask(req, res, next) {
    try {
      const { documentId } = req.params;

      if (!documentId) {
        return res.status(400).json({
          status: 'error',
          message: 'documentId is required',
        });
      }

      const task = await WorkflowService.getLatestCompletedTask(documentId, req.query?.type, req.user);

      if (!task) {
        return res.json({
          status: 'success',
          data: null,
        });
      }

      const enrichedTask = await WorkflowService.getTaskStatus(task.id, req.user);

      return res.json({
        status: 'success',
        data: {
          task_id: enrichedTask.id,
          type: enrichedTask.type,
          status: enrichedTask.status,
          result: enrichedTask.result,
          error: enrichedTask.error,
          created_at: enrichedTask.createdAt,
          updated_at: enrichedTask.updatedAt,
          artifacts: enrichedTask.artifacts || [],
          testcases: enrichedTask.testcases || [],
          version_status: enrichedTask.versionStatus,
          input_content_hash: enrichedTask.inputContentHash,
          output_content_hash: enrichedTask.outputContentHash,
          source_run_id: enrichedTask.sourceRunId,
          ...observabilityPayload(enrichedTask),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a task and its associated testcases
   * DELETE /api/v1/workflows/tasks/:task_id
   */
  async deleteTask(req, res, next) {
    try {
      const { task_id } = req.params;
      await WorkflowService.deleteTask(task_id, req.user);
      return res.json({ status: 'success' });
    } catch (error) {
      if (error.message === 'Task not found') {
        return res.status(404).json({ status: 'error', message: 'Task not found' });
      }
      next(error);
    }
  }
}

module.exports = new WorkflowController();
