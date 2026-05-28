const express = require('express');
const WorkflowController = require('../controllers/WorkflowController');
const quotaMiddleware = require('../middleware/quotaMiddleware');

const router = express.Router();

// Workflow execution routes — quota checked before triggering any agent
router.post('/extract-flows', quotaMiddleware, WorkflowController.extractFlows.bind(WorkflowController));
router.post('/resolve-unknowns', quotaMiddleware, WorkflowController.resolveUnknowns.bind(WorkflowController));
router.post('/generate-testcases', quotaMiddleware, WorkflowController.generateTestcases.bind(WorkflowController));
router.post('/generate-automation', quotaMiddleware, WorkflowController.generateAutomation.bind(WorkflowController));

// Task status routes
router.get('/status/:task_id', WorkflowController.streamStatus.bind(WorkflowController));
router.get('/tasks', WorkflowController.listTasks.bind(WorkflowController));
router.get('/tasks/:task_id', WorkflowController.getTaskStatus.bind(WorkflowController));
router.delete('/tasks/:task_id', WorkflowController.deleteTask.bind(WorkflowController));

// Pipeline versioning routes
router.post('/tasks/:task_id/commit', WorkflowController.commitTask.bind(WorkflowController));
router.get('/staleness', WorkflowController.checkStaleness.bind(WorkflowController));

// Auto-load route
router.get('/latest/:documentId', WorkflowController.getLatestTask.bind(WorkflowController));

module.exports = router;
