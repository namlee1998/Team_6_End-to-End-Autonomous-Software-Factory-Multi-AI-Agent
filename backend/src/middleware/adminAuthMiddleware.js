const jwt = require('jsonwebtoken');
const { ADMIN_JWT_SECRET } = require('../config/environment');
const { ApiError } = require('./errorHandler');

function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, 'Admin authentication required'));
  }

  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    req.admin = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired admin token'));
  }
}

module.exports = adminAuthMiddleware;
