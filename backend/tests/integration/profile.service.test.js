jest.mock('../../src/models', () => ({
  Profile: {
    findByUserId: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockAvatarBucket = {
  upload: jest.fn(),
  remove: jest.fn(),
  getPublicUrl: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  storage: {
    from: jest.fn(() => mockAvatarBucket),
  },
}));

jest.mock('../../src/config/environment', () => ({
  SUPABASE_AVATAR_BUCKET: 'avatars',
}));

const { Profile } = require('../../src/models');
const supabase = require('../../src/config/database');
const ProfileService = require('../../src/services/ProfileService');

describe('ProfileService', () => {
  const user = { id: '11111111-1111-1111-1111-111111111111', email: 'user@example.com' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAvatarBucket.upload.mockResolvedValue({ error: null });
    mockAvatarBucket.remove.mockResolvedValue({ error: null });
    mockAvatarBucket.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://cdn.example.com/avatar.png' },
    });
  });

  test('sanitizes and upserts editable profile fields for the current user', async () => {
    Profile.upsert.mockResolvedValue({ userId: user.id, fullName: 'Ada Lovelace' });

    await ProfileService.upsertProfile(user, {
      full_name: '  Ada Lovelace  ',
      age: 36,
      job_title: ' QA Lead ',
      address: '',
      phone: null,
      bio: ' Builds tests ',
    });

    expect(Profile.upsert).toHaveBeenCalledWith(user.id, {
      full_name: 'Ada Lovelace',
      job_title: 'QA Lead',
      address: null,
      phone: null,
      bio: 'Builds tests',
      age: 36,
    });
  });

  test('rejects unknown profile fields', async () => {
    await expect(ProfileService.updateProfile(user, { role: 'admin' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Unknown profile field: role',
    });
  });

  test('rejects manual avatar_url writes because avatar is server-managed', async () => {
    await expect(ProfileService.updateProfile(user, {
      avatar_url: 'https://example.com/avatar.png',
    })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Unknown profile field: avatar_url',
    });
  });

  test('rejects invalid age values', async () => {
    await expect(ProfileService.updateProfile(user, { age: 151 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'age must be an integer between 0 and 150',
    });
  });

  test('patch creates a profile when the current user does not have one yet', async () => {
    Profile.findByUserId.mockResolvedValue(null);
    Profile.upsert.mockResolvedValue({ userId: user.id, fullName: 'New User' });

    const profile = await ProfileService.updateProfile(user, { full_name: 'New User' });

    expect(Profile.upsert).toHaveBeenCalledWith(user.id, { full_name: 'New User' });
    expect(Profile.update).not.toHaveBeenCalled();
    expect(profile).toEqual({ userId: user.id, fullName: 'New User' });
  });

  test('uploads avatar to storage and stores its public URL/path', async () => {
    Profile.findByUserId.mockResolvedValue({
      userId: user.id,
      avatarPath: 'user-1/avatar-old.png',
    });
    Profile.upsert.mockResolvedValue({
      userId: user.id,
      avatarUrl: 'https://cdn.example.com/avatar.png',
      avatarPath: `${user.id}/avatar-new.png`,
    });

    const profile = await ProfileService.uploadAvatar(user, {
      buffer: Buffer.from('avatar'),
      mimetype: 'image/png',
      size: 1024,
    });

    expect(supabase.storage.from).toHaveBeenCalledWith('avatars');
    expect(mockAvatarBucket.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${user.id}/avatar-\\d+\\.png$`)),
      expect.any(Buffer),
      { contentType: 'image/png', upsert: true },
    );
    expect(mockAvatarBucket.remove).toHaveBeenCalledWith(['user-1/avatar-old.png']);
    expect(Profile.upsert).toHaveBeenCalledWith(user.id, {
      avatar_url: 'https://cdn.example.com/avatar.png',
      avatar_path: expect.stringMatching(new RegExp(`^${user.id}/avatar-\\d+\\.png$`)),
    });
    expect(profile.avatarUrl).toBe('https://cdn.example.com/avatar.png');
  });

  test('rejects non-image avatar uploads', async () => {
    await expect(ProfileService.uploadAvatar(user, {
      buffer: Buffer.from('not-image'),
      mimetype: 'text/plain',
      size: 128,
    })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Avatar must be a JPEG, PNG, WEBP, or GIF image',
    });
  });
});
