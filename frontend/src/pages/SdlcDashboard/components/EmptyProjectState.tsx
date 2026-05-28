import React from 'react';
import { Bot, PlusCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/useAppStore';

export default function EmptyProjectState() {
  const setCreateProjectDialogOpen = useAppStore((s) => s.setCreateProjectDialogOpen);

  return (
    <div className="sdlc-empty-state">
      <motion.div 
        className="sdlc-empty-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="sdlc-empty-icon-wrap">
          <Bot size={48} className="sdlc-empty-icon" />
        </div>
        <h2>Welcome to Autonomous Factory</h2>
        <p>
          Trạm kiểm soát SDLC (Software Development Life Cycle) đã sẵn sàng.<br/>
          Vui lòng chọn một dự án từ Sidebar bên trái, hoặc tạo dự án mới để khởi chạy LangGraph Agents.
        </p>
        <button 
          className="sdlc-empty-hint hover:bg-emerald-500/20 transition-colors cursor-pointer"
          onClick={() => setCreateProjectDialogOpen(true)}
        >
          <PlusCircle size={16} /> <span>Tạo dự án đầu tiên của bạn ngay!</span>
        </button>
      </motion.div>
    </div>
  );
}
