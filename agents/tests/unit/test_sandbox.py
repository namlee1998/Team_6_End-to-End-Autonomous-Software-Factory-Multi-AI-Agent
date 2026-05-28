from __future__ import annotations

import subprocess

from src.tools.sandbox import run_sandbox_test


def test_sandbox_rejects_non_unified_patch(monkeypatch):
    monkeypatch.delenv("AGENT_REAL_SANDBOX", raising=False)

    result = run_sandbox_test("", "<<<<\nold\n====\nnew\n>>>>")

    assert result["success"] is False
    assert "unified git diff" in result["report"]


def test_real_sandbox_applies_patch_in_isolated_worktree(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "hello.txt").write_text("old\n", encoding="utf-8")

    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@example.local"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo, check=True)
    subprocess.run(["git", "add", "hello.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True)

    (repo / "hello.txt").write_text("new\n", encoding="utf-8")
    patch_result = subprocess.run(["git", "diff"], cwd=repo, check=True, text=True, capture_output=True)
    patch = patch_result.stdout
    (repo / "hello.txt").write_text("old\n", encoding="utf-8")

    monkeypatch.setenv("AGENT_REAL_SANDBOX", "true")
    monkeypatch.setenv("AGENT_WORKSPACE_REPO", str(repo))
    monkeypatch.setenv("AGENT_COMMIT_PATCH", "false")
    monkeypatch.setenv("AGENT_KEEP_WORKTREE", "false")
    monkeypatch.setenv(
        "AGENT_TEST_COMMANDS",
        "python -c \"from pathlib import Path; assert Path('hello.txt').read_text().strip() == 'new'\"",
    )

    result = run_sandbox_test("plan", patch, session_id="task-123")

    assert result["success"] is True
    assert result["applied"] is True
    assert result["tests_passed"] is True
    assert (repo / "hello.txt").read_text(encoding="utf-8") == "old\n"
