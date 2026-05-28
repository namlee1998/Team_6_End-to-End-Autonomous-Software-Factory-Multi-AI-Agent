-- ============================================
-- Migration: Create session_states table
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create session_states table
CREATE TABLE IF NOT EXISTS session_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL UNIQUE, -- UNIQUE constraint for upsert to work
  selected_doc_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  task_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb, -- { lastRunAt, flowCount, featureCount, docCount }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create index for faster lookups (optional since UNIQUE already creates index)
CREATE INDEX IF NOT EXISTS idx_session_states_page ON session_states(page);

-- 3. Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_session_states_updated_at ON session_states;
CREATE TRIGGER update_session_states_updated_at
  BEFORE UPDATE ON session_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. Verify the table was created
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'session_states'
ORDER BY ordinal_position;
