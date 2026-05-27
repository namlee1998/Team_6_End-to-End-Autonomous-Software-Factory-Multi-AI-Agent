const MembershipService = require('../services/MembershipService');

function mapMember(member) {
  return {
    project_id: member.projectId,
    user_id: member.userId,
    role: member.role,
    invited_by: member.invitedBy,
    joined_at: member.joinedAt,
    created_at: member.createdAt,
    email: member.email || null,
    full_name: member.fullName || null,
  };
}

function mapInvitation(invitation) {
  return {
    invitation_id: invitation.id,
    project_id: invitation.projectId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    invited_by: invitation.invitedBy,
    expires_at: invitation.expiresAt,
    created_at: invitation.createdAt,
    project_name: invitation.projectName || null,
  };
}

class MembershipController {
  async listMembers(req, res, next) {
    try {
      const rows = await MembershipService.listMembers(req.params.id, req.user);
      return res.json({ status: 'success', data: rows.map(mapMember) });
    } catch (error) {
      next(error);
    }
  }

  async invite(req, res, next) {
    try {
      const invitation = await MembershipService.inviteMember(req.params.id, req.user, req.body);
      return res.status(201).json({ status: 'success', data: mapInvitation(invitation) });
    } catch (error) {
      next(error);
    }
  }

  async listInvitations(req, res, next) {
    try {
      const rows = await MembershipService.listProjectInvitations(req.params.id, req.user);
      return res.json({ status: 'success', data: rows.map(mapInvitation) });
    } catch (error) {
      next(error);
    }
  }

  async updateMember(req, res, next) {
    try {
      const member = await MembershipService.updateMemberRole(
        req.params.id,
        req.params.userId,
        req.user,
        req.body?.role,
      );
      return res.json({ status: 'success', data: mapMember(member) });
    } catch (error) {
      next(error);
    }
  }

  async removeMember(req, res, next) {
    try {
      await MembershipService.removeMember(req.params.id, req.params.userId, req.user);
      return res.json({ status: 'success' });
    } catch (error) {
      next(error);
    }
  }

  async revokeInvitation(req, res, next) {
    try {
      const invitation = await MembershipService.revokeInvitation(
        req.params.id,
        req.params.invitationId,
        req.user,
      );
      return res.json({ status: 'success', data: mapInvitation(invitation) });
    } catch (error) {
      next(error);
    }
  }

  async accept(req, res, next) {
    try {
      const invitation = await MembershipService.acceptInvitation(req.user, {
        invitationId: req.body?.invitation_id,
        token: req.body?.token,
      });
      return res.json({ status: 'success', data: mapInvitation(invitation) });
    } catch (error) {
      next(error);
    }
  }

  async mine(req, res, next) {
    try {
      const rows = await MembershipService.listMine(req.user);
      return res.json({ status: 'success', data: rows.map(mapInvitation) });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MembershipController();
