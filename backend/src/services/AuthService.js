const { createClient } = require('@supabase/supabase-js');
const { ApiError } = require('../middleware/errorHandler');
const {
  SUPABASE_AUTH_REDIRECT_URL,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
} = require('../config/environment');

// Dedicated client for all user-facing auth operations (signup, signin, token validation).
// Never used for DB/storage — server-side data access uses the secret-key client in database.js.
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    '[Supabase] SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in environment variables.'
  );
}

const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

class AuthService {
  async signUp(payload) {
    const email = payload?.email?.trim();
    const password = payload?.password;

    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          company_name: payload?.company_name || '',
          company_email: payload?.company_email || '',
          job_title: payload?.job_title || '',
        },
        emailRedirectTo: payload?.redirect_to || SUPABASE_AUTH_REDIRECT_URL,
      },
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    return {
      session: data?.session || null,
      user: data?.user || null,
    };
  }

  async signIn(payload) {
    const email = payload?.email?.trim();
    const password = payload?.password;

    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new ApiError(401, error.message);
    }

    return {
      session: data?.session || null,
      user: data?.user || null,
    };
  }

  async getOAuthUrl(payload) {
    const provider = payload?.provider;
    if (!provider || !['google', 'github'].includes(provider)) {
      throw new ApiError(400, 'OAuth provider must be google or github');
    }

    const { data, error } = await authClient.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: payload?.redirect_to || SUPABASE_AUTH_REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    return { url: data?.url || null };
  }

  async getCurrentUser(accessToken) {
    if (!accessToken) {
      throw new ApiError(401, 'Missing access token');
    }

    const { data: { user }, error } = await authClient.auth.getUser(accessToken);
    if (error || !user) {
      throw new ApiError(401, error ? error.message : 'Invalid token');
    }

    return user;
  }

  async requestPasswordReset(payload) {
    const email = payload?.email?.trim();
    if (!email) {
      throw new ApiError(400, 'Email is required');
    }

    const { error } = await authClient.auth.resetPasswordForEmail(email, {
      redirectTo: payload?.redirect_to || SUPABASE_AUTH_REDIRECT_URL,
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    return { sent: true };
  }

  async updatePassword(accessToken, payload) {
    if (!accessToken) {
      throw new ApiError(401, 'Missing access token');
    }

    const password = payload?.password;
    if (!password || password.length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters');
    }

    const supabaseWithToken = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { data, error } = await supabaseWithToken.auth.updateUser({ password });
    if (error) {
      throw new ApiError(400, error.message);
    }

    return {
      user: data?.user || null,
    };
  }
}

module.exports = new AuthService();
