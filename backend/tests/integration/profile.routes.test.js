jest.mock('../../src/services/ProfileService', () => ({
  getProfile: jest.fn(),
  emptyProfileForUser: jest.fn(),
  upsertProfile: jest.fn(),
  updateProfile: jest.fn(),
  deleteProfile: jest.fn(),
  uploadAvatar: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const ProfileService = require('../../src/services/ProfileService');
const profileRouter = require('../../src/routes/profile');

const user = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'user@example.com',
};

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/profile', profileRouter);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ status: 'error', message: error.message });
  });
  return app;
};

const profile = {
  userId: user.id,
  fullName: 'Ada Lovelace',
  age: 36,
  jobTitle: 'QA Lead',
  address: 'Da Nang',
  phone: '0900000000',
  bio: 'Builds test systems',
  avatarUrl: 'https://example.com/avatar.png',
  avatarPath: 'user-1/avatar.png',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-02T00:00:00.000Z',
};

describe('profile routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /profile returns the current user profile', async () => {
    ProfileService.getProfile.mockResolvedValue(profile);

    const response = await request(createApp()).get('/profile');

    expect(response.status).toBe(200);
    expect(ProfileService.getProfile).toHaveBeenCalledWith(user);
    expect(response.body).toEqual({
      status: 'success',
      data: {
        user_id: user.id,
        email: user.email,
        full_name: 'Ada Lovelace',
        age: 36,
        job_title: 'QA Lead',
        address: 'Da Nang',
        phone: '0900000000',
        bio: 'Builds test systems',
        avatar_url: 'https://example.com/avatar.png',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
    });
  });

  test('GET /profile returns an empty profile shape when no row exists', async () => {
    ProfileService.getProfile.mockResolvedValue(null);
    ProfileService.emptyProfileForUser.mockReturnValue({
      ...profile,
      fullName: null,
      age: null,
      jobTitle: null,
      address: null,
      phone: null,
      bio: null,
      avatarUrl: null,
      createdAt: null,
      updatedAt: null,
    });

    const response = await request(createApp()).get('/profile');

    expect(response.status).toBe(200);
    expect(ProfileService.emptyProfileForUser).toHaveBeenCalledWith(user);
    expect(response.body.data).toMatchObject({
      user_id: user.id,
      email: user.email,
      full_name: null,
      created_at: null,
      updated_at: null,
    });
  });

  test('POST and PATCH delegate writes to the current user', async () => {
    ProfileService.upsertProfile.mockResolvedValue(profile);
    ProfileService.updateProfile.mockResolvedValue({ ...profile, fullName: 'Grace Hopper' });
    const app = createApp();

    const created = await request(app).post('/profile').send({ full_name: 'Ada Lovelace' });
    const updated = await request(app).patch('/profile').send({ full_name: 'Grace Hopper' });

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(ProfileService.upsertProfile).toHaveBeenCalledWith(user, { full_name: 'Ada Lovelace' });
    expect(ProfileService.updateProfile).toHaveBeenCalledWith(user, { full_name: 'Grace Hopper' });
    expect(updated.body.data.full_name).toBe('Grace Hopper');
  });

  test('DELETE /profile removes only extended profile data', async () => {
    ProfileService.deleteProfile.mockResolvedValue(true);

    const response = await request(createApp()).delete('/profile');

    expect(response.status).toBe(200);
    expect(ProfileService.deleteProfile).toHaveBeenCalledWith(user);
    expect(response.body).toEqual({
      status: 'success',
      message: 'Profile deleted successfully',
    });
  });

  test('POST /profile/avatar uploads the current user avatar', async () => {
    ProfileService.uploadAvatar.mockResolvedValue({
      ...profile,
      avatarUrl: 'https://cdn.example.com/avatar.png',
    });

    const response = await request(createApp())
      .post('/profile/avatar')
      .attach('avatar', Buffer.from('avatar'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(200);
    expect(ProfileService.uploadAvatar).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        originalname: 'avatar.png',
        mimetype: 'image/png',
      }),
    );
    expect(response.body.data.avatar_url).toBe('https://cdn.example.com/avatar.png');
  });
});
