describe('database config', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@supabase/supabase-js');
    jest.dontMock('../../src/config/environment');
  });

  test('creates the server-side client with the secret key', () => {
    const client = { from: jest.fn() };
    const createClient = jest.fn(() => client);

    jest.doMock('@supabase/supabase-js', () => ({ createClient }));
    jest.doMock('../../src/config/environment', () => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
    }));

    const supabase = require('../../src/config/database');

    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'sb_secret_test');
    expect(supabase).toBe(client);
  });

  test('fails fast when the secret key is missing', () => {
    jest.doMock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
    jest.doMock('../../src/config/environment', () => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: undefined,
    }));

    expect(() => require('../../src/config/database')).toThrow(
      'SUPABASE_URL and SUPABASE_SECRET_KEY must be set',
    );
  });
});
