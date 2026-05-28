import { useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  taskId: string;
  onDecision: (decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES', comment: string) => Promise<void>;
  onClose: () => void;
}

const DECISIONS = [
  { value: 'APPROVE' as const,          label: 'Approve',          icon: '✅', cls: 'gate-btn--approve',  desc: 'Output đạt yêu cầu. Tiếp tục phase tiếp theo.' },
  { value: 'REQUEST_CHANGES' as const,  label: 'Request Changes',  icon: '🔄', cls: 'gate-btn--changes',  desc: 'Cần chỉnh sửa. Agent sẽ chạy lại với feedback.' },
  { value: 'REJECT' as const,           label: 'Reject',           icon: '❌', cls: 'gate-btn--reject',   desc: 'Output không đạt. Tạm dừng workflow.' },
];

export default function HumanGatePanel({ taskId, onDecision, onClose }: Props) {
  const [selected, setSelected]   = useState<typeof DECISIONS[number]['value'] | null>(null);
  const [comment, setComment]     = useState('');
  const [loading, setLoading]     = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await onDecision(selected, comment);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gate-panel">
      <div className="gate-panel__header">
        <h2>🔍 Human Quality Gate</h2>
        <p className="gate-panel__sub">Task <code>{taskId.slice(0, 8)}…</code> — Review artifact và đưa ra quyết định</p>
      </div>

      <div className="gate-decisions">
        {DECISIONS.map((d) => (
          <motion.button
            key={d.value}
            className={`gate-btn ${d.cls} ${selected === d.value ? 'gate-btn--selected' : ''}`}
            onClick={() => setSelected(d.value)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="gate-btn__icon">{d.icon}</span>
            <div>
              <div className="gate-btn__label">{d.label}</div>
              <div className="gate-btn__desc">{d.desc}</div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="gate-comment">
        <label>Comment {selected === 'REQUEST_CHANGES' && <span className="gate-required">(required)</span>}</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Nhận xét, yêu cầu chỉnh sửa hoặc lý do reject…"
          className="gate-textarea"
        />
      </div>

      <div className="gate-actions">
        <button onClick={onClose} className="gate-cancel">Cancel</button>
        <motion.button
          onClick={handleSubmit}
          disabled={!selected || loading || (selected === 'REQUEST_CHANGES' && !comment.trim())}
          className="gate-submit"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          {loading ? '⏳ Submitting…' : `Submit: ${selected || '—'}`}
        </motion.button>
      </div>
    </div>
  );
}
