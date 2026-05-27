import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const MainLayout: React.FC = () => {
  return (
    <div className="app-shell text-on-surface antialiased overflow-hidden min-h-screen flex">
      <Sidebar />
      <div className="relative flex-1 flex flex-col ml-64">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-44 left-1/3 h-[420px] w-[420px] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-32 right-12 h-[320px] w-[320px] rounded-full bg-tertiary/10 blur-3xl" />
        </div>
        <div className="relative z-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
