-- Migration 006: Add ON DELETE CASCADE to testcases.task_id
-- Ensures testcases are automatically removed when their parent task is deleted,
-- eliminating the need for a separate application-level deletion step.

-- Drop existing FK if present (name may vary; use IF EXISTS to be safe)
ALTER TABLE testcases
  DROP CONSTRAINT IF EXISTS testcases_task_id_fkey;

-- Re-add with CASCADE
ALTER TABLE testcases
  ADD CONSTRAINT testcases_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
