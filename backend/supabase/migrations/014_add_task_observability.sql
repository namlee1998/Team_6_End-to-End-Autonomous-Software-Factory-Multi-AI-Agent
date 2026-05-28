ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS observability JSONB DEFAULT '{}'::jsonb;
