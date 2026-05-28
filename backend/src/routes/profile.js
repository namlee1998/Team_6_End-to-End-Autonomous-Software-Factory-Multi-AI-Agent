const express = require('express');
const multer = require('multer');
const ProfileController = require('../controllers/ProfileController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.get('/', ProfileController.get.bind(ProfileController));
router.post('/', ProfileController.create.bind(ProfileController));
router.patch('/', ProfileController.update.bind(ProfileController));
router.delete('/', ProfileController.delete.bind(ProfileController));
router.post('/avatar', upload.single('avatar'), ProfileController.uploadAvatar.bind(ProfileController));

module.exports = router;
