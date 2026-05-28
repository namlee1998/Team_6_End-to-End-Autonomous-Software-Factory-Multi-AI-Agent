jest.mock('../../src/services/AuthService', () => ({
  getCurrentUser: jest.fn(),
}));

const authMiddleware = require('../../src/middleware/authMiddleware');
const AuthService = require('../../src/services/AuthService');

const createRes = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('delegates bearer token validation to AuthService and attaches auth context', async () => {
    AuthService.getCurrentUser.mockResolvedValue({ id: 'user-1' });
    const req = {
      headers: { authorization: 'Bearer access-token' },
      query: {},
    };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(AuthService.getCurrentUser).toHaveBeenCalledWith('access-token');
    expect(req.user).toEqual({ id: 'user-1' });
    expect(req.accessToken).toBe('access-token');
    expect(next).toHaveBeenCalled();
  });

  test('returns unauthenticated when AuthService rejects a token', async () => {
    AuthService.getCurrentUser.mockRejectedValue(Object.assign(new Error('Invalid token'), {
      statusCode: 401,
    }));
    const req = {
      headers: { authorization: 'Bearer bad-token' },
      query: {},
    };
    const res = createRes();

    await authMiddleware(req, res, jest.fn());

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: 'Unauthenticated',
      message: 'Invalid token',
    });
  });
});
