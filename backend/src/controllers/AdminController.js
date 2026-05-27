const AdminService = require('../services/AdminService');

class AdminController {
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required' });
      }
      const result = await AdminService.login(email, password);
      res.json(result);
    } catch (err) { next(err); }
  }

  async createAdmin(req, res, next) {
    try {
      const { email, password, fullName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required' });
      }
      const admin = await AdminService.createAdmin(
        { email, password, fullName },
        req.admin.id,
      );
      res.status(201).json(admin);
    } catch (err) { next(err); }
  }

  async getStats(req, res, next) {
    try {
      const snapshots = await AdminService.getStats(req.query.window, {
        failuresLimit: req.query.failuresLimit,
        failuresOffset: req.query.failuresOffset,
        tracesLimit: req.query.tracesLimit,
        tracesOffset: req.query.tracesOffset,
      });
      res.json(snapshots);
    } catch (err) { next(err); }
  }

  async listUsers(req, res, next) {
    try {
      const { limit = 50, offset = 0, plan_id, status, search } = req.query;
      const result = await AdminService.listUsers({
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        planId: plan_id,
        status,
        search,
      });
      res.json(result);
    } catch (err) { next(err); }
  }

  async getUserDetail(req, res, next) {
    try {
      const detail = await AdminService.getUserDetail(req.params.userId, {
        usageLimit: req.query.usageLimit,
        usageOffset: req.query.usageOffset,
      });
      res.json(detail);
    } catch (err) { next(err); }
  }

  async changePlan(req, res, next) {
    try {
      const { plan_id } = req.body;
      if (!plan_id) return res.status(400).json({ error: 'plan_id required' });
      await AdminService.changePlan(req.params.userId, plan_id, req.admin.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }

  async suspendUser(req, res, next) {
    try {
      const { reason } = req.body;
      await AdminService.suspendUser(req.params.userId, reason, req.admin.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }

  async unsuspendUser(req, res, next) {
    try {
      await AdminService.unsuspendUser(req.params.userId, req.admin.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }

  async resetCredits(req, res, next) {
    try {
      await AdminService.resetCredits(req.params.userId, req.admin.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }

  async getRecentUsage(req, res, next) {
    try {
      const { limit = 100, offset = 0 } = req.query;
      const result = await AdminService.getRecentUsage({
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });
      res.json(result);
    } catch (err) { next(err); }
  }

  async getFunnel(req, res, next) {
    try {
      const windowDays = parseInt(req.query.window_days, 10) || 30;
      const data = await AdminService.getFunnelData({ windowDays });
      res.json({ status: 'success', data });
    } catch (err) { next(err); }
  }

  async getAuditLog(req, res, next) {
    try {
      const { limit = 100, offset = 0 } = req.query;
      const result = await AdminService.getAuditLog({
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });
      res.json(result);
    } catch (err) { next(err); }
  }
}

module.exports = new AdminController();
