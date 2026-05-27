const express = require('express');
const authRoutes = require('./auth');
const documentRoutes = require('./documents');
const projectRoutes = require('./projects');
const folderRoutes = require('./folders');
const treeRoutes = require('./tree');
const workflowRoutes = require('./workflows');
const sdlcRoutes = require('./sdlc');
const sessionRoutes = require('./sessions');
const profileRoutes = require('./profile');
const invitationRoutes = require('./invitations');
const quotaRoutes = require('./quota');
const adminRoutes = require('./admin');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);

// Protected routes
router.use('/documents',   authMiddleware, documentRoutes);
router.use('/projects',    authMiddleware, projectRoutes);
router.use('/folders',     authMiddleware, folderRoutes);
router.use('/tree',        authMiddleware, treeRoutes);
router.use('/workflows',   authMiddleware, workflowRoutes);
router.use('/sdlc',        authMiddleware, sdlcRoutes);     // ← AIDLC routes
router.use('/sessions',    authMiddleware, sessionRoutes);
router.use('/profile',     authMiddleware, profileRoutes);
router.use('/invitations', authMiddleware, invitationRoutes);
router.use('/quota',       authMiddleware, quotaRoutes);

module.exports = router;
