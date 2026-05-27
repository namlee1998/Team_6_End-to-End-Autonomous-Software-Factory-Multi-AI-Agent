from __future__ import annotations

import asyncio

from src.agents.agent_1 import run_agent_1
from src.agents.agent_2 import run_agent_2
from src.agents.agent_3 import run_agent_3
from src.schemas import Agent1Input, Agent2Input, Agent3Input, UXFlow
from tests.support.pipeline_helpers import (
    EXPECTED_DIR,
    build_agent2_responses,
    build_agent3_responses,
    load_expected_json,
    load_fixture_documents,
    read_text_if_exists,
    SequentialLLM,
)


def test_agent_1_regression_matches_fixture(monkeypatch):
    docs = load_fixture_documents("expense_tracker_happy")
    expected = load_expected_json("agent1", "happy.json")
    raw_markdown = read_text_if_exists(EXPECTED_DIR / "agent1" / "happy_raw.md")

    monkeypatch.setattr(
        "src.agents.agent_1._get_llm",
        lambda _model=None: SequentialLLM([raw_markdown]),
    )

    result = asyncio.run(
        run_agent_1(Agent1Input(raw_text=f"{docs['PRD']}\n\n---\n\n{docs['USER_FLOW']}"))
    )

    assert result.model_dump() == expected


def test_agent_2_regression_matches_fixture(monkeypatch):
    expected_agent1 = load_expected_json("agent1", "happy.json")
    expected_agent2 = load_expected_json("agent2", "happy.json")

    monkeypatch.setattr(
        "src.agents.agent_2._get_llm",
        lambda _model=None: SequentialLLM(build_agent2_responses(expected_agent2)),
    )

    result = asyncio.run(
        run_agent_2(
            Agent2Input(
                feature_name="Transaction Management",
                flows=[UXFlow(**flow) for flow in expected_agent1["flows"]],
            )
        )
    )

    assert result.model_dump()["scenarios"] == expected_agent2["scenarios"]
    assert result.markdown == expected_agent2["markdown"]


def test_agent_3_regression_matches_fixture(monkeypatch):
    docs = load_fixture_documents("expense_tracker_happy")
    expected_agent2 = load_expected_json("agent2", "happy.json")
    expected_agent3 = load_expected_json("agent3", "happy.json")
    agent3_responses = build_agent3_responses(expected_agent3)

    monkeypatch.setattr(
        "src.agents.agent_3._get_llm",
        lambda _model=None: SequentialLLM(
            [agent3_responses[scenario["id"]] for scenario in expected_agent2["scenarios"]]
        ),
    )

    result = asyncio.run(
        run_agent_3(
            Agent3Input(
                feature_name="Transaction Management",
                scenarios=expected_agent2["scenarios"],
                ui_description=docs["UI_DESCRIPTION"],
                framework="appium",
            )
        )
    )

    assert result.model_dump() == expected_agent3
