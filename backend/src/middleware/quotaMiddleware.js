const QuotaService = require('../services/QuotaService');

/**
 * Middleware: block agent execution if user has no credits remaining.
 * Must run after authMiddleware (req.user must be set).
 */
const quotaMiddleware = async (req, res, next) => {
  try {
    await QuotaService.checkQuota(req.user.id);
    next();
  } catch (err) {
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({
      error: status === 402 ? 'QuotaExceeded' : status === 403 ? 'AccountSuspended' : 'InternalError',
      message: err.message,
    });
  }
};

module.exports = quotaMiddleware;
