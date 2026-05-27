const express = require('express');
const AdminController = require('../controllers/AdminController');
const adminAuth = require('../middleware/adminAuthMiddleware');

const router = express.Router();

// Public — admin login
router.post('/auth/login', AdminController.login.bind(AdminController));

// All routes below require admin JWT
router.use(adminAuth);

router.post('/admins', AdminController.createAdmin.bind(AdminController));
router.get('/stats', AdminController.getStats.bind(AdminController));
router.get('/users', AdminController.listUsers.bind(AdminController));
router.get('/users/:userId', AdminController.getUserDetail.bind(AdminController));
router.post('/users/:userId/plan', AdminController.changePlan.bind(AdminController));
router.post('/users/:userId/suspend', AdminController.suspendUser.bind(AdminController));
router.post('/users/:userId/unsuspend', AdminController.unsuspendUser.bind(AdminController));
router.post('/users/:userId/reset-credits', AdminController.resetCredits.bind(AdminController));
router.get('/usage', AdminController.getRecentUsage.bind(AdminController));
router.get('/audit', AdminController.getAuditLog.bind(AdminController));
router.get('/analytics/funnel', AdminController.getFunnel.bind(AdminController));

module.exports = router;
