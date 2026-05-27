const express = require('express');
const FolderController = require('../controllers/FolderController');

const router = express.Router();

router.get('/', FolderController.list.bind(FolderController));
router.post('/', FolderController.create.bind(FolderController));
router.patch('/:id/move', FolderController.move.bind(FolderController));
router.patch('/:id', FolderController.rename.bind(FolderController));
router.delete('/:id', FolderController.delete.bind(FolderController));

module.exports = router;
