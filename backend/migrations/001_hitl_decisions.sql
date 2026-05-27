-- Migration: Create hitl_decisions table for AIDLC Quality Gates
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.hitl_decisions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id TEXT        NOT NULL,           -- projectId used as workflow scope
  task_id         UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id      UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  gate            TEXT        NOT NULL,            -- REQUIREMENT_GATE | UX_GATE | DEV_GATE | QA_GATE | FINAL_GATE
  decision        TEXT        NOT NULL CHECK (decision IN ('APPROVE', 'REJECT', 'REQUEST_CHANGES')),
  comment         TEXT,
  reviewer_id     UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_hitl_decisions_project_id ON public.hitl_decisions (project_id);
CREATE INDEX IF NOT EXISTS idx_hitl_decisions_task_id    ON public.hitl_decisions (task_id);

-- Enable RLS
ALTER TABLE public.hitl_decisions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to select/insert their own project's decisions
CREATE POLICY "hitl_decisions_select" ON public.hitl_decisions
  FOR SELECT USING (
    project_id IN (
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "hitl_decisions_insert" ON public.hitl_decisions
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT project_id FROM public.project_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

-- Add SDLC task types to tasks.type constraint (if exists)
-- If your tasks table has a CHECK constraint on type, uncomment and adapt:
-- ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
-- ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check
--   CHECK (type IN ('extract-flows','generate-testcases','generate-automation',
--                   'po-agent','ux-agent','dev-agent','qa-agent'));
