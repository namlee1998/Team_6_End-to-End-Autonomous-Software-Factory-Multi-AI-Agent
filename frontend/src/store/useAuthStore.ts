import { create } from 'zustand';
import {
  clearStoredAuthSession,
  getCurrentUser,
  getStoredAuthSession,
  setStoredAuthSession,
  signOutAuth,
  type AuthSession,
  type AuthUser,
} from '@/services/api';

export const PASSWORD_RECOVERY_FLOW_KEY = 'a20_app_password_recovery';

interface AuthState {
  session: AuthSession | null;
  user: AuthUser | null;
  isInitialized: boolean;
  setSession: (session: AuthSession | null) => void;
  initializeAuth: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isInitialized: false,

  setSession: (session) => {
    setStoredAuthSession(session);
    set({ session, user: session?.user || null });
  },

  initializeAuth: async () => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashAccessToken = hashParams.get('access_token');
    const hashRefreshToken = hashParams.get('refresh_token');
    const hashExpiresIn = hashParams.get('expires_in');
    const hashType = hashParams.get('type');

    if (hashAccessToken) {
      const expiresAt = hashExpiresIn
        ? Math.floor(Date.now() / 1000) + Number(hashExpiresIn)
        : null;
      const hashSession: AuthSession = {
        access_token: hashAccessToken,
        refresh_token: hashRefreshToken,
        expires_at: Number.isNaN(expiresAt) ? null : expiresAt,
        user: null,
      };
      setStoredAuthSession(hashSession);
      if (hashType === 'recovery') {
        sessionStorage.setItem(PASSWORD_RECOVERY_FLOW_KEY, '1');
      } else {
        sessionStorage.removeItem(PASSWORD_RECOVERY_FLOW_KEY);
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    const session = getStoredAuthSession();
    if (!session) {
      sessionStorage.removeItem(PASSWORD_RECOVERY_FLOW_KEY);
      set({ session: null, user: null, isInitialized: true });
      return;
    }

    set({ session, user: session.user, isInitialized: false });

    try {
      const user = await getCurrentUser();
      const nextSession = { ...session, user };
      setStoredAuthSession(nextSession);
      set({ session: nextSession, user, isInitialized: true });
    } catch {
      clearStoredAuthSession();
      sessionStorage.removeItem(PASSWORD_RECOVERY_FLOW_KEY);
      set({ session: null, user: null, isInitialized: true });
    }
  },

  signOut: async () => {
    try {
      if (get().session?.access_token) {
        await signOutAuth();
      }
    } catch {
      // Local sign out should still happen even if backend sign-out fails.
    }
    clearStoredAuthSession();
    sessionStorage.removeItem(PASSWORD_RECOVERY_FLOW_KEY);
    set({ session: null, user: null });
  },
}));
