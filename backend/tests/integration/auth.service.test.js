describe('AuthService', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@supabase/supabase-js');
    jest.dontMock('../../src/config/environment');
  });

  test('uses the publishable key for auth client operations', async () => {
    const getUser = jest.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const createClient = jest.fn(() => ({ auth: { getUser } }));

    jest.doMock('@supabase/supabase-js', () => ({ createClient }));
    jest.doMock('../../src/config/environment', () => ({
      SUPABASE_AUTH_REDIRECT_URL: 'http://localhost:5173/auth',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    }));

    const AuthService = require('../../src/services/AuthService');
    const user = await AuthService.getCurrentUser('access-token');

    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'sb_publishable_test');
    expect(getUser).toHaveBeenCalledWith('access-token');
    expect(user).toEqual({ id: 'user-1' });
  });

  test('fails fast when the publishable key is missing', () => {
    jest.doMock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
    jest.doMock('../../src/config/environment', () => ({
      SUPABASE_AUTH_REDIRECT_URL: 'http://localhost:5173/auth',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: undefined,
    }));

    expect(() => require('../../src/services/AuthService')).toThrow(
      'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set',
    );
  });
});
