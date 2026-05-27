-- Add avatar storage path for profile avatars.
-- 007 may already have been applied before avatar_path existed, and
-- CREATE TABLE IF NOT EXISTS does not add newly introduced columns.

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_path TEXT;

NOTIFY pgrst, 'reload schema';

COMMIT;
