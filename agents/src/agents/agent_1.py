"""
Agent 1 — UX Flow Extraction
Extracts structured UX flows from raw document text.
Supports multi-feature documents by processing each feature separately.
"""

from __future__ import annotations

import json
import logging
import os
import re

from typing import Any
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from src.prompts import AGENT_1_EXTRACTION, AGENT_1_UI_CONTEXT
from src.schemas import Agent1Input, Agent1Output, FlowUIContext, UXFlow

logger = logging.getLogger(__name__)


def _split_by_big_features(raw_text: str) -> list[tuple[str, str]]:
    """
    Split document content by Big Features.
    Returns list of (feature_name, content) tuples.
    """
    # Match pattern: ## BIG FEATURE N: Feature Name
    pattern = r"##\s*BIG\s+FEATURE\s+\d+[:\s]+([^\n]+)"

    # Find all big feature headers
    matches = list(re.finditer(pattern, raw_text, re.IGNORECASE))

    if not matches:
        # No big features found, treat entire document as one feature
        return [("Unknown Feature", raw_text)]

    features = []
    for i, match in enumerate(matches):
        feature_name = match.group(1).strip()
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw_text)
        content = raw_text[start:end].strip()
        features.append((feature_name, content))

    merged_features: list[tuple[str, str]] = []
    feature_positions: dict[str, int] = {}

    for feature_name, content in features:
        existing_index = feature_positions.get(feature_name)
        if existing_index is None:
            feature_positions[feature_name] = len(merged_features)
            merged_features.append((feature_name, content))
            continue

        previous_name, previous_content = merged_features[existing_index]
        normalized_previous = re.sub(r"\s*---\s*$", "", previous_content).rstrip()
        normalized_content = re.sub(r"^\s*---\s*", "", content).strip()
        merged_features[existing_index] = (
            previous_name,
            normalized_previous + "\n\n---\n\n" + normalized_content,
        )

    return merged_features


def _build_prompt_for_feature(
    feature_name: str, feature_content: str, prompt_profile: str
) -> str:
    """Build prompt for a specific feature."""
    prompt = AGENT_1_EXTRACTION

    context_parts = [
        f"\n\n--- FEATURE CONTEXT ---\n{feature_name}",
        f"\n\n--- CONTENT ---\n{feature_content[:10000]}",  # Limit context per feature
    ]

    return (
        prompt
        + "\n".join(context_parts)
        + (
            "\n\nIMPORTANT: Output ONLY the flows in the specified format. "
            "Do NOT add any extra text, descriptions, or summaries."
        )
    )


def _get_llm(model: str | None = None) -> ChatOpenAI:
    """Create the LLM instance."""
    model_name = model or os.getenv("DEFAULT_MODEL", "kr/claude-sonnet-4.5")
    api_base = os.getenv("OPENAI_API_BASE") or None  # treat empty string as unset
    return ChatOpenAI(
        model=model_name,
        temperature=0.2,
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=api_base,
    )


def _parse_flows_from_markdown(markdown: str) -> list[UXFlow]:
    """Parse flows from markdown output."""
    flows = []

    # Split by flow headers (Support both 'Flow 1' and 'FLOW_01')
    flow_regex = r"^#{2,3}\s+(?:Flow|FLOW)[\d_\s–-]+(.+)$"
    matches = list(re.finditer(flow_regex, markdown, re.MULTILINE))

    for i, match in enumerate(matches):
        flow_name = match.group(1).strip()
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(markdown)
        section = markdown[start:end]

        # Extract source
        source_match = re.search(r"\*\*Source\*\*[:\s]+(.+?)(?:\r?\n|$)", section)
        source = source_match.group(1).strip() if source_match else ""

        # Extract steps
        steps = re.findall(r"^\d+\.\s+(.+)$", section, re.MULTILINE)

        if steps:  # Only add if has steps
            flows.append(
                UXFlow(name=flow_name, source=source, steps=[s.strip() for s in steps])
            )

    return flows


async def _enrich_flows_with_ui_context(
    feature_content: str,
    flows: list[UXFlow],
    llm: ChatOpenAI,
    trace_context: Any | None,
    feature_idx: int,
) -> list[UXFlow]:
    """
    Call LLM once per feature to extract UI context for each flow.
    Returns flows with ui_context populated; falls back to empty context on failure.
    """
    if not flows:
        return flows

    flow_names = [f.name for f in flows]
    messages = [
        SystemMessage(content=AGENT_1_UI_CONTEXT),
        HumanMessage(content=(
            f"Flows to enrich: {json.dumps(flow_names)}\n\n"
            f"Feature document:\n{feature_content[:8000]}"
        )),
    ]

    config = (
        trace_context.langchain_config(f"agent1.ui_context.{feature_idx + 1}")
        if trace_context
        else None
    )

    try:
        response = await llm.ainvoke(messages, config=config)
        text = response.content.strip()
        # Strip markdown fences if present
        fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if fence_match:
            text = fence_match.group(1).strip()
        context_map: dict[str, dict] = json.loads(text)
    except Exception as e:
        logger.warning(f"[Agent1] UI context extraction failed for feature {feature_idx + 1}: {e}")
        return flows

    enriched = []
    for flow in flows:
        raw_ctx = context_map.get(flow.name, {})
        try:
            ui_ctx = FlowUIContext(**raw_ctx)
        except Exception:
            ui_ctx = FlowUIContext()
        enriched.append(flow.model_copy(update={"ui_context": ui_ctx}))
    return enriched


