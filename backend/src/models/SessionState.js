const supabase = require('../config/database');

/**
 * Session State Model - Persist UI state between sessions
 */
class SessionStateModel {
  /**
   * Upsert session state (insert or update)
   * Uses manual check instead of ON CONFLICT to avoid constraint dependency
   */
  static async upsert(data) {
    // First try to find existing record
    const { data: existing } = await supabase
      .from('session_states')
      .select('*')
      .eq('page', data.page)
      .eq('user_id', data.userId)
      .eq('project_id', data.projectId)
      .single();

    if (existing) {
      // Update existing
      const { data: record, error } = await supabase
        .from('session_states')
        .update({
          selected_doc_ids: data.selectedDocIds || [],
          task_id: data.taskId || null,
          metadata: data.metadata || {},
          project_id: data.projectId,
          updated_at: new Date().toISOString(),
        })
        .eq('page', data.page)
        .eq('user_id', data.userId)
        .eq('project_id', data.projectId)
        .select()
        .single();

      if (error) throw error;
      return this._map(record);
    } else {
      // Insert new
      const { data: record, error } = await supabase
        .from('session_states')
        .insert([{
          page: data.page,
          user_id: data.userId,
          project_id: data.projectId,
          selected_doc_ids: data.selectedDocIds || [],
          task_id: data.taskId || null,
          metadata: data.metadata || {},
        }])
        .select()
        .single();

      if (error) throw error;
      return this._map(record);
    }
  }

  /**
   * Find session state by page
   */
  static async findByPage(page, userId, projectId) {
    const { data, error } = await supabase
      .from('session_states')
      .select('*')
      .eq('page', page)
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // No rows found
      throw error;
    }
    return this._map(data);
  }

  /**
   * Delete session state by page
   */
  static async deleteByPage(page, userId, projectId = null) {
    let query = supabase
      .from('session_states')
      .delete()
      .eq('page', page)
      .eq('user_id', userId);

    if (projectId) query = query.eq('project_id', projectId);

    const { error } = await query;

    if (error) throw error;
    return true;
  }

  static async deleteById(id) {
    const { error } = await supabase
      .from('session_states')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  static async updateSelectedDocIds(id, selectedDocIds) {
    const { data: record, error } = await supabase
      .from('session_states')
      .update({
        selected_doc_ids: selectedDocIds,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  /**
   * Update selected_doc_ids to remove deleted document IDs
   */
  static async removeDocIds(docIdsToRemove, options = {}) {
    const ids = new Set((docIdsToRemove || []).filter(Boolean));
    if (ids.size === 0) return;

    let query = supabase
      .from('session_states')
      .select('*');

    if (options.projectId) query = query.eq('project_id', options.projectId);
    if (options.userId) query = query.eq('user_id', options.userId);
    if (options.page) query = query.eq('page', options.page);

    const { data, error } = await query;
    if (error) throw error;

    const touchedStates = (data || [])
      .map(this._map)
      .filter((state) => state.selectedDocIds.some((id) => ids.has(id)));

    for (const state of touchedStates) {
      const updatedDocIds = state.selectedDocIds.filter((id) => !ids.has(id));
      if (updatedDocIds.length === 0) {
        await this.deleteById(state.id);
      } else {
        await this.updateSelectedDocIds(state.id, updatedDocIds);
      }
    }
  }

  /**
   * Map DB columns to camelCase
   */
  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      page: row.page,
      userId: row.user_id,
      projectId: row.project_id,
      selectedDocIds: row.selected_doc_ids || [],
      taskId: row.task_id,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = SessionStateModel;
