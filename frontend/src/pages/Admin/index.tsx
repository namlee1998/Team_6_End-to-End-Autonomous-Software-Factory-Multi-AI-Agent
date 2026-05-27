import React, { useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAdminStore } from '@/store/useAdminStore';
import { AdminLogin } from './AdminLogin';
import { AdminDashboard } from './AdminDashboard';
import { AdminUsers } from './AdminUsers';

function AdminShell() {
  const { token, admin, logout } = useAdminStore();
  const navigate = useNavigate();

  if (!token) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 w-52 bg-white border-r border-slate-100 flex flex-col">
        <div className="p-5 border-b border-slate-100">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">A20 Admin</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{admin?.email}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
            { to: '/admin/users', label: 'Users', icon: 'group' },
          ].map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              <span className="material-symbols-outlined text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => { logout(); navigate('/admin/login'); }}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-sm text-slate-500 hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-base">logout</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-52 min-w-0">
        <Routes>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function AdminApp() {
  const init = useAdminStore((s) => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <Routes>
      <Route path="login" element={<AdminLoginRedirect />} />
      <Route path="*" element={<AdminShell />} />
    </Routes>
  );
}

function AdminLoginRedirect() {
  const token = useAdminStore((s) => s.token);
  const init = useAdminStore((s) => s.init);
  useEffect(() => { init(); }, [init]);

  if (token) return <Navigate to="/admin/dashboard" replace />;
  return <AdminLogin />;
}
