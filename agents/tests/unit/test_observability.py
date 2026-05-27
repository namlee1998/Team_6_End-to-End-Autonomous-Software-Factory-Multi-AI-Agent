from __future__ import annotations

import sys
import types

from src.observability import create_trace_context


def test_trace_context_disabled_returns_noop_metadata(monkeypatch):
    monkeypatch.setenv("LANGFUSE_ENABLED", "false")
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)

    context = create_trace_context(
        session_id="task-1",
        node_target="agent_1_extraction",
    )
    payload = context.complete()

    assert context.enabled is False
    assert payload["provider"] is None
    assert payload["trace_id"] is None
    assert payload["trace_url"] is None
    assert payload["session_id"] == "task-1"
    assert isinstance(payload["latency_ms"], int)


def test_trace_context_uses_deterministic_langfuse_trace_url(monkeypatch):
    created_handlers = []

    class FakeLangfuse:
        @staticmethod
        def create_trace_id(seed=None):
            return f"trace-for-{seed}"

        def get_trace_url(self, *, trace_id=None):
            return f"https://langfuse.test/traces/{trace_id}"

    class FakeCallbackHandler:
        def __init__(self, *, trace_context=None, public_key=None):
            self.trace_context = trace_context
            self.public_key = public_key
            created_handlers.append(self)

    fake_langfuse_module = types.ModuleType("langfuse")
    fake_langfuse_module.Langfuse = FakeLangfuse
    fake_langchain_module = types.ModuleType("langfuse.langchain")
    fake_langchain_module.CallbackHandler = FakeCallbackHandler

    monkeypatch.setitem(sys.modules, "langfuse", fake_langfuse_module)
    monkeypatch.setitem(sys.modules, "langfuse.langchain", fake_langchain_module)
    monkeypatch.setenv("LANGFUSE_ENABLED", "true")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")

    context = create_trace_context(
        session_id="task-123",
        node_target="agent_2_scenarios",
    )
    payload = context.complete()

    assert context.enabled is True
    assert context.trace_id == "trace-for-task-123"
    assert created_handlers[0].trace_context == {"trace_id": "trace-for-task-123"}
    assert payload["provider"] == "langfuse"
    assert payload["trace_id"] == "trace-for-task-123"
    assert payload["trace_url"] == "https://langfuse.test/traces/trace-for-task-123"
