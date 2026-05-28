const express = require('express');
const QuotaController = require('../controllers/QuotaController');

const router = express.Router();

router.get('/', QuotaController.getSummary.bind(QuotaController));

module.exports = router;
