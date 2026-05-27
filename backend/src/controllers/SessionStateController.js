const SessionStateService = require('../services/SessionStateService');

/**
 * Session State Controller - Handle session state HTTP requests
 */
class SessionStateController {
  /**
   * Save or update session state
   * POST /api/v1/sessions/:page
   */
  async saveState(req, res, next) {
    try {
      const { page } = req.params;
      const { selectedDocIds, taskId, metadata } = req.body;

      if (!page) {
        return res.status(400).json({
          status: 'error',
          message: 'page parameter is required',
        });
      }

      const state = await SessionStateService.saveState({
        page,
        selectedDocIds,
        taskId,
        metadata,
        user: req.user,
      });

      return res.json({
        status: 'success',
        data: state,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get session state
   * GET /api/v1/sessions/:page
   */
  async getState(req, res, next) {
    try {
      const { page } = req.params;

      if (!page) {
        return res.status(400).json({
          status: 'error',
          message: 'page parameter is required',
        });
      }

      const state = await SessionStateService.getState(page, req.user, req.query?.project_id);

      return res.json({
        status: 'success',
        data: state,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete session state
   * DELETE /api/v1/sessions/:page
   */
  async deleteState(req, res, next) {
    try {
      const { page } = req.params;

      if (!page) {
        return res.status(400).json({
          status: 'error',
          message: 'page parameter is required',
        });
      }

      await SessionStateService.clearState(page, req.user, req.query?.project_id || null);

      return res.json({
        status: 'success',
        message: 'Session state cleared',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SessionStateController();
