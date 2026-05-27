const express = require('express');
const ProjectController = require('../controllers/ProjectController');
const MembershipController = require('../controllers/MembershipController');

const router = express.Router();

router.get('/', ProjectController.list.bind(ProjectController));
router.post('/', ProjectController.create.bind(ProjectController));
router.get('/:id/members', MembershipController.listMembers.bind(MembershipController));
router.post('/:id/invitations', MembershipController.invite.bind(MembershipController));
router.get('/:id/invitations', MembershipController.listInvitations.bind(MembershipController));
router.patch('/:id/members/:userId', MembershipController.updateMember.bind(MembershipController));
router.delete('/:id/members/:userId', MembershipController.removeMember.bind(MembershipController));
router.delete('/:id/invitations/:invitationId', MembershipController.revokeInvitation.bind(MembershipController));
router.patch('/:id', ProjectController.rename.bind(ProjectController));
router.delete('/:id', ProjectController.delete.bind(ProjectController));

module.exports = router;
