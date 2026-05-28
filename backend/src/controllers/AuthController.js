const AuthService = require('../services/AuthService');

class AuthController {
  async signUp(req, res, next) {
    try {
      const data = await AuthService.signUp(req.body);
      return res.status(201).json({
        status: 'success',
        data,
      });
    } catch (error) {
      return next(error);
    }
  }

  async signIn(req, res, next) {
    try {
      const data = await AuthService.signIn(req.body);
      return res.json({
        status: 'success',
        data,
      });
    } catch (error) {
      return next(error);
    }
  }

  async oauthUrl(req, res, next) {
    try {
      const data = await AuthService.getOAuthUrl(req.body);
      return res.json({
        status: 'success',
        data,
      });
    } catch (error) {
      return next(error);
    }
  }

  async me(req, res, _next) {
    return res.json({
      status: 'success',
      data: {
        user: req.user,
      },
    });
  }

  async signOut(_req, res, _next) {
    return res.json({
      status: 'success',
      message: 'Signed out',
    });
  }

  async resetPassword(req, res, next) {
    try {
      const data = await AuthService.requestPasswordReset(req.body);
      return res.json({
        status: 'success',
        data,
      });
    } catch (error) {
      return next(error);
    }
  }

  async updatePassword(req, res, next) {
    try {
      const data = await AuthService.updatePassword(req.accessToken, req.body);
      return res.json({
        status: 'success',
        data,
      });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new AuthController();
