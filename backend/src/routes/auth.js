const express = require('express');
const AuthController = require('../controllers/AuthController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/sign-up', AuthController.signUp.bind(AuthController));
router.post('/sign-in', AuthController.signIn.bind(AuthController));
router.post('/oauth-url', AuthController.oauthUrl.bind(AuthController));
router.post('/reset-password', AuthController.resetPassword.bind(AuthController));
router.get('/me', authMiddleware, AuthController.me.bind(AuthController));
router.post('/sign-out', authMiddleware, AuthController.signOut.bind(AuthController));
router.post('/update-password', authMiddleware, AuthController.updatePassword.bind(AuthController));

module.exports = router;
