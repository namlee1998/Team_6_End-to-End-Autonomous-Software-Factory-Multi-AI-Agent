const express = require('express');
const SessionStateController = require('../controllers/SessionStateController');

const router = express.Router();

// Session state routes
router.get('/:page', SessionStateController.getState.bind(SessionStateController));
router.post('/:page', SessionStateController.saveState.bind(SessionStateController));
router.delete('/:page', SessionStateController.deleteState.bind(SessionStateController));

module.exports = router;
