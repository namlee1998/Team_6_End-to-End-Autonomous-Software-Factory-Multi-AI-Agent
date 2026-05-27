const supabase = require('../config/database');

class TestcaseModel {
  static async create(data) {
    const { data: record, error } = await supabase
      .from('testcases')
      .insert([{
        id: data.id,
        task_id: data.taskId,
        project_id: data.projectId,
        feature_name: data.featureName,
        flow_name: data.flowName,
        scenario_data: data.scenarioData,
        automation_yaml: data.automationYaml,
        yaml_filename: data.yamlFilename,
      }])
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async bulkCreate(records) {
    if (!records || records.length === 0) return [];

    const rows = records.map(data => ({
      id: data.id,
      task_id: data.taskId,
      project_id: data.projectId ?? null,
      feature_name: data.featureName,
      flow_name: data.flowName,
      scenario_data: data.scenarioData,
      automation_yaml: data.automationYaml ?? null,
      yaml_filename: data.yamlFilename ?? null,
    }));

    const { data: result, error } = await supabase
      .from('testcases')
      .insert(rows)
      .select();

    if (error) throw error;
    return (result || []).map(row => this._map(row));
  }

  static async findByTaskId(taskId) {
    const { data, error } = await supabase
      .from('testcases')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static async deleteByTaskId(taskId) {
    const { error } = await supabase
      .from('testcases')
      .delete()
      .eq('task_id', taskId);

    if (error) throw error;
  }

  static async findByProjectId(projectId) {
    const { data, error } = await supabase
      .from('testcases')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(this._map);
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      taskId: row.task_id,
      projectId: row.project_id,
      featureName: row.feature_name,
      flowName: row.flow_name,
      scenarioData: row.scenario_data,
      automationYaml: row.automation_yaml,
      yamlFilename: row.yaml_filename,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = TestcaseModel;
