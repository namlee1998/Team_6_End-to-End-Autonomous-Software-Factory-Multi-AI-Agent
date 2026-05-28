const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { Task, AgentArtifact, HitlDecision } = require('../models');
const AgentService = require('./AgentService');
const MembershipService = require('./MembershipService');
const QuotaService = require('./QuotaService');
const fs = require('fs/promises');
const path = require('path');
const { ApiError } = require('../middleware/errorHandler');

const WORKSPACE_DIR = path.join(__dirname, '../../../workspace/projects');

// ---------------------------------------------------------------------------
// Workflow State Machine
// States: DRAFT → PO_RUNNING → PO_REVIEW → UX_RUNNING → UX_REVIEW →
//         DEV_RUNNING → DEV_REVIEW → QA_RUNNING → QA_REVIEW →
//         FINAL_REVIEW → READY / HOLD
// Rework states: PO_REWORK | UX_REWORK | DEV_REWORK | QA_FAILED
// ---------------------------------------------------------------------------

const AGENT_GATES = {
  'intent-agent': 'REQUIREMENT_GATE',
  'po-agent':  'REQUIREMENT_GATE',
  'ux-agent':  'UX_GATE',
  'dev-agent': 'DEV_GATE',
  'qa-agent':  'QA_GATE',
};

const NEXT_AGENT = {
  'intent-agent': 'po-agent',
  'po-agent':  'ux-agent',
  'ux-agent':  'dev-agent',
  'dev-agent': 'qa-agent',
  'qa-agent':  null,          // → FINAL_REVIEW
};

const NODE_TARGET = {
  'intent-agent': 'intent_node',
  'po-agent':  'po_agent',
  'ux-agent':  'ux_agent',
  'dev-agent': 'dev_agent',
  'qa-agent':  'qa_agent',
};

