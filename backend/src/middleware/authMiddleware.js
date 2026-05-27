const AuthService = require('../services/AuthService');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const queryToken = req.query?.access_token;
  const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;
  const token = tokenFromHeader || queryToken;

  if (!token) {
    return res.status(401).json({
      error: 'Unauthenticated',
      message: 'Missing or invalid access token'
    });
  }

  try {
    const user = await AuthService.getCurrentUser(token);
    req.user = user;
    req.accessToken = token;
    next();
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      error: statusCode === 401 ? 'Unauthenticated' : 'Internal Server Error',
      message: statusCode === 401 ? err.message : 'Failed to authenticate user'
    });
  }
};

module.exports = authMiddleware;
