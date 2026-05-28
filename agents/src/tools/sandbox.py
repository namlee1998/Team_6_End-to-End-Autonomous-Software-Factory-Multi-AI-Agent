"""Patch sandbox for DEV agent outputs.

When AGENT_REAL_SANDBOX=true, the generated patch is applied to an isolated git
worktree and configured tests are executed there. The main checkout is not
mutated. Without that opt-in, this module performs deterministic patch-format
validation so local/demo runs do not randomly fail.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _run(command: str | list[str], cwd: Path, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        cwd=str(cwd),
        shell=isinstance(command, str),
        text=True,
        capture_output=True,
        timeout=timeout,
    )


def _repo_root() -> Path:
    configured = os.getenv("AGENT_WORKSPACE_REPO")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3]


def _extract_patch(raw_patch: str) -> str:
    text = (raw_patch or "").strip()
    fence = re.search(r"```(?:diff|patch)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    marker = text.find("diff --git ")
    if marker >= 0:
        text = text[marker:].strip()
    if text and not text.endswith("\n"):
        text += "\n"
    return text


def _is_unified_patch(patch: str) -> bool:
    return "diff --git " in patch and "--- " in patch and "+++ " in patch and "@@" in patch


def _safe_name(value: str | None) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", value or "dev-task").strip("-")
    return safe[:80] or "dev-task"


def _test_commands() -> list[str]:
    raw = os.getenv("AGENT_TEST_COMMANDS", "").strip()
    if not raw:
        return []
    return [line.strip() for line in raw.splitlines() if line.strip()]


def _create_worktree(repo: Path, session_id: str | None) -> tuple[str, Path]:
    branch = f"agent/{_safe_name(session_id)}"
    worktree_root = Path(os.getenv("AGENT_WORKTREE_ROOT", repo / ".agent-worktrees")).resolve()
    worktree = worktree_root / _safe_name(session_id)
    if worktree.exists():
        shutil.rmtree(worktree)
    worktree_root.mkdir(parents=True, exist_ok=True)

    result = _run(["git", "worktree", "add", "-B", branch, str(worktree), "HEAD"], repo)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "git worktree add failed")
    return branch, worktree


def _commit_patch(worktree: Path, session_id: str | None) -> str | None:
    _run(["git", "add", "-A"], worktree)
    diff = _run(["git", "diff", "--cached", "--quiet"], worktree)
    if diff.returncode == 0:
        return None

    _run(["git", "config", "user.email", "agent@example.local"], worktree)
    _run(["git", "config", "user.name", "SDLC Agent"], worktree)
    message = f"agent: apply DEV patch {_safe_name(session_id)}"
    commit = _run(["git", "commit", "-m", message], worktree, timeout=120)
    if commit.returncode != 0:
        raise RuntimeError(commit.stderr.strip() or commit.stdout.strip() or "git commit failed")
    sha = _run(["git", "rev-parse", "HEAD"], worktree)
    if sha.returncode != 0:
        return None
    return sha.stdout.strip()


def run_sandbox_test(
    implementation_plan: str,
    mock_code_diff: str,
    *,
    session_id: str | None = None,
) -> dict:
    """Validate/apply the DEV patch and run configured tests."""
    patch = _extract_patch(mock_code_diff)
    if not patch:
        return {
            "success": False,
            "report": "[Sandbox] No patch was provided.",
        }
    if not _is_unified_patch(patch):
        return {
            "success": False,
            "report": "[Sandbox] Patch must be a unified git diff that git apply can validate.",
        }

    if not _truthy(os.getenv("AGENT_REAL_SANDBOX")):
        return {
            "success": True,
            "report": "[Sandbox] Patch format validated. Real sandbox disabled; set AGENT_REAL_SANDBOX=true to apply and test in a git worktree.",
            "applied": False,
        }

    repo = _repo_root()
    root = _run(["git", "rev-parse", "--show-toplevel"], repo)
    if root.returncode != 0:
        return {
            "success": False,
            "report": f"[Sandbox] AGENT_WORKSPACE_REPO is not a git repository: {repo}",
        }
    repo = Path(root.stdout.strip()).resolve()

    try:
        branch, worktree = _create_worktree(repo, session_id)
        patch_file = worktree / ".agent_patch.diff"
        patch_file.write_text(patch, encoding="utf-8")

        check = _run(["git", "apply", "--check", "--whitespace=fix", str(patch_file)], worktree)
        if check.returncode != 0:
            return {
                "success": False,
                "report": "[Sandbox] git apply --check failed:\n" + (check.stderr or check.stdout),
                "patch_branch": branch,
                "worktree": str(worktree),
            }

        applied = _run(["git", "apply", "--whitespace=fix", str(patch_file)], worktree)
        if applied.returncode != 0:
            return {
                "success": False,
                "report": "[Sandbox] git apply failed:\n" + (applied.stderr or applied.stdout),
                "patch_branch": branch,
                "worktree": str(worktree),
            }
        patch_file.unlink(missing_ok=True)

        logs: list[str] = ["[Sandbox] Patch applied in isolated worktree."]
        for command in _test_commands():
            result = _run(command, worktree, timeout=int(os.getenv("AGENT_TEST_TIMEOUT_SECONDS", "300")))
            logs.append(f"$ {command}\n{result.stdout}{result.stderr}")
            if result.returncode != 0:
                return {
                    "success": False,
                    "report": "\n".join(logs),
                    "patch_branch": branch,
                    "worktree": str(worktree),
                    "tests_passed": False,
                }

        commit_sha = None
        if _truthy(os.getenv("AGENT_COMMIT_PATCH", "true")):
            commit_sha = _commit_patch(worktree, session_id)

        if not _truthy(os.getenv("AGENT_KEEP_WORKTREE", "true")):
            _run(["git", "worktree", "remove", "--force", str(worktree)], repo)

        return {
            "success": True,
            "report": "\n".join(logs) if logs else "[Sandbox] Patch applied.",
            "patch_branch": branch,
            "patch_commit": commit_sha,
            "worktree": str(worktree),
            "tests_passed": True,
            "applied": True,
        }
    except Exception as exc:
        return {
            "success": False,
            "report": f"[Sandbox] {exc}",
        }
