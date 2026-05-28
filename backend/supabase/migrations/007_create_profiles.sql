-- Store editable profile information for authenticated users.

BEGIN;

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY,
  full_name TEXT,
  age INTEGER,
  job_title TEXT,
  address TEXT,
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  avatar_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_age_range CHECK (age IS NULL OR (age >= 0 AND age <= 150))
);

CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
