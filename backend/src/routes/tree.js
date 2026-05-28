const express = require('express');
const TreeController = require('../controllers/TreeController');

const router = express.Router();

router.get('/', TreeController.getTree.bind(TreeController));

module.exports = router;