/** SHA-256 content hash */
function contentHash(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

/** Build task result from artifacts for client consumption */
function buildTaskResult(task, artifacts = []) {
  const byType = {};
  for (const art of artifacts) {
    if (!byType[art.artifactType]) byType[art.artifactType] = [];
    byType[art.artifactType].push(art);
  }

  return {
    agentType: task.type,
    artifacts: artifacts.map((a) => ({
      id: a.id,
      type: a.artifactType,
      key: a.artifactKey,
      title: a.title,
      contentText: a.contentText,
      contentJson: a.contentJson,
    })),
    ...task.result,
  };
}

class SdlcWorkflowService {
  // =========================================================================
  // Run Agents
  // =========================================================================

  /**
   * Start an Intent Agent run — generates AI assumptions from raw request.
   */
  async runIntentAgent({ projectId, featureRequest, feedbackPrompt = '', user }) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor']);
    }

    const inputHash = contentHash({ featureRequest, feedbackPrompt });
    const task = await Task.create({
      id: uuidv4(),
      projectId,
      type: 'intent-agent',
      status: 'pending',
      inputContentHash: inputHash,
      versionStatus: 'draft',
    });

    this._runAgent(task, {
      featureRequest,
      feedbackPrompt,
    }, user?.id).catch((err) => console.error('[SDLC] Intent Agent failed:', err));

    return task;
  }

  /**
   * Start a PO Agent run — reads intent assumptions, produces PRD artifacts.
   */
  async runPOAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'intent-agent', user);

    const sourceArtifacts = await AgentArtifact.findByTaskId(sourceTask.id);
    const inputHash = contentHash(sourceArtifacts.map((a) => a.contentHash));

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'po-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts(sourceArtifacts, { feedbackPrompt });
    
    // We also need to pass the original feature request since po_agent expects it.
    // The original feature request is stored in the intent task's input content hash? No, in DB we don't store it plainly except if we look at the request payload.
    // For now, let's just fetch it from the first task's input, or pass it via context.
    // Actually, PO Agent's prompt can just read from context.intent_assumptions! Let's update PO Agent to accept Intent assumptions.

    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] PO Agent failed:', err));

    return task;
  }

  /**
   * Start a UX Agent run — reads approved PRD artifacts, produces UX spec.
   */
  async runUXAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'po-agent', user);

    const sourceArtifacts = await AgentArtifact.findByTaskId(sourceTask.id);
    const inputHash = contentHash(sourceArtifacts.map((a) => a.contentHash));

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'ux-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts(sourceArtifacts, { feedbackPrompt });
    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] UX Agent failed:', err));

    return task;
  }

  /**
   * Start a DEV Agent run — reads approved UX artifacts, produces implementation plan.
   */
  async runDEVAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'ux-agent', user);

    // Also load PO artifacts for DEV context
    const poTask = await Task.findLatestByProject(projectId, 'po-agent', 'completed', 'committed');
    const [uxArtifacts, poArtifacts] = await Promise.all([
      AgentArtifact.findByTaskId(sourceTask.id),
      poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
    ]);

    const inputHash = contentHash([...uxArtifacts, ...poArtifacts].map((a) => a.contentHash));

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'dev-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts([...poArtifacts, ...uxArtifacts], { feedbackPrompt });
    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] DEV Agent failed:', err));

    return task;
  }

  /**
   * Start a QA Agent run — reads DEV artifacts + all upstream, produces test cases.
   */
  async runQAAgent({ projectId, sourceTaskId, feedbackPrompt = '', user }) {
    const sourceTask = await this._requireApprovedTask(sourceTaskId, 'dev-agent', user);

    const [poTask, uxTask] = await Promise.all([
      Task.findLatestByProject(projectId, 'po-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'ux-agent', 'completed', 'committed'),
    ]);

    const allArtifacts = (
      await Promise.all([
        poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
        uxTask ? AgentArtifact.findByTaskId(uxTask.id) : Promise.resolve([]),
        AgentArtifact.findByTaskId(sourceTask.id),
      ])
    ).flat();

    const inputHash = contentHash(allArtifacts.map((a) => a.contentHash));

    const task = await Task.create({
      id: uuidv4(),
      projectId: sourceTask.projectId,
      type: 'qa-agent',
      status: 'pending',
      inputContentHash: inputHash,
      sourceRunId: sourceTask.id,
      versionStatus: 'draft',
    });

    const context = await this._buildContextFromArtifacts(allArtifacts, { feedbackPrompt });
    this._runAgent(task, context, user?.id).catch((err) => console.error('[SDLC] QA Agent failed:', err));

    return task;
  }

  // =========================================================================
  // HITL Gate
  // =========================================================================

  /**
   * Human submits a gate decision: APPROVE | REJECT | REQUEST_CHANGES
   */
  async submitGateDecision({ taskId, decision, comment, user }) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, 'Task not found');
    if (user) await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor']);
    if (task.status !== 'completed') throw new ApiError(400, 'Task must be completed before gate decision');

    const gate = AGENT_GATES[task.type];
    if (!gate) throw new ApiError(400, `Task type ${task.type} has no gate`);

    if (!['APPROVE', 'REJECT', 'REQUEST_CHANGES'].includes(decision)) {
      throw new ApiError(400, 'Decision must be APPROVE | REJECT | REQUEST_CHANGES');
    }

    const hitlRecord = await HitlDecision.create({
      id: uuidv4(),
      workflowRunId: task.projectId, // use projectId as workflow scope
      taskId: task.id,
      projectId: task.projectId,
      gate,
      decision,
      comment: comment || '',
      reviewerId: user?.id || null,
    });

    if (decision === 'APPROVE') {
      await Task.commitTask(taskId);
    } else if (decision === 'REQUEST_CHANGES' && comment) {
      // Trigger targeted rework automatically in the background
      this.triggerRework({
        projectId: task.projectId,
        sourceTaskId: taskId,
        feedbackPrompt: comment,
        user
      }).catch(err => console.error('[SDLC] Rework triggered by gate decision failed:', err));
    }

    return { task, hitlDecision: hitlRecord };
  }

  // =========================================================================
  // Targeted Rework Logic
  // =========================================================================

  /**
   * Evaluates the feedback via Python agents and triggers the appropriate agent.
   */
  async triggerRework({ projectId, sourceTaskId, feedbackPrompt, user }) {
    console.log(`[SDLC] Triggering Rework for project ${projectId}. Feedback: "${feedbackPrompt}"`);
    
    // 1. Ask python Agent Server to analyze the feedback and route it
    const targetAgent = await AgentService.routeRework(feedbackPrompt);
    console.log(`[SDLC] Agent Server routed rework to: ${targetAgent}`);

    // 2. Trigger the appropriate Agent based on the routing decision
    if (targetAgent === 'po_agent') {
      return this.runPOAgent({ projectId, sourceTaskId, feedbackPrompt, user });
    } else if (targetAgent === 'ux_agent') {
      return this.runUXAgent({ projectId, sourceTaskId, feedbackPrompt, user });
    } else if (targetAgent === 'dev_agent') {
      return this.runDEVAgent({ projectId, sourceTaskId, feedbackPrompt, user });
    } else if (targetAgent === 'qa_agent') {
      return this.runQAAgent({ projectId, sourceTaskId, feedbackPrompt, user });
    } else {
      console.warn(`[SDLC] Unrecognized rework target: ${targetAgent}. Defaulting to DEV.`);
      return this.runDEVAgent({ projectId, sourceTaskId, feedbackPrompt, user });
    }
  }

  // =========================================================================
  // Final Review Packet
  // =========================================================================

  async getFinalReviewPacket(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [intentTask, poTask, uxTask, devTask, qaTask] = await Promise.all([
      Task.findLatestByProject(projectId, 'intent-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'po-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'ux-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'dev-agent', 'completed', 'committed'),
      Task.findLatestByProject(projectId, 'qa-agent', 'completed'),
    ]);

    const allArtifacts = (
      await Promise.all([
        intentTask ? AgentArtifact.findByTaskId(intentTask.id) : Promise.resolve([]),
        poTask ? AgentArtifact.findByTaskId(poTask.id) : Promise.resolve([]),
        uxTask ? AgentArtifact.findByTaskId(uxTask.id) : Promise.resolve([]),
        devTask ? AgentArtifact.findByTaskId(devTask.id) : Promise.resolve([]),
        qaTask ? AgentArtifact.findByTaskId(qaTask.id) : Promise.resolve([]),
      ])
    ).flat();

    const hitlDecisions = await HitlDecision.findByProjectId(projectId);

    return {
      phases: {
        intent: intentTask ? { taskId: intentTask.id, status: intentTask.status, versionStatus: intentTask.versionStatus } : null,
        po: poTask ? { taskId: poTask.id, status: poTask.status, versionStatus: poTask.versionStatus } : null,
        ux: uxTask ? { taskId: uxTask.id, status: uxTask.status, versionStatus: uxTask.versionStatus } : null,
        dev: devTask ? { taskId: devTask.id, status: devTask.status, versionStatus: devTask.versionStatus } : null,
        qa: qaTask ? { taskId: qaTask.id, status: qaTask.status, versionStatus: qaTask.versionStatus } : null,
      },
      artifacts: await Promise.all(allArtifacts.map(async (a) => {
        let text = a.contentText;
        if (text && text.startsWith('FILE:')) {
          try { text = await fs.readFile(text.slice(5), 'utf8'); } catch (e) { text = 'File not found'; }
        }
        return {
          id: a.id,
          phase: a.agentType,
          type: a.artifactType,
          key: a.artifactKey,
          title: a.title,
          contentText: text,
          contentJson: a.contentJson,
        };
      })),
      hitlDecisions,
      generatedAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // Audit Trail
  // =========================================================================

  async getAuditTrail(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [tasks, hitlDecisions] = await Promise.all([
      Task.findByProjectId(projectId),
      HitlDecision.findByProjectId(projectId),
    ]);

    const sdlcTasks = tasks.filter((t) => ['intent-agent', 'po-agent', 'ux-agent', 'dev-agent', 'qa-agent'].includes(t.type));

    const events = [
      ...sdlcTasks.map((t) => ({
        timestamp: t.createdAt,
        actor: t.type.toUpperCase().replace('-', '_'),
        action: `START_${t.type.replace('-agent', '').toUpperCase()}_AGENT`,
        taskId: t.id,
        status: t.status,
        type: 'agent_run',
      })),
      ...sdlcTasks
        .filter((t) => t.status === 'completed')
        .map((t) => ({
          timestamp: t.updatedAt,
          actor: t.type.toUpperCase().replace('-', '_'),
          action: `COMPLETE_${t.type.replace('-agent', '').toUpperCase()}_AGENT`,
          taskId: t.id,
          status: 'completed',
          type: 'agent_complete',
        })),
      ...hitlDecisions.map((d) => ({
        timestamp: d.createdAt,
        actor: 'HUMAN',
        action: `${d.decision}_${d.gate}`,
        taskId: d.taskId,
        gate: d.gate,
        decision: d.decision,
        comment: d.comment,
        type: 'hitl_decision',
      })),
    ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return { projectId, events };
  }

  // =========================================================================
  // Task status (SSE-compatible, reuses base WorkflowService pattern)
  // =========================================================================

  async getTaskStatus(taskId, user) {
    const task = await Task.findById(taskId);
    if (!task) return null;
    if (user) {
      await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [artifacts, hitlDecision] = await Promise.all([
      AgentArtifact.findByTaskId(taskId),
      HitlDecision.findByTaskId(taskId),
    ]);

    task.artifacts = await Promise.all(artifacts.map(async (a) => {
      let text = a.contentText;
      if (text && text.startsWith('FILE:')) {
        try { text = await fs.readFile(text.slice(5), 'utf8'); } catch (e) { text = 'File not found'; }
      }
      return { ...a, contentText: text };
    }));
    task.result = buildTaskResult(task, task.artifacts);
    task.hitlDecision = hitlDecision;
    task.gate = AGENT_GATES[task.type] || null;
    task.nextAgent = NEXT_AGENT[task.type];

    return task;
  }

  async getWorkflowStatus(projectId, user) {
    if (user) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const [intentTask, poTask, uxTask, devTask, qaTask] = await Promise.all([
      Task.findLatestByProject(projectId, 'intent-agent', null),
      Task.findLatestByProject(projectId, 'po-agent', null),
      Task.findLatestByProject(projectId, 'ux-agent', null),
      Task.findLatestByProject(projectId, 'dev-agent', null),
      Task.findLatestByProject(projectId, 'qa-agent', null),
    ]);

    const hitlDecisions = await HitlDecision.findByProjectId(projectId);
    const decisionsByTaskId = {};
    for (const d of hitlDecisions) decisionsByTaskId[d.taskId] = d;

    const mapPhase = (task) => {
      if (!task) return null;
      return {
        taskId: task.id,
        status: task.status,
        versionStatus: task.versionStatus,
        gate: AGENT_GATES[task.type],
        hitlDecision: decisionsByTaskId[task.id] || null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    };

    return {
      projectId,
      phases: {
        intent: mapPhase(intentTask),
        po: mapPhase(poTask),
        ux: mapPhase(uxTask),
        dev: mapPhase(devTask),
        qa: mapPhase(qaTask),
      },
      currentPhase: this._deriveCurrentPhase(intentTask, poTask, uxTask, devTask, qaTask, decisionsByTaskId),
    };
  }

  // =========================================================================
  // Internals
  // =========================================================================

  _deriveCurrentPhase(intentTask, poTask, uxTask, devTask, qaTask, decisionsByTaskId) {
    if (!intentTask || intentTask.status === 'pending' || intentTask.status === 'processing') return 'INTAKE_REVIEW';
    if (intentTask.status === 'failed') return 'INTENT_FAILED';
    if (!decisionsByTaskId[intentTask?.id] || decisionsByTaskId[intentTask?.id]?.decision !== 'APPROVE') return 'INTAKE_REVIEW';
    if (!poTask || poTask.status === 'pending' || poTask.status === 'processing') return 'PO_RUNNING';
    if (poTask.status === 'failed') return 'PO_FAILED';
    if (!decisionsByTaskId[poTask?.id] || decisionsByTaskId[poTask?.id]?.decision !== 'APPROVE') return 'PO_REVIEW';
    if (!uxTask || uxTask.status === 'pending' || uxTask.status === 'processing') return 'UX_RUNNING';
    if (uxTask.status === 'failed') return 'UX_FAILED';
    if (!decisionsByTaskId[uxTask?.id] || decisionsByTaskId[uxTask?.id]?.decision !== 'APPROVE') return 'UX_REVIEW';
    if (!devTask || devTask.status === 'pending' || devTask.status === 'processing') return 'DEV_RUNNING';
    if (devTask.status === 'failed') return 'DEV_FAILED';
    if (!decisionsByTaskId[devTask?.id] || decisionsByTaskId[devTask?.id]?.decision !== 'APPROVE') return 'DEV_REVIEW';
    if (!qaTask || qaTask.status === 'pending' || qaTask.status === 'processing') return 'QA_RUNNING';
    if (qaTask.status === 'failed') return 'QA_FAILED';
    if (!decisionsByTaskId[qaTask?.id]) return 'QA_REVIEW';
    return 'FINAL_REVIEW';
  }

  async _requireApprovedTask(taskId, expectedType, user) {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, 'Source task not found');
    if (user) await MembershipService.requireProjectRole(user.id, task.projectId, ['owner', 'admin', 'editor']);
    if (task.type !== expectedType) throw new ApiError(400, `Source task must be type: ${expectedType}`);
    if (task.status !== 'completed') throw new ApiError(400, 'Source task must be completed');
    if (task.type !== 'intent-agent' && task.versionStatus !== 'committed') {
      throw new ApiError(400, 'Source task must be approved (committed) before running next agent');
    }
    return task;
  }

  async _buildContextFromArtifacts(artifacts, extras = {}) {
    const context = { ...extras };
    for (const art of artifacts) {
      if (!context[art.artifactType]) context[art.artifactType] = [];
      let content = art.contentText || art.contentJson;
      if (typeof content === 'string' && content.startsWith('FILE:')) {
        try { content = await fs.readFile(content.slice(5), 'utf8'); } catch (e) { content = ''; }
      }
      context[art.artifactType].push({
        key: art.artifactKey,
        title: art.title,
        content,
      });
    }
    return context;
  }

  async _writeArtifactToFile(projectId, taskId, filename, content) {
    const dir = path.join(WORKSPACE_DIR, projectId, taskId);
    await fs.mkdir(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await fs.writeFile(filepath, data, 'utf8');
    return `FILE:${filepath}`;
  }

  /**
   * Core runner — calls AgentService and parses SSE stream, saves artifacts.
   * @private
   */
  async _runAgent(task, context, userId = null) {
    await Task.update(task.id, { status: 'processing' });

    // Hybrid Mock Mode Bypass
    if (process.env.USE_MOCK_AGENTS === 'true') {
      try {
        console.log(`[SDLC] Running in MOCK mode for agent ${task.type}`);
        const mockDir = path.join(__dirname, '../../../mock-data', task.type);
        const files = await fs.readdir(mockDir).catch(() => []);
        
        const completedData = {
          summary: "Mock execution completed via Hybrid Mock Mode.",
          token_usage: { input: 1250, output: 450 },
          observability: { trace_id: "mock-trace-123" }
        };

        for (const file of files) {
          if (!file.endsWith('.md') && !file.endsWith('.json')) continue;
          const key = file.replace(/\.(md|json)$/, '');
          const ext = path.extname(file);
          const content = await fs.readFile(path.join(mockDir, file), 'utf8');
          completedData[key] = ext === '.json' ? JSON.parse(content) : content;
        }

        // Simulate processing delay
        await new Promise(r => setTimeout(r, 2000));
        
        await this._saveAgentData(task, completedData, userId);
        return; // Bypass the real agent completely
      } catch (err) {
        console.error(`[SDLC._runAgent] Mock mode failed for task ${task.id}:`, err);
        // Fallback to real agent if mock fails
      }
    }

    try {
      const response = await AgentService.runAgent({
        sessionId: task.id,
        nodeTarget: NODE_TARGET[task.type],
        userId,
        projectId: task.projectId,
        context,
      });

      let buffer = '';
      let completedData = null;
      let agentError = null;

      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let currentEvent = null;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'error') {
                agentError = data.message || 'Agent error';
              } else if (currentEvent === 'completed') {
                completedData = data;
              }
            } catch (_) {}
          }
        }
      });

      response.data.on('end', async () => {
        try {
          if (agentError) throw new Error(agentError);
          if (!completedData) throw new Error('Agent returned no data');

          await this._saveAgentData(task, completedData, userId);
        } catch (err) {
          console.error(`[SDLC._runAgent] Failed for task ${task.id}:`, err);
          await Task.update(task.id, { status: 'failed', error: err.message });
        }
      });

      response.data.on('error', async (err) => {
        await Task.update(task.id, { status: 'failed', error: `Stream error: ${err.message}` });
      });
    } catch (err) {
      await Task.update(task.id, { status: 'failed', error: err.message });
    }
  }

  async _saveAgentData(task, completedData, userId) {
    // Save each artifact returned by the agent
    const artifactRows = [];
    const artifactTypes = ['intent_assumptions', 'clarifying_questions', 'prd', 'user_stories', 'acceptance_criteria', 'scope',
      'ux_spec', 'user_flow', 'wireframe_spec', 'component_inventory',
      'implementation_plan', 'mock_code_diff', 'changed_files', 'risk_assessment',
      'test_cases', 'qa_report', 'ac_coverage_matrix'];

    for (const artType of artifactTypes) {
      if (completedData[artType]) {
        const content = completedData[artType];
        let fileRef = null;
        
        if (typeof content === 'string') {
          fileRef = await this._writeArtifactToFile(task.projectId, task.id, `${artType}.md`, content);
        } else {
          fileRef = await this._writeArtifactToFile(task.projectId, task.id, `${artType}.json`, content);
        }

        artifactRows.push({
          id: uuidv4(),
          taskId: task.id,
          projectId: task.projectId,
          agentType: task.type,
          artifactType: artType,
          artifactKey: `${artType}:${task.id}`,
          title: artType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          contentText: typeof content === 'string' ? fileRef : null,
          contentJson: typeof content === 'object' ? { file_path: fileRef.slice(5) } : null,
          ordinal: artifactTypes.indexOf(artType),
          contentHash: contentHash(content),
        });
      }
    }

    if (artifactRows.length > 0) {
      await AgentArtifact.bulkUpsert(artifactRows);
    }

    const outputHash = contentHash(artifactRows.map((a) => a.contentHash));
    await Task.update(task.id, {
      status: 'completed',
      output_content_hash: outputHash,
      result: {
        artifactCount: artifactRows.length,
        agentType: task.type,
        ...(completedData.summary ? { summary: completedData.summary } : {}),
      },
      observability: completedData.observability || {},
    });

    if (userId) {
      QuotaService.recordUsage({
        userId,
        projectId: task.projectId,
        taskId: task.id,
        agentType: task.type,
        tokenInput: completedData.token_usage?.input || 0,
        tokenOutput: completedData.token_usage?.output || 0,
      }).catch(() => {});
    }
  }
}

module.exports = new SdlcWorkflowService();
