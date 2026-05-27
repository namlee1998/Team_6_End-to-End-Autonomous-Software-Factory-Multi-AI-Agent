"""
FastAPI server — AI Agents Service
Exposes HTTP + SSE endpoints to trigger LangGraph agents.
This is the bridge between The Backend (Node.js) and the AI Agents (Python).
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from src.agents.agent_1 import run_agent_1, stream_agent_1
from src.agents.agent_2 import run_agent_2, stream_agent_2
from src.agents.agent_3 import run_agent_3, stream_agent_3
from src.schemas import (
    Agent1Input,
    Agent2Input,
    Agent3Input,
    RunAgentRequest,
)
from src.schemas.aidlc import FeatureRequest, IntentAgentInput
from src.agents.intent_agent import run_intent_agent, stream_intent_agent
from src.observability import create_trace_context, flush_observability
from src.workflows.main_pipeline import get_graph

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agents-server")


# =============================================================================
# App lifecycle
# =============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🤖 AI Agents server starting...")
    # Pre-initialize the graph
    try:
        get_graph()
        logger.info("✅ LangGraph pipeline initialized")
    except Exception as e:
        logger.warning("⚠️  LangGraph init warning: %s", e)
    yield
    flush_observability()
    logger.info("👋 AI Agents server shutting down")


app = FastAPI(
    title="Mobile Auto Testcase — AI Agents",
    description="LangGraph-based AI agent service for testcase generation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Helper: dispatch to the right agent
# =============================================================================


def _parse_agent_input(node_target: str, context: dict):
    """Parse context dict into the correct agent input schema."""
    if node_target == "agent_1_extraction":
        return Agent1Input(
            raw_text=context.get("raw_text", ""),
            prompt_profile=context.get("prompt_profile", ""),
            feedback_prompt=context.get("feedback_prompt", ""),
        )
    elif node_target == "agent_2_scenarios":
        from src.schemas import UXFlow

        raw_text = context.get("normalized_flows", "") or context.get(
            "normalized_flows_text", ""
        )
        fp = context.get("feedback_prompt", "")
        import logging

        logging.getLogger(__name__).info(
            f"[main.parse_input] agent_2 feedback_prompt={repr(fp)}"
        )
        return Agent2Input(
            feature_name=context.get("feature_name", "Unknown"),
            flows=[
                UXFlow(**f) if isinstance(f, dict) else f
                for f in context.get("flows", [])
            ],
            normalized_flows_text=raw_text,
            feedback_prompt=fp,
        )
    elif node_target == "agent_3_automation":
        from src.schemas import TestScenario

        raw_text = context.get("test_scenarios", "") or context.get(
            "test_scenarios_text", ""
        )
        return Agent3Input(
            feature_name=context.get("feature_name", "Unknown"),
            scenarios=[
                TestScenario(**s) if isinstance(s, dict) else s
                for s in context.get("scenarios", [])
            ],
            test_scenarios_text=raw_text,
            ui_description=context.get("ui_description", ""),
            framework=context.get("framework", "Mobile Auto Platform"),
            feedback_prompt=context.get("feedback_prompt", ""),
        )
    elif node_target == "intent_node":
        fr_data = context.get("feature_request", {})
        fr = FeatureRequest(**fr_data) if isinstance(fr_data, dict) else fr_data
        return IntentAgentInput(
            feature_request=fr,
            feedback_prompt=context.get("feedback_prompt", ""),
        )
    else:
        raise ValueError(f"Unknown node_target: {node_target}")


async def _run_agent(node_target: str, input_data, trace_context=None):
    """Run the appropriate agent with the parsed input. Returns markdown string."""
    from src.utils.router import get_agent_config
    import json

    context_text = json.dumps(input_data.model_dump(), default=str)
    model_config = get_agent_config(node_target, context_text)

    if node_target == "agent_1_extraction":
        return await run_agent_1(input_data, trace_context=trace_context)
    elif node_target == "agent_2_scenarios":
        return await run_agent_2(input_data, trace_context=trace_context)
    elif node_target == "agent_3_automation":
        return await run_agent_3(input_data, trace_context=trace_context)
    elif node_target == "intent_node":
        return await run_intent_agent(
            input_data, model_config=model_config, trace_context=trace_context
        )
    else:
        raise ValueError(f"Unknown node_target: {node_target}")


async def _stream_agent(
    node_target: str, input_data, trace_context=None
) -> AsyncGenerator[dict, None]:
    """Stream the appropriate agent with the parsed input."""
    from src.utils.router import get_agent_config
    import json

    context_text = json.dumps(input_data.model_dump(), default=str)
    model_config = get_agent_config(node_target, context_text)

    if node_target == "agent_1_extraction":
        async for chunk in stream_agent_1(input_data, trace_context=trace_context):
            yield chunk
    elif node_target == "agent_2_scenarios":
        async for chunk in stream_agent_2(input_data, trace_context=trace_context):
            yield chunk
    elif node_target == "agent_3_automation":
        async for chunk in stream_agent_3(input_data, trace_context=trace_context):
            yield chunk
    elif node_target == "intent_node":
        async for chunk in stream_intent_agent(
            input_data, model_config=model_config, trace_context=trace_context
        ):
            yield chunk
    elif node_target == "po_agent":
        from src.agents.po_agent import stream_po_agent

        async for chunk in stream_po_agent(
            input_data, model_config=model_config, trace_context=trace_context
        ):
            yield chunk
    elif node_target == "ux_agent":
        from src.agents.ux_agent import stream_ux_agent

        async for chunk in stream_ux_agent(
            input_data, model_config=model_config, trace_context=trace_context
        ):
            yield chunk
    elif node_target == "dev_agent":
        from src.agents.dev_agent import stream_dev_agent

        async for chunk in stream_dev_agent(
            input_data, model_config=model_config, trace_context=trace_context
        ):
            yield chunk
    elif node_target == "qa_agent":
        from src.agents.qa_agent import stream_qa_agent

        async for chunk in stream_qa_agent(
            input_data, model_config=model_config, trace_context=trace_context
        ):
            yield chunk
    else:
        yield {
            "event": "error",
            "data": {"message": f"Unknown node_target: {node_target}"},
        }


# =============================================================================
# Routes
# =============================================================================


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-agents"}


@app.post("/v1/agent/run")
async def run_agent(request: RunAgentRequest):
    """
    Run a specific agent node and return the result as JSON stream (SSE).

    The response is streamed as Server-Sent Events:
    - event: progress  → streaming tokens
    - event: completed → final parsed result
    - event: error     → error message
    """
    try:
        input_data = _parse_agent_input(request.node_target, request.context)
    except (ValueError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    trace_context = create_trace_context(
        session_id=request.session_id,
        node_target=request.node_target,
        user_id=request.user_id,
        project_id=request.project_id,
        source_run_id=request.source_run_id,
    )

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            async for chunk in _stream_agent(
                request.node_target, input_data, trace_context
            ):
                # Debug logging
                if chunk.get("event") == "completed":
                    chunk.setdefault("data", {})
                    chunk["data"]["observability"] = trace_context.complete()
                    logger.info(f"Agent completed with: {chunk.get('data', {}).keys()}")
                    if "flows" in chunk.get("data", {}):
                        logger.info(f"Flows count: {len(chunk['data']['flows'])}")
                        if chunk["data"]["flows"]:
                            logger.info(f"First flow: {chunk['data']['flows'][0]}")

                event_line = (
                    f"event: {chunk['event']}\n"
                    f"data: {json.dumps(chunk['data'], ensure_ascii=False)}\n\n"
                )
                yield event_line
        except Exception as e:
            logger.error(f"Agent streaming error: {e}", exc_info=True)
            error_line = (
                f"event: error\n"
                f"data: {json.dumps({'message': str(e), 'observability': trace_context.fail(str(e))}, ensure_ascii=False)}\n\n"
            )
            yield error_line
        finally:
            flush_observability()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/v1/agent/run-sync")
async def run_agent_sync(request: RunAgentRequest):
    """
    Run a specific agent and return the complete JSON result (no streaming).
    Useful for simple cases where the caller just wants the final output.
    """
    try:
        input_data = _parse_agent_input(request.node_target, request.context)
    except (ValueError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        trace_context = create_trace_context(
            session_id=request.session_id,
            node_target=request.node_target,
            user_id=request.user_id,
            project_id=request.project_id,
            source_run_id=request.source_run_id,
        )
        result = await _run_agent(request.node_target, input_data, trace_context)
        return {
            "session_id": request.session_id,
            "node_target": request.node_target,
            "result": result,
            "observability": trace_context.complete(),
        }
    except Exception as e:
        flush_observability()
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {str(e)}")
    finally:
        flush_observability()


@app.get("/v1/agent/stream/{session_id}")
async def stream_agent_ws(session_id: str):
    """
    WebSocket endpoint for real-time agent trace streaming.
    (Placeholder — full WS implementation requires uvicorn wsproto)
    """
    return {
        "session_id": session_id,
        "message": "WebSocket streaming available via SSE at /v1/agent/run",
    }


# =============================================================================
# Run with uvicorn
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
