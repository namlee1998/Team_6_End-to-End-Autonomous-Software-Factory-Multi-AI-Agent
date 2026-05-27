const supabase = require('../config/database');

/**
 * HitlDecision — Human-in-the-Loop quality gate decisions.
 * Maps 1:1 with a task (one gate per agent phase).
 *
 * gate values: REQUIREMENT_GATE | UX_GATE | DEV_GATE | QA_GATE | FINAL_GATE
 * decision values: APPROVE | REJECT | REQUEST_CHANGES
 */
class HitlDecisionModel {
  static async create(data) {
    const { data: record, error } = await supabase
      .from('hitl_decisions')
      .insert([{
        id: data.id,
        workflow_run_id: data.workflowRunId,
        task_id: data.taskId,
        project_id: data.projectId,
        gate: data.gate,
        decision: data.decision,
        comment: data.comment || null,
        reviewer_id: data.reviewerId || null,
        created_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async findByTaskId(taskId) {
    const { data, error } = await supabase
      .from('hitl_decisions')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static async findByProjectId(projectId) {
    const { data, error } = await supabase
      .from('hitl_decisions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async findLatestByWorkflowRunId(workflowRunId) {
    const { data, error } = await supabase
      .from('hitl_decisions')
      .select('*')
      .eq('workflow_run_id', workflowRunId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      workflowRunId: row.workflow_run_id,
      taskId: row.task_id,
      projectId: row.project_id,
      gate: row.gate,
      decision: row.decision,
      comment: row.comment,
      reviewerId: row.reviewer_id,
      createdAt: row.created_at,
    };
  }
}

module.exports = HitlDecisionModel;
