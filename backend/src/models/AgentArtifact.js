const supabase = require('../config/database');

class AgentArtifactModel {
  static async bulkUpsert(records) {
    if (!records || records.length === 0) return [];

    const rows = records.map((data, index) => ({
      task_id: data.taskId,
      project_id: data.projectId,
      agent_type: data.agentType,
      artifact_type: data.artifactType,
      artifact_key: data.artifactKey,
      title: data.title ?? null,
      content_json: data.contentJson ?? null,
      content_text: data.contentText ?? null,
      ordinal: data.ordinal ?? index,
      source_artifact_id: data.sourceArtifactId ?? null,
      content_hash: data.contentHash ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { data: result, error } = await supabase
      .from('agent_artifacts')
      .upsert(rows, { onConflict: 'task_id,artifact_type,artifact_key' })
      .select();

    if (error) throw error;
    return (result || []).map((row) => this._map(row));
  }

  static async findByTaskId(taskId) {
    const { data, error } = await supabase
      .from('agent_artifacts')
      .select('*')
      .eq('task_id', taskId)
      .order('ordinal', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => this._map(row));
  }

  static async findByTaskIdAndType(taskId, artifactType) {
    const { data, error } = await supabase
      .from('agent_artifacts')
      .select('*')
      .eq('task_id', taskId)
      .eq('artifact_type', artifactType)
      .order('ordinal', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => this._map(row));
  }

  static async findPartialByOffset(taskId, offset = 0) {
    const allArtifacts = await this.findByTaskId(taskId);
    return {
      artifacts: allArtifacts.slice(offset),
      nextOffset: allArtifacts.length,
    };
  }

  static async deleteByTaskId(taskId) {
    const { error } = await supabase
      .from('agent_artifacts')
      .delete()
      .eq('task_id', taskId);

    if (error) throw error;
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      taskId: row.task_id,
      projectId: row.project_id,
      agentType: row.agent_type,
      artifactType: row.artifact_type,
      artifactKey: row.artifact_key,
      title: row.title,
      contentJson: row.content_json,
      contentText: row.content_text,
      ordinal: row.ordinal,
      sourceArtifactId: row.source_artifact_id,
      contentHash: row.content_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = AgentArtifactModel;