async def run_agent_1(
    input_data: Agent1Input, model: str | None = None, trace_context: Any | None = None
) -> Agent1Output:
    """
    Run Agent 1: Extract UX flows from document text.
    Supports multi-feature documents by processing each feature separately.
    """
    # Split document by big features
    features = _split_by_big_features(input_data.raw_text)

    all_flows = []
    all_markdown_parts = []

    for feature_idx, (feature_name, feature_content) in enumerate(features):
        # Build prompt for this feature
        prompt_text = _build_prompt_for_feature(
            feature_name, feature_content, input_data.prompt_profile
        )

        llm = _get_llm(model)
        messages = [
            SystemMessage(content=prompt_text),
            HumanMessage(content=f"Extract all flows from: {feature_name}"),
        ]

        config = (
            trace_context.langchain_config(f"agent1.feature.{feature_idx + 1}")
            if trace_context
            else None
        )
        response = await llm.ainvoke(messages, config=config)
        feature_markdown = response.content

        # Parse flows then enrich with UI context
        feature_flows = _parse_flows_from_markdown(feature_markdown)
        feature_flows = await _enrich_flows_with_ui_context(
            feature_content, feature_flows, llm, trace_context, feature_idx
        )
        all_flows.extend(feature_flows)
        all_markdown_parts.append(feature_markdown)

    # Combine all results
    combined_markdown = "\n\n---\n\n".join(all_markdown_parts)

    return Agent1Output(
        flows=all_flows, raw_markdown=combined_markdown, feature_count=len(features)
    )


async def stream_agent_1(
    input_data: Agent1Input,
    model: str | None = None,
    trace_context: Any | None = None,
) -> Any:
    """
    Stream Agent 1 output token by token.
    Processes features sequentially for simplicity in streaming mode.
    """
    features = _split_by_big_features(input_data.raw_text)

    all_flows = []
    all_markdown_parts = []
    total_input_tokens = 0
    total_output_tokens = 0

    for feature_idx, (feature_name, feature_content) in enumerate(features):
        prompt_text = _build_prompt_for_feature(
            feature_name, feature_content, input_data.prompt_profile
        )

        llm = _get_llm(model)
        human_content = f"Extracting flows from: {feature_name}"
        if input_data.feedback_prompt:
            human_content = f"<user_feedback>\n{input_data.feedback_prompt}\n</user_feedback>\n\n{human_content}"
        messages = [
            SystemMessage(content=prompt_text),
            HumanMessage(content=human_content),
        ]

        feature_markdown = ""
        feature_tag = f"{feature_idx + 1}/{len(features)}: {feature_name}"
        config = (
            trace_context.langchain_config(f"agent1.feature.{feature_idx + 1}")
            if trace_context
            else None
        )
        if hasattr(llm, "astream_events"):
            async for event in llm.astream_events(messages, version="v2", config=config):
                kind = event["event"]
                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    if chunk.content:
                        feature_markdown += chunk.content
                        yield {
                            "event": "progress",
                            "data": {"step": "agent_1", "token": chunk.content, "feature": feature_tag},
                        }
                elif kind == "on_chat_model_end":
                    output = event["data"].get("output")
                    usage = getattr(output, "usage_metadata", None)
                    if usage:
                        logger.info(f"[Agent1 usage_metadata full] {usage}")
                        total_input_tokens += usage.get("input_tokens", 0)
                        total_output_tokens += usage.get("output_tokens", 0)
        else:
            stream = llm.astream(messages, config=config) if config else llm.astream(messages)
            async for chunk in stream:
                if chunk.content:
                    feature_markdown += chunk.content
                    yield {
                        "event": "progress",
                        "data": {"step": "agent_1", "token": chunk.content, "feature": feature_tag},
                    }

        # Parse flows then enrich with UI context (non-streaming call)
        feature_flows = _parse_flows_from_markdown(feature_markdown)
        feature_flows = await _enrich_flows_with_ui_context(
            feature_content, feature_flows, llm, trace_context, feature_idx
        )
        all_flows.extend(feature_flows)
        all_markdown_parts.append(feature_markdown)

    # Combine results
    combined_markdown = "\n\n---\n\n".join(all_markdown_parts)

    # Convert flows to dict for JSON serialization
    flows_dict = [flow.model_dump() for flow in all_flows]

    yield {
        "event": "completed",
        "data": {
            "flows": flows_dict,
            "markdown": combined_markdown,
            "raw_markdown": combined_markdown,
            "feature_count": len(features),
            "token_usage": {"input": total_input_tokens, "output": total_output_tokens},
        },
    }
