import json
import os
import logging
from typing import Any, AsyncGenerator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_openai import ChatOpenAI

from src.prompts import AGENT_2_SCENARIOS
from src.schemas import Agent2Input, Agent2Output, TestScenario

logger = logging.getLogger(__name__)

def _get_llm(model_config: dict | None = None) -> ChatOpenAI:
    """Create the LLM instance."""
    model_name = (model_config or {}).get("model") or os.getenv("DEFAULT_MODEL", "kr/claude-sonnet-4.5")
    api_base = os.getenv("OPENAI_API_BASE")
    return ChatOpenAI(
        model=model_name,
        temperature=0.2,
        api_key=os.getenv("OPENAI_API_KEY", ""),
        base_url=api_base if api_base else None,
    )


async def run_agent_2(
    input_data: Agent2Input,
    model_config: dict | None = None,
    trace_context: Any | None = None,
) -> Agent2Output:
    """
    Run Agent 2: Processes flows one by one to generate QA scenarios.
    This prevents token overflow by using a segmentation strategy.
    """
    llm = _get_llm(model)
    parser = JsonOutputParser(pydantic_object=Agent2Output)
    
    all_scenarios = []
    
    # If we have structured flows, process them one by one
    if input_data.flows:
        logger.info(f"Agent 2: Processing {len(input_data.flows)} flows sequentially.")
        for i, flow in enumerate(input_data.flows):
            logger.info(f"Agent 2: Processing flow {i+1}/{len(input_data.flows)}: {flow.name}")
            
            messages = [
                SystemMessage(content=AGENT_2_SCENARIOS),
                HumanMessage(content=f"Feature: {input_data.feature_name}\nFlow to process: {json.dumps(flow.model_dump(), indent=2)}")
            ]
            
            try:
                config = trace_context.langchain_config(f"agent2.flow.{flow.name}") if trace_context else None
                response = await llm.ainvoke(messages, config=config)
                chunk_data = parser.parse(response.content)
                if "scenarios" in chunk_data:
                    feature_name_from_source = flow.source.split('>')[0].strip() if flow.source else input_data.feature_name
                    for s in chunk_data["scenarios"]:
                        s['flow_name'] = flow.name
                        s['feature_name'] = feature_name_from_source
                    all_scenarios.extend([TestScenario(**s) for s in chunk_data["scenarios"]])
            except Exception as e:
                logger.error(f"Error processing flow {flow.name}: {e}")
                continue
    else:
        # Fallback for raw text (not recommended but kept for compatibility)
        logger.warning("Agent 2: No structured flows provided. Falling back to single-turn processing.")
        messages = [
            SystemMessage(content=AGENT_2_SCENARIOS),
            HumanMessage(content=f"Feature: {input_data.feature_name}\nFlows text: {input_data.normalized_flows_text}")
        ]
        config = trace_context.langchain_config("agent2.flow.raw") if trace_context else None
        response = await llm.ainvoke(messages, config=config)
        chunk_data = parser.parse(response.content)
        if "scenarios" in chunk_data:
            all_scenarios.extend([TestScenario(**s) for s in chunk_data["scenarios"]])

    # Convert to markdown for UI display compatibility if needed
    markdown = "# QA Test Scenarios\n\n"
    for ts in all_scenarios:
        markdown += f"## {ts.id}: {ts.name}\n"
        markdown += f"**Priority:** {ts.priority} | **Type:** {ts.type}\n\n"
        if ts.preconditions:
            markdown += "**Preconditions:**\n"
            for p in ts.preconditions: markdown += f"- {p}\n"
            markdown += "\n"
        markdown += "**Steps:**\n"
        for step in ts.steps:
            markdown += f"{step['id'] if isinstance(step, dict) else step.id}. {step['action'] if isinstance(step, dict) else step.action} -> {step['expected_result'] if isinstance(step, dict) else step.expected_result}\n"
        markdown += f"\n**Expected Outcome:** {ts.expected_outcome}\n"
        if ts.assert_hints:
            markdown += "**Assert Hints:**\n"
            for hint in ts.assert_hints:
                markdown += f"- {hint}\n"
        markdown += "\n---\n\n"

    return Agent2Output(
        feature_name=input_data.feature_name,
        scenarios=all_scenarios,
        markdown=markdown
    )


async def stream_agent_2(
    input_data: Agent2Input,
    model_config: dict | None = None,
    trace_context: Any | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Stream Agent 2 output feature-by-feature.
    """
    llm = _get_llm(model)
    parser = JsonOutputParser()
    
    accumulated_scenarios = []
    total_input_tokens = 0
    total_output_tokens = 0

    if not input_data.flows:
        # Single turn fallback
        messages = [
            SystemMessage(content=AGENT_2_SCENARIOS),
            HumanMessage(content=f"Feature: {input_data.feature_name}\nFlows: {input_data.normalized_flows_text}")
        ]
        config = trace_context.langchain_config("agent2.flow.raw") if trace_context else None
        async for chunk in llm.astream(messages, config=config):
             yield {"event": "progress", "data": {"token": chunk.content}}
        return

    total = len(input_data.flows)
    logger.info(f"[Agent2.stream] feedback_prompt={repr(input_data.feedback_prompt)}")
    feedback_prefix = (
        f"<user_feedback>\n{input_data.feedback_prompt}\n</user_feedback>\n\n"
        if input_data.feedback_prompt else ""
    )
    for i, flow in enumerate(input_data.flows):
        yield {
            "event": "progress",
            "data": {"status": f"Processing flow {i+1}/{total}: {flow.name}", "percentage": int((i/total)*100)}
        }

        human_content = f"{feedback_prefix}Feature: {input_data.feature_name}\nFlow: {json.dumps(flow.model_dump())}"
        messages = [
            SystemMessage(content=AGENT_2_SCENARIOS),
            HumanMessage(content=human_content)
        ]
        
        config = trace_context.langchain_config(f"agent2.flow.{flow.name}") if trace_context else None
        response = await llm.ainvoke(messages, config=config)
        if getattr(response, "usage_metadata", None):
            total_input_tokens += response.usage_metadata.get("input_tokens", 0)
            total_output_tokens += response.usage_metadata.get("output_tokens", 0)
        try:
            data = parser.parse(response.content)
            scenarios = data.get("scenarios", [])
            # Tag each scenario with its source flow and feature
            feature_name_from_source = flow.source.split('>')[0].strip() if flow.source else input_data.feature_name
            for scenario in scenarios:
                scenario['flow_name'] = flow.name
                scenario['feature_name'] = feature_name_from_source
            accumulated_scenarios.extend(scenarios)

            yield {
                "event": "progress",
                "data": {
                    "new_scenarios": scenarios,
                    "count": len(scenarios)
                }
            }
        except:
            continue

    yield {
        "event": "completed",
        "data": {
            "feature_name": input_data.feature_name,
            "scenarios": accumulated_scenarios,
            "count": len(accumulated_scenarios),
            "token_usage": {"input": total_input_tokens, "output": total_output_tokens},
        }
    }
