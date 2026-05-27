from __future__ import annotations

import asyncio

from src.agents.agent_1 import (
    _parse_flows_from_markdown,
    _split_by_big_features,
    stream_agent_1,
)
from src.schemas import Agent1Input


class StreamingLLM:
    def __init__(self, chunks: list[str]):
        self._chunks = chunks

    async def astream(self, _messages):
        for chunk in self._chunks:
            yield type("Chunk", (), {"content": chunk})()


def test_split_by_big_features_preserves_feature_sections():
    raw_text = """
## BIG FEATURE 1: Authentication
Content A

## BIG FEATURE 2: Reports
Content B
""".strip()

    sections = _split_by_big_features(raw_text)

    assert sections == [
        ("Authentication", "## BIG FEATURE 1: Authentication\nContent A"),
        ("Reports", "## BIG FEATURE 2: Reports\nContent B"),
    ]


def test_split_by_big_features_merges_same_feature_name_across_documents():
    raw_text = """
## BIG FEATURE 1: Authentication
PRD content

---

## BIG FEATURE 1: Authentication
USER FLOW content
""".strip()

    sections = _split_by_big_features(raw_text)

    assert sections == [
        (
            "Authentication",
            "## BIG FEATURE 1: Authentication\nPRD content\n\n---\n\n## BIG FEATURE 1: Authentication\nUSER FLOW content",
        )
    ]


def test_parse_flows_from_markdown_keeps_source_and_steps():
    markdown = """
## Flow 1 Login
**Source**: Authentication > Login
1. Open app
2. Enter credentials

### FLOW_02 Export report
**Source**: Reports > Export
1. Open reports
2. Export as CSV
""".strip()

    flows = _parse_flows_from_markdown(markdown)

    assert [flow.name for flow in flows] == ["Login", "Export report"]
    assert flows[0].source == "Authentication > Login"
    assert flows[0].steps == ["Open app", "Enter credentials"]
    assert flows[1].steps == ["Open reports", "Export as CSV"]


def test_stream_agent_1_completed_payload_includes_markdown_alias(monkeypatch):
    markdown = """
## Flow 1 Login
**Source**: Authentication > Login
1. Open app
""".strip()

    monkeypatch.setattr(
        "src.agents.agent_1._get_llm",
        lambda _model=None: StreamingLLM([markdown]),
    )

    async def collect_completed():
        completed = None
        async for chunk in stream_agent_1(Agent1Input(raw_text="Login flow")):
            if chunk["event"] == "completed":
                completed = chunk["data"]
        return completed

    completed = asyncio.run(collect_completed())

    assert completed["markdown"] == markdown
    assert completed["raw_markdown"] == markdown
