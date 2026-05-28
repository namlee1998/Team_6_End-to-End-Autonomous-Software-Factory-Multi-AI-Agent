import type { AuthSession } from './types';

const AUTH_STORAGE_KEY = 'a20_app_auth_session';

const parseSession = (raw: string | null): AuthSession | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.access_token) return null;
    return parsed;
  } catch {
    return null;
  }
};

export function getStoredAuthSession(): AuthSession | null {
  return parseSession(localStorage.getItem(AUTH_STORAGE_KEY));
}

export function setStoredAuthSession(session: AuthSession | null): void {
  if (!session) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuthSession(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
