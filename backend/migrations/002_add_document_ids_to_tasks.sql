-- ============================================
-- Migration: Add document_ids to tasks table
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add document_ids column (JSONB array)
ALTER TABLE tasks 
ADD COLUMN document_ids JSONB DEFAULT NULL;

-- 2. Update existing records: copy document_id into document_ids array
UPDATE tasks 
SET document_ids = jsonb_build_array(document_id) 
WHERE document_ids IS NULL;

-- 3. Make sure document_id still exists for backward compatibility
-- (It should already exist)

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tasks' AND column_name = 'document_ids';
