const express = require('express');
const MembershipController = require('../controllers/MembershipController');

const router = express.Router();

router.post('/accept', MembershipController.accept.bind(MembershipController));
router.get('/mine', MembershipController.mine.bind(MembershipController));

module.exports = router;
