const QuotaService = require('../services/QuotaService');

class QuotaController {
  async getSummary(req, res, next) {
    try {
      const summary = await QuotaService.getSummary(req.user.id);
      return res.json({ status: 'success', data: summary });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new QuotaController();
