-- Credits & quota system: plans, subscriptions, usage logs, admin users, audit logs, dashboard snapshots.

BEGIN;

-- ─────────────────────────────────────────────
-- 1. Plans
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id            TEXT PRIMARY KEY,               -- 'free' | 'pro'
  name          TEXT NOT NULL,
  credits_limit INTEGER NOT NULL,               -- credits per billing cycle
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (id, name, credits_limit, description) VALUES
  ('free', 'Free',  50,   '50 credits/month — up to 50,000 tokens'),
  ('pro',  'Pro',  1000,  '1,000 credits/month — up to 1,000,000 tokens')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. User subscriptions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE,          -- Supabase auth user
  plan_id        TEXT NOT NULL REFERENCES plans(id),
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'quota_exceeded', 'expired', 'suspended')),
  credits_used   INTEGER NOT NULL DEFAULT 0,
  credits_total  INTEGER NOT NULL,              -- copied from plan at assignment time
  period_start   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_end     TIMESTAMPTZ,                   -- NULL means manual / no expiry
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status  ON user_subscriptions(status);

-- ─────────────────────────────────────────────
-- 3. Usage logs  (90-day retention enforced by app-level cleanup)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id         UUID,                         -- no FK: tasks can be deleted
  agent_type      TEXT NOT NULL
                    CHECK (agent_type IN ('agent_1', 'agent_2', 'agent_3')),
  status          TEXT NOT NULL
                    CHECK (status IN ('completed', 'failed')),
  token_input     INTEGER NOT NULL DEFAULT 0,
  token_output    INTEGER NOT NULL DEFAULT 0,
  token_total     INTEGER NOT NULL DEFAULT 0,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_executed  ON usage_logs(user_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_project        ON usage_logs(project_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_executed_at    ON usage_logs(executed_at DESC);

-- ─────────────────────────────────────────────
-- 4. Admin users  (separate from Supabase auth)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 5. Audit logs
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES admin_users(id),
  action       TEXT NOT NULL,                   -- 'change_plan' | 'suspend_user' | 'unsuspend_user' | 'create_admin'
  target_type  TEXT NOT NULL,                   -- 'user' | 'admin'
  target_id    UUID NOT NULL,
  payload      JSONB,                           -- action-specific details (old_plan, new_plan, reason…)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id   ON audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target     ON audit_logs(target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ─────────────────────────────────────────────
-- 6. Dashboard snapshots  (written by hourly batch job)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_window  TEXT NOT NULL CHECK (time_window IN ('1d', '7d', '30d')),
  data         JSONB NOT NULL,
  UNIQUE (snapshot_at, time_window)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_at ON dashboard_snapshots(snapshot_at DESC);

-- ─────────────────────────────────────────────
-- 7. Atomic increment function (avoids race conditions on concurrent agent runs)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_credits_used(p_user_id UUID, p_credits INTEGER)
RETURNS user_subscriptions
LANGUAGE plpgsql
AS $$
DECLARE
  updated_row user_subscriptions;
BEGIN
  UPDATE user_subscriptions
     SET credits_used = credits_used + p_credits,
         updated_at   = NOW()
   WHERE user_id = p_user_id
  RETURNING * INTO updated_row;
  RETURN updated_row;
END;
$$;

COMMIT;
