"""
Agent 3 — Automation Code Generation
Converts QA Manual Test Scenarios into automation YAML code.
"""

from __future__ import annotations

import json
import re
import os
import logging
from typing import Any, AsyncGenerator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from src.prompts import AGENT_3_AUTOMATION
from src.schemas import Agent3Input, Agent3Output, AutomationFile

logger = logging.getLogger(__name__)



def _extract_text(content: Any) -> str:
    """Extract plain text from LLM response content (handles string or content-block list)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "thinking":
                    continue  # skip extended-thinking blocks
                parts.append(block.get("text", ""))
            else:
                parts.append(str(block))
        return "".join(parts)
    return str(content)


def _parse_json(text: str) -> dict:
    """Parse JSON from LLM text, stripping markdown fences and preamble if present."""
    text = text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence_match:
        text = fence_match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    obj_match = re.search(r'\{[\s\S]*\}', text)
    if obj_match:
        return json.loads(obj_match.group(0))
    raise ValueError(f"No JSON object found in LLM response. Preview: {text[:200]}")


def _get_llm(model_config: dict | None = None) -> ChatOpenAI:
    """Create the LLM instance."""
    model_name = (model_config or {}).get("model") or os.getenv("DEFAULT_MODEL", "kr/claude-sonnet-4.5")
    api_base = os.getenv("OPENAI_API_BASE")
    return ChatOpenAI(
        model=model_name,
        temperature=0.1,  # Lower temperature for code generation
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=api_base if api_base else None,
    )


async def run_agent_3(
    input_data: Agent3Input,
    model_config: dict | None = None,
    trace_context: Any | None = None,
) -> Agent3Output:
    """
    Run Agent 3: Generate Automation YAMLs from QA Scenarios.
    Processes scenarios one by one to ensure accuracy and prevent overflow.
    """
    llm = _get_llm(model)
    all_yaml_files = []

    # Process structured scenarios
    if input_data.scenarios:
        logger.info(f"Agent 3: Processing {len(input_data.scenarios)} scenarios sequentially.")
        for i, scenario in enumerate(input_data.scenarios):
            logger.info(f"Agent 3: Converting scenario {i+1}/{len(input_data.scenarios)}: {scenario.name}")

            messages = [
                SystemMessage(content=AGENT_3_AUTOMATION),
                HumanMessage(content=(
                    f"Feature: {input_data.feature_name}\n"
                    f"Framework: {input_data.framework}\n"
                    f"UI Description Context: {input_data.ui_description}\n"
                    f"Scenario to convert: {json.dumps(scenario.model_dump(), indent=2)}"
                ))
            ]

            try:
                config = trace_context.langchain_config(f"agent3.scenario.{scenario.id}") if trace_context else None
                response = await llm.ainvoke(messages, config=config)
                text = _extract_text(response.content)
                chunk_data = _parse_json(text)
                for f in chunk_data.get("yaml_files", []):
                    all_yaml_files.append(AutomationFile(**f))
            except Exception as e:
                logger.error(f"Error converting scenario {scenario.id}: {e}")
                continue
    else:
        logger.warning("Agent 3: No structured scenarios provided. Falling back to single-turn processing.")
        messages = [
            SystemMessage(content=AGENT_3_AUTOMATION),
            HumanMessage(content=(
                f"Feature: {input_data.feature_name}\n"
                f"UI Context: {input_data.ui_description}\n"
                f"Test Scenarios Text: {input_data.test_scenarios_text}"
            ))
        ]
        config = trace_context.langchain_config("agent3.scenario.raw") if trace_context else None
        response = await llm.ainvoke(messages, config=config)
        text = _extract_text(response.content)
        chunk_data = _parse_json(text)
        for f in chunk_data.get("yaml_files", []):
            all_yaml_files.append(AutomationFile(**f))

    return Agent3Output(
        yaml_files=all_yaml_files,
        summary=f"Successfully generated {len(all_yaml_files)} automation scripts for {input_data.feature_name}."
    )


async def stream_agent_3(
    input_data: Agent3Input,
    model_config: dict | None = None,
    trace_context: Any | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Stream Agent 3 progress scenario-by-scenario.
    """
    llm = _get_llm(model)

    if not input_data.scenarios:
        messages = [
            SystemMessage(content=AGENT_3_AUTOMATION),
            HumanMessage(content=f"Scenarios: {input_data.test_scenarios_text}")
        ]
        config = trace_context.langchain_config("agent3.scenario.raw") if trace_context else None
        async for chunk in llm.astream(messages, config=config):
            yield {"event": "progress", "data": {"token": _extract_text(chunk.content)}}
        return

    total = len(input_data.scenarios)
    all_yaml_files = []
    total_input_tokens = 0
    total_output_tokens = 0
    feedback_prefix = (
        f"<user_feedback>\n{input_data.feedback_prompt}\n</user_feedback>\n\n"
        if input_data.feedback_prompt else ""
    )

    for i, scenario in enumerate(input_data.scenarios):
        yield {
            "event": "progress",
            "data": {
                "status": f"Converting scenario {i+1}/{total}: {scenario.name}",
                "percentage": int((i / total) * 100),
            }
        }

        messages = [
            SystemMessage(content=AGENT_3_AUTOMATION),
            HumanMessage(content=(
                f"{feedback_prefix}Feature: {input_data.feature_name}\n"
                f"Framework: {input_data.framework}\n"
                f"UI Description: {input_data.ui_description}\n"
                f"Scenario: {json.dumps(scenario.model_dump())}"
            ))
        ]

        response = None
        try:
            config = trace_context.langchain_config(f"agent3.scenario.{scenario.id}") if trace_context else None
            response = await llm.ainvoke(messages, config=config)
            if getattr(response, "usage_metadata", None):
                total_input_tokens += response.usage_metadata.get("input_tokens", 0)
                total_output_tokens += response.usage_metadata.get("output_tokens", 0)
            text = _extract_text(response.content)
            data = _parse_json(text)
            yaml_files = data.get("yaml_files", [])
            if not yaml_files:
                # Emit visible warning into SSE stream so it shows in Node.js logs
                yield {
                    "event": "progress",
                    "data": {
                        "status": f"[WARN] scenario {scenario.id}: no yaml_files. Response keys={list(data.keys())}. Preview={text[:200]}",
                    }
                }
            all_yaml_files.extend(yaml_files)
            yield {
                "event": "progress",
                "data": {
                    "new_files": yaml_files,
                    "count": len(yaml_files),
                    "scenario_id": scenario.id,
                }
            }
        except Exception as e:
            raw_preview = str(response.content)[:300] if response is not None else "NO_RESPONSE"
            yield {
                "event": "progress",
                "data": {
                    "status": f"[ERROR] scenario {scenario.id}: {e} | raw={raw_preview}",
                }
            }
            logger.error(f"Error converting scenario {scenario.id}: {e} | raw={raw_preview}")
            continue

    yield {
        "event": "completed",
        "data": {
            "yaml_files": all_yaml_files,
            "summary": f"Generated {len(all_yaml_files)} automation scripts.",
            "token_usage": {"input": total_input_tokens, "output": total_output_tokens},
        }
    }
