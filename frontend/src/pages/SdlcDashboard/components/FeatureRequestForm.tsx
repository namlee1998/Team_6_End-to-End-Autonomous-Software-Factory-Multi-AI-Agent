import { useState } from 'react';

import { FeatureRequest } from '@/services/api/sdlcApi';

interface Props {
  onSubmit: (fr: FeatureRequest) => void;
  onCancel: () => void;
}

export default function FeatureRequestForm({ onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'High'|'Medium'|'Low'>('High');
  const [targetUser, setTargetUser] = useState('End user');
  const [businessGoal, setBusinessGoal] = useState('');
  const [constraintInput, setConstraintInput] = useState('');
  const [constraints, setConstraints] = useState<string[]>([]);

  const addConstraint = () => {
    if (constraintInput.trim()) {
      setConstraints((c) => [...c, constraintInput.trim()]);
      setConstraintInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title, description, priority, target_user: targetUser, business_goal: businessGoal, constraints });
  };

  return (
    <form className="fr-form" onSubmit={handleSubmit}>
      <div className="fr-form-header">
        <h2>📋 New Feature Request</h2>
        <p>PO Agent sẽ tự động tạo PRD, User Stories và Acceptance Criteria.</p>
      </div>

      <div className="fr-field">
        <label>Feature Title *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Add Google Login"' required className="fr-input" />
      </div>

      <div className="fr-field">
        <label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          rows={3} placeholder="Mô tả chi tiết tính năng..." className="fr-input" />
      </div>

      <div className="fr-row">
        <div className="fr-field">
          <label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as 'High'|'Medium'|'Low')} className="fr-input">
            <option value="High">🔴 High</option>
            <option value="Medium">🟡 Medium</option>
            <option value="Low">🟢 Low</option>
          </select>
        </div>
        <div className="fr-field">
          <label>Target User</label>
          <input value={targetUser} onChange={(e) => setTargetUser(e.target.value)} className="fr-input" />
        </div>
      </div>

      <div className="fr-field">
        <label>Business Goal</label>
        <input value={businessGoal} onChange={(e) => setBusinessGoal(e.target.value)}
          placeholder="e.g. Reduce login friction by 30%" className="fr-input" />
      </div>

      <div className="fr-field">
        <label>Constraints</label>
        <div className="fr-constraint-row">
          <input value={constraintInput} onChange={(e) => setConstraintInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addConstraint())}
            placeholder="e.g. Must not break existing login" className="fr-input" />
          <button type="button" onClick={addConstraint} className="fr-btn-add">+</button>
        </div>
        {constraints.length > 0 && (
          <ul className="fr-constraint-list">
            {constraints.map((c, i) => (
              <li key={i}>
                {c}
                <button type="button" onClick={() => setConstraints(constraints.filter((_, idx) => idx !== i))}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="fr-actions">
        <button type="button" onClick={onCancel} className="fr-btn-cancel">Cancel</button>
        <button type="submit" className="fr-btn-submit" disabled={!title.trim()}>
          🚀 Submit Request
        </button>
      </div>
    </form>
  );
}
