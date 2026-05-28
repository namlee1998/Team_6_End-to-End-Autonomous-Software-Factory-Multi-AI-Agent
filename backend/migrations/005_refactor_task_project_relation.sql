-- ============================================================
-- Migration 005: Refactor task/testcase → project relationship
--
-- Changes:
--   tasks     : add project_id FK, drop document_id + document_ids
--   testcases : add project_id FK
-- ============================================================

BEGIN;

-- 1. tasks: add project_id, back-fill from document → project
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS project_id UUID;

UPDATE tasks t
SET project_id = d.project_id
FROM documents d
WHERE d.id = t.document_id
  AND t.project_id IS NULL;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

-- 2. tasks: drop old document columns
ALTER TABLE tasks
  DROP COLUMN IF EXISTS document_id,
  DROP COLUMN IF EXISTS document_ids;

-- 3. testcases: add project_id, back-fill from task → project
ALTER TABLE testcases
  ADD COLUMN IF NOT EXISTS project_id UUID;

UPDATE testcases tc
SET project_id = t.project_id
FROM tasks t
WHERE t.id = tc.task_id
  AND tc.project_id IS NULL;

ALTER TABLE testcases
  ADD CONSTRAINT testcases_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_testcases_project_id ON testcases(project_id);
CREATE INDEX IF NOT EXISTS idx_testcases_task_id    ON testcases(task_id);

COMMIT;
