-- Migration 014: extend legacy 3-agent constraints for the 5-stage SDLC pipeline.

BEGIN;

ALTER TABLE agent_artifacts
  DROP CONSTRAINT IF EXISTS agent_artifacts_agent_type_check;

ALTER TABLE agent_artifacts
  ADD CONSTRAINT agent_artifacts_agent_type_check
  CHECK (agent_type IN (
    'agent1', 'agent2', 'agent3',
    'intent-agent', 'po-agent', 'ux-agent', 'dev-agent', 'qa-agent'
  ));

ALTER TABLE agent_artifacts
  DROP CONSTRAINT IF EXISTS agent_artifacts_artifact_type_check;

ALTER TABLE agent_artifacts
  ADD CONSTRAINT agent_artifacts_artifact_type_check
  CHECK (artifact_type IN (
    'flow', 'raw_markdown', 'scenario', 'yaml',
    'feature_request',
    'intent_assumptions', 'clarifying_questions',
    'prd', 'user_stories', 'acceptance_criteria', 'scope', 'out_of_scope',
    'ux_spec', 'user_flow', 'wireframe_spec', 'component_inventory', 'screens',
    'architecture_ledger_update', 'implementation_plan', 'mock_code_diff', 'changed_files',
    'risk_assessment', 'risk_level', 'sandbox_report', 'patch_branch', 'patch_commit',
    'test_cases', 'qa_report', 'ac_coverage_matrix', 'pass_count', 'fail_count',
    'blocker_count', 'release_recommendation'
  ));

ALTER TABLE usage_logs
  DROP CONSTRAINT IF EXISTS usage_logs_agent_type_check;

ALTER TABLE usage_logs
  ADD CONSTRAINT usage_logs_agent_type_check
  CHECK (agent_type IN (
    'agent_1', 'agent_2', 'agent_3',
    'intent-agent', 'po-agent', 'ux-agent', 'dev-agent', 'qa-agent'
  ));

COMMIT;
