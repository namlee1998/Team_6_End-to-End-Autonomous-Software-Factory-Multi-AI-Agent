"""Observability helpers for agent runtime tracing.

Langfuse is optional. When disabled or missing credentials, every helper returns
no-op values so agent execution keeps the same behavior.
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _enabled() -> bool:
    return os.getenv("LANGFUSE_ENABLED", "false").lower() == "true"


def _has_credentials() -> bool:
    return bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))


def _base_url() -> str:
    return (
        os.getenv("LANGFUSE_HOST")
        or os.getenv("LANGFUSE_BASE_URL")
        or "https://cloud.langfuse.com"
    ).rstrip("/")


def _normalize_langfuse_host_env() -> None:
    """Keep both old and current Langfuse host env names compatible."""
    host = os.getenv("LANGFUSE_HOST")
    base_url = os.getenv("LANGFUSE_BASE_URL")
    if not host and base_url:
        os.environ["LANGFUSE_HOST"] = base_url
    elif host and not base_url:
        os.environ["LANGFUSE_BASE_URL"] = host


def _model_name() -> str:
    return os.getenv("DEFAULT_MODEL", "kr/claude-sonnet-4.5")


@dataclass
class TraceContext:
    session_id: str
    node_target: str
    user_id: str | None = None
    project_id: str | None = None
    source_run_id: str | None = None
    trace_name: str = ""
    started_at: str = field(default_factory=_now_iso)
    enabled: bool = False
    handler: Any = None
    langfuse_client: Any = None
    trace_id: str | None = None

    def langchain_config(self, observation_name: str) -> dict[str, Any]:
        tags = ["agent-pipeline", self.node_target]
        metadata = {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "project_id": self.project_id,
            "source_run_id": self.source_run_id,
            "node_target": self.node_target,
            "trace_name": self.trace_name,
            "trace_id": self.trace_id,
            "langfuse_session_id": self.session_id,
            "langfuse_tags": tags,
        }
        if self.user_id:
            metadata["langfuse_user_id"] = self.user_id
        metadata = {key: value for key, value in metadata.items() if value}

        config: dict[str, Any] = {
            "run_name": observation_name,
            "metadata": metadata,
            "tags": tags,
        }
        if self.handler is not None:
            config["callbacks"] = [self.handler]
        return config

    def trace_url(self) -> str | None:
        if not self.enabled or self.langfuse_client is None or not self.trace_id:
            return None
        try:
            trace_url = self.langfuse_client.get_trace_url(trace_id=self.trace_id)
            if trace_url:
                return trace_url
        except Exception as exc:
            logger.warning("Unable to resolve Langfuse trace URL: %s", exc)
        return None

    def complete(self) -> dict[str, Any]:
        completed_at = _now_iso()
        latency_ms = int(
            (
                datetime.fromisoformat(completed_at)
                - datetime.fromisoformat(self.started_at)
            ).total_seconds()
            * 1000
        )
        return {
            "provider": "langfuse" if self.enabled else None,
            "session_id": self.session_id,
            "trace_id": self.trace_id,
            "trace_url": self.trace_url(),
            "model": _model_name(),
            "started_at": self.started_at,
            "completed_at": completed_at,
            "latency_ms": latency_ms,
        }

    def fail(self, error: str) -> dict[str, Any]:
        data = self.complete()
        data["failed_at"] = data.pop("completed_at")
        data["error"] = error
        return data


def create_trace_context(
    *,
    session_id: str,
    node_target: str,
    user_id: str | None = None,
    project_id: str | None = None,
    source_run_id: str | None = None,
) -> TraceContext:
    _normalize_langfuse_host_env()
    enabled = _enabled() and _has_credentials()
    handler = None
    langfuse_client = None
    trace_id = None

    if enabled:
        try:
            from langfuse import Langfuse
            from langfuse.langchain import CallbackHandler

            langfuse_client = Langfuse()
            trace_id = Langfuse.create_trace_id(seed=session_id)
            handler = CallbackHandler(
                trace_context={"trace_id": trace_id},
            )
        except Exception as exc:
            logger.warning("Langfuse tracing disabled: %s", exc)
            enabled = False
            handler = None
            langfuse_client = None
            trace_id = None

    trace_name = f"{node_target}.{session_id}"
    return TraceContext(
        session_id=session_id,
        node_target=node_target,
        user_id=user_id,
        project_id=project_id,
        source_run_id=source_run_id,
        trace_name=trace_name,
        enabled=enabled,
        handler=handler,
        langfuse_client=langfuse_client,
        trace_id=trace_id,
    )


def flush_observability() -> None:
    if not (_enabled() and _has_credentials()):
        return
    try:
        from langfuse import get_client

        get_client().flush()
    except Exception:
        return
