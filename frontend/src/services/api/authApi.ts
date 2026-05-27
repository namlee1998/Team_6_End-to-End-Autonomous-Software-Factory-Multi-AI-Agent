import api from './client';
import type { AuthSession, AuthUser, Profile, ProfilePayload } from './types';

export {
  clearStoredAuthSession,
  getStoredAuthSession,
  setStoredAuthSession,
} from './authStorage';

export async function signUpWithEmail(payload: {
  email: string;
  password: string;
  company_name?: string;
  company_email?: string;
  job_title?: string;
  redirect_to?: string;
}): Promise<{ session: AuthSession | null; user: AuthUser | null }> {
  const { data } = await api.post<{
    status: 'success';
    data: { session: AuthSession | null; user: AuthUser | null };
  }>('/auth/sign-up', payload);
  return data.data;
}

export async function signInWithEmail(payload: {
  email: string;
  password: string;
}): Promise<{ session: AuthSession | null; user: AuthUser | null }> {
  const { data } = await api.post<{
    status: 'success';
    data: { session: AuthSession | null; user: AuthUser | null };
  }>('/auth/sign-in', payload);
  return data.data;
}

export async function getOAuthUrl(payload: {
  provider: 'google' | 'github';
  redirect_to?: string;
}): Promise<{ url: string | null }> {
  const { data } = await api.post<{
    status: 'success';
    data: { url: string | null };
  }>('/auth/oauth-url', payload);
  return data.data;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await api.get<{
    status: 'success';
    data: { user: AuthUser };
  }>('/auth/me');
  return data.data.user;
}

export async function signOutAuth(): Promise<void> {
  await api.post('/auth/sign-out');
}

export async function requestPasswordReset(payload: {
  email: string;
  redirect_to?: string;
}): Promise<void> {
  await api.post('/auth/reset-password', payload);
}

export async function updatePassword(payload: { password: string }): Promise<void> {
  await api.post('/auth/update-password', payload);
}

export async function getProfile(): Promise<Profile> {
  const { data } = await api.get<{
    status: 'success';
    data: Profile;
  }>('/profile');
  return data.data;
}

export async function createProfile(payload: ProfilePayload): Promise<Profile> {
  const { data } = await api.post<{
    status: 'success';
    data: Profile;
  }>('/profile', payload);
  return data.data;
}

export async function updateProfile(payload: ProfilePayload): Promise<Profile> {
  const { data } = await api.patch<{
    status: 'success';
    data: Profile;
  }>('/profile', payload);
  return data.data;
}

export async function deleteProfile(): Promise<void> {
  await api.delete('/profile');
}

export async function uploadProfileAvatar(file: File): Promise<Profile> {
  const formData = new FormData();
  formData.append('avatar', file);

  const { data } = await api.post<{
    status: 'success';
    data: Profile;
  }>('/profile/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}
