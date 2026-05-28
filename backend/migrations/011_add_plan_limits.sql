-- Add per-plan limits: max projects owned, max members per project, task history window.

BEGIN;

-- NULL value means unlimited for all three columns
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_projects            INTEGER,
  ADD COLUMN IF NOT EXISTS max_members_per_project INTEGER,
  ADD COLUMN IF NOT EXISTS task_history_days       INTEGER;

UPDATE plans SET
  max_projects            = 3,
  max_members_per_project = 3,
  task_history_days       = 30
WHERE id = 'free';

UPDATE plans SET
  max_projects            = NULL,
  max_members_per_project = 20,
  task_history_days       = NULL
WHERE id = 'pro';

COMMIT;
