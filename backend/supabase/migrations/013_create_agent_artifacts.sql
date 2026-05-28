-- Migration 013: Unified item-level artifacts for the agent pipeline.
-- `agent_artifacts` becomes the source of truth for detailed Agent 1/2/3 outputs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('agent1', 'agent2', 'agent3')),
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('flow', 'raw_markdown', 'scenario', 'yaml')),
  artifact_key TEXT NOT NULL,
  title TEXT,
  content_json JSONB,
  content_text TEXT,
  ordinal INTEGER NOT NULL DEFAULT 0,
  source_artifact_id UUID REFERENCES agent_artifacts(id) ON DELETE SET NULL,
  content_hash VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_artifacts_task_type_key
  ON agent_artifacts(task_id, artifact_type, artifact_key);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_task_ordinal
  ON agent_artifacts(task_id, ordinal);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_project_agent_type
  ON agent_artifacts(project_id, agent_type, artifact_type);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_source
  ON agent_artifacts(source_artifact_id);

-- Backfill Agent 1 flow artifacts from historical task result JSON.
INSERT INTO agent_artifacts (
  task_id,
  project_id,
  agent_type,
  artifact_type,
  artifact_key,
  title,
  content_json,
  ordinal,
  content_hash
)
SELECT
  t.id,
  t.project_id,
  'agent1',
  'flow',
  CONCAT('flow:', flow_item.ordinality - 1, ':', COALESCE(flow_item.flow ->> 'flowName', flow_item.flow ->> 'name', 'Unknown')),
  COALESCE(flow_item.flow ->> 'flowName', flow_item.flow ->> 'name', 'Unknown'),
  flow_item.flow,
  flow_item.ordinality - 1,
  encode(digest(flow_item.flow::text, 'sha256'), 'hex')
FROM tasks t
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.result -> 'flows', '[]'::jsonb)) WITH ORDINALITY AS flow_item(flow, ordinality)
WHERE t.type = 'extract-flows'
  AND t.project_id IS NOT NULL
ON CONFLICT (task_id, artifact_type, artifact_key) DO NOTHING;

-- Backfill Agent 1 raw markdown artifacts.
INSERT INTO agent_artifacts (
  task_id,
  project_id,
  agent_type,
  artifact_type,
  artifact_key,
  title,
  content_text,
  ordinal,
  content_hash
)
SELECT
  t.id,
  t.project_id,
  'agent1',
  'raw_markdown',
  'raw_markdown',
  'Raw Markdown',
  t.result ->> 'rawMarkdown',
  999999,
  encode(digest(COALESCE(t.result ->> 'rawMarkdown', ''), 'sha256'), 'hex')
FROM tasks t
WHERE t.type = 'extract-flows'
  AND t.project_id IS NOT NULL
  AND COALESCE(t.result ->> 'rawMarkdown', '') <> ''
ON CONFLICT (task_id, artifact_type, artifact_key) DO NOTHING;

-- Backfill Agent 2 scenario artifacts from historical testcases.
INSERT INTO agent_artifacts (
  task_id,
  project_id,
  agent_type,
  artifact_type,
  artifact_key,
  title,
  content_json,
  ordinal,
  content_hash
)
SELECT
  tc.task_id,
  COALESCE(tc.project_id, t.project_id),
  'agent2',
  'scenario',
  CONCAT('scenario:', ROW_NUMBER() OVER (PARTITION BY tc.task_id ORDER BY tc.created_at, tc.id) - 1, ':', COALESCE(tc.scenario_data ->> 'id', tc.id::text)),
  COALESCE(tc.scenario_data ->> 'name', tc.flow_name, 'Scenario'),
  tc.scenario_data,
  ROW_NUMBER() OVER (PARTITION BY tc.task_id ORDER BY tc.created_at, tc.id) - 1,
  encode(digest(tc.scenario_data::text, 'sha256'), 'hex')
FROM testcases tc
JOIN tasks t ON t.id = tc.task_id
WHERE t.type = 'generate-testcases'
  AND tc.scenario_data IS NOT NULL
  AND COALESCE(tc.project_id, t.project_id) IS NOT NULL
ON CONFLICT (task_id, artifact_type, artifact_key) DO NOTHING;

-- Backfill Agent 3 YAML artifacts from historical testcases.
INSERT INTO agent_artifacts (
  task_id,
  project_id,
  agent_type,
  artifact_type,
  artifact_key,
  title,
  content_json,
  content_text,
  ordinal,
  content_hash
)
SELECT
  tc.task_id,
  COALESCE(tc.project_id, t.project_id),
  'agent3',
  'yaml',
  CONCAT('yaml:', ROW_NUMBER() OVER (PARTITION BY tc.task_id ORDER BY tc.created_at, tc.id) - 1, ':', regexp_replace(COALESCE(tc.yaml_filename, tc.feature_name || '.yaml'), '\.yaml$', '', 'i')),
  COALESCE(tc.yaml_filename, tc.feature_name || '.yaml'),
  jsonb_build_object(
    'filename', COALESCE(tc.yaml_filename, tc.feature_name || '.yaml'),
    'framework', COALESCE(t.result ->> 'framework', 'Mobile Auto Platform')
  ),
  tc.automation_yaml,
  ROW_NUMBER() OVER (PARTITION BY tc.task_id ORDER BY tc.created_at, tc.id) - 1,
  encode(digest(COALESCE(tc.automation_yaml, ''), 'sha256'), 'hex')
FROM testcases tc
JOIN tasks t ON t.id = tc.task_id
WHERE t.type = 'generate-automation'
  AND tc.automation_yaml IS NOT NULL
  AND COALESCE(tc.project_id, t.project_id) IS NOT NULL
ON CONFLICT (task_id, artifact_type, artifact_key) DO NOTHING;
