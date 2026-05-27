import { create } from 'zustand';
import { adminLogin, type AdminProfile } from '@/services/adminApi';

interface AdminState {
  token: string | null;
  admin: AdminProfile | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  token: null,
  admin: null,

  init: () => {
    const token = localStorage.getItem('admin_token');
    const raw = localStorage.getItem('admin_profile');
    if (token && raw) {
      try { set({ token, admin: JSON.parse(raw) }); } catch { /* ignore */ }
    }
  },

  login: async (email, password) => {
    const { token, admin } = await adminLogin(email, password);
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_profile', JSON.stringify(admin));
    set({ token, admin });
  },

  logout: () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_profile');
    set({ token: null, admin: null });
  },
}));
