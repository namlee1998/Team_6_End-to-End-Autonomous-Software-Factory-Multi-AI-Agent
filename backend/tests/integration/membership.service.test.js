jest.mock('uuid', () => ({
  v4: jest.fn(() => 'invitation-id'),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('token-bytes')),
}));

jest.mock('../../src/models', () => ({
  Project: {
    findById: jest.fn(),
  },
  ProjectMember: {
    create: jest.fn(),
    find: jest.fn(),
    listByProject: jest.fn(),
    listByUser: jest.fn(),
    countOwners: jest.fn(),
    updateRole: jest.fn(),
    delete: jest.fn(),
  },
  ProjectInvitation: {
    create: jest.fn(),
    findById: jest.fn(),
    findByToken: jest.fn(),
    listByProject: jest.fn(),
    listPendingByEmail: jest.fn(),
    updateStatus: jest.fn(),
  },
}));

const MembershipService = require('../../src/services/MembershipService');
const { Project, ProjectMember, ProjectInvitation } = require('../../src/models');

describe('MembershipService', () => {
  const owner = { id: 'owner-id', email: 'owner@example.com' };
  const admin = { id: 'admin-id', email: 'admin@example.com' };
  const invited = { id: 'invitee-id', email: 'invitee@example.com' };

  beforeEach(() => {
    jest.clearAllMocks();
    Project.findById.mockResolvedValue({ id: 'project-1' });
  });

  test('requires membership before granting project access', async () => {
    ProjectMember.find.mockResolvedValue(null);

    await expect(
      MembershipService.requireProjectRole('user-b', 'project-1', ['viewer']),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You do not have access to this project',
    });
  });

  test('admin cannot change an owner role', async () => {
    ProjectMember.find
      .mockResolvedValueOnce({ projectId: 'project-1', userId: admin.id, role: 'admin' })
      .mockResolvedValueOnce({ projectId: 'project-1', userId: owner.id, role: 'owner' });

    await expect(
      MembershipService.updateMemberRole('project-1', owner.id, admin, 'viewer'),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Admins cannot modify owners',
    });
  });

  test('does not allow removing the last owner', async () => {
    ProjectMember.find
      .mockResolvedValueOnce({ projectId: 'project-1', userId: owner.id, role: 'owner' })
      .mockResolvedValueOnce({ projectId: 'project-1', userId: owner.id, role: 'owner' });
    ProjectMember.countOwners.mockResolvedValue(1);

    await expect(
      MembershipService.removeMember('project-1', owner.id, owner),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot remove the last owner',
    });
  });

  test('accepting an email invite creates membership with invited role', async () => {
    const invitation = {
      id: 'invitation-id',
      projectId: 'project-1',
      email: 'invitee@example.com',
      role: 'editor',
      status: 'pending',
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    ProjectInvitation.findById.mockResolvedValue(invitation);
    ProjectMember.find.mockResolvedValue(null);
    ProjectInvitation.updateStatus.mockResolvedValue({ ...invitation, status: 'accepted' });

    await MembershipService.acceptInvitation(invited, { invitationId: invitation.id });

    expect(ProjectMember.create).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: invited.id,
      role: 'editor',
      invitedBy: owner.id,
    });
    expect(ProjectInvitation.updateStatus).toHaveBeenCalledWith('invitation-id', 'accepted');
  });
});
