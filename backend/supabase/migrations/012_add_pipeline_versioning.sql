-- Migration 012: Add pipeline artifact versioning columns to tasks table
-- Implements content-addressed pipeline (Git-inspired) for HITL/auto-propagation conflict resolution.
--
-- input_content_hash:  SHA256 of the input payload when this run was created.
--                      Used to detect staleness: if upstream's output_content_hash changed, this run is stale.
-- output_content_hash: SHA256 of the structured result when this run completed.
--                      Downstream runs compare their input_content_hash to this value.
-- source_run_id:       The task ID this run was based on (Agent 2 → Agent 1 task ID, etc.)
-- version_status:      'draft'     — run completed but not yet accepted by user (blocks downstream)
--                      'committed' — user accepted this run; downstream agents may proceed

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS input_content_hash  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS output_content_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS source_run_id       UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_status      VARCHAR(20)
    NOT NULL DEFAULT 'committed'
    CHECK (version_status IN ('draft', 'committed'));

-- Index for fast "find latest committed task for project+type" queries
CREATE INDEX IF NOT EXISTS idx_tasks_project_type_vstatus
  ON tasks (project_id, type, version_status, created_at DESC);
