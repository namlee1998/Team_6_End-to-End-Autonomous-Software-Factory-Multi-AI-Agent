"""
LangGraph workflow — Main Pipeline
Original: Agent 1 → Agent 2 → Agent 3  (testcase generation)
AIDLC:    PO Agent → UX Agent → DEV Agent → QA Agent  (SDLC automation)
Both pipelines share the same graph; node_target selects which to run.
"""

from __future__ import annotations

import json
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from src.agents.po_agent import run_po_agent, stream_po_agent
from src.agents.intent_agent import run_intent_agent, stream_intent_agent
from src.agents.ux_agent import run_ux_agent, stream_ux_agent
from src.agents.dev_agent import run_dev_agent, stream_dev_agent
from src.agents.qa_agent import run_qa_agent, stream_qa_agent
from src.schemas import (
    Agent1Input, Agent1Output,
    Agent2Input, Agent2Output,
    Agent3Input, Agent3Output,
)
from src.schemas.aidlc import (
    IntentAgentInput,
    POAgentInput, FeatureRequest, ProjectContext,
    UXAgentInput, DEVAgentInput, QAAgentInput,
)


# =============================================================================
# Graph State
# =============================================================================

class PipelineState(TypedDict, total=False):
    """State shared across all nodes."""
    session_id: str
    node_target: str
    context: dict
    # Original agents
    agent_1_result: dict | None
    agent_1_error: str | None
    agent_2_result: dict | None
    agent_2_error: str | None
    agent_3_result: dict | None
    agent_3_error: str | None
    # AIDLC agents
    intent_result: dict | None
    intent_error: str | None
    po_result: dict | None
    po_error: str | None
    ux_result: dict | None
    ux_error: str | None
    dev_result: dict | None
    dev_error: str | None
    dev_retries: int
    sandbox_report: str | None
    qa_result: dict | None
    qa_error: str | None
    # Shared
    final_output: dict | None
    error: str | None


# =============================================================================
# Node Functions
# =============================================================================

async def node_agent_1_extraction(state: PipelineState) -> dict:
    """Run Agent 1: UX Flow Extraction."""
    try:
        ctx = state.get("context", {})
        input_data = Agent1Input(
            raw_text=ctx.get("raw_text", ""),
            prompt_profile=ctx.get("prompt_profile", ""),
            resolutions=[
                {"id": r.get("id", r.get("unknown_text", "")), "answer": r.get("user_feedback", r.get("answer", ""))}
                for r in ctx.get("resolutions", [])
            ],
            previous_result=None,
        )
        result = await run_agent_1(input_data)
        return {"agent_1_result": result.model_dump(), "agent_1_error": None}
    except Exception as e:
        return {"agent_1_result": None, "agent_1_error": str(e)}


async def node_agent_2_scenarios(state: PipelineState) -> dict:
    """Run Agent 2: QA Scenario Generation."""
    try:
        ctx = state.get("context", {})
        agent_1_data = state.get("agent_1_result")

        # If context has flows directly, use them; otherwise get from agent_1_result
        if ctx.get("flows"):
            flows_data = ctx["flows"]
            feature_name = ctx.get("feature_name", "Unknown")
        elif agent_1_data:
            flows_data = agent_1_data.get("flows", [])
            feature_name = ctx.get("feature_name") or "Extracted Feature"
        else:
            raise ValueError("No flows available: run agent_1 first or provide flows in context")

        # Build flows as proper objects for the agent
        from src.schemas import UXFlow
        typed_flows = [UXFlow(**f) if isinstance(f, dict) else f for f in flows_data]

        input_data = Agent2Input(
            feature_name=feature_name,
            flows=typed_flows,
        )
        result = await run_agent_2(input_data)
        return {"agent_2_result": result.model_dump(), "agent_2_error": None}
    except Exception as e:
        import traceback
        return {"agent_2_result": None, "agent_2_error": f"{str(e)}\n{traceback.format_exc()}"}


async def node_agent_3_automation(state: PipelineState) -> dict:
    """Run Agent 3: Automation Code Generation."""
    try:
        ctx = state.get("context", {})
        agent_2_data = state.get("agent_2_result")

        if ctx.get("scenarios"):
            scenarios_data = ctx["scenarios"]
            feature_name = ctx.get("feature_name", "Unknown")
        elif agent_2_data:
            scenarios_data = agent_2_data.get("scenarios", [])
            feature_name = agent_2_data.get("feature_name", "Unknown")
        else:
            raise ValueError("No scenarios available: run agent_2 first or provide scenarios in context")

        from src.schemas import TestScenario
        typed_scenarios = [TestScenario(**s) if isinstance(s, dict) else s for s in scenarios_data]

        input_data = Agent3Input(
            feature_name=feature_name,
            scenarios=typed_scenarios,
            ui_description=ctx.get("ui_description", ""),
            framework=ctx.get("framework", "Mobile Auto Platform"),
        )
        result = await run_agent_3(input_data)
        return {"agent_3_result": result.model_dump(), "agent_3_error": None}
    except Exception as e:
        return {"agent_3_result": None, "agent_3_error": str(e)}


# =============================================================================
# AIDLC Node Functions
# =============================================================================

async def node_intent_agent(state: PipelineState) -> dict:
    """Run Intent Agent: Generates AI Assumptions."""
    try:
        ctx = state.get("context", {})
        fr_data = ctx.get("feature_request", {})
        input_data = IntentAgentInput(
            feature_request=FeatureRequest(**fr_data) if isinstance(fr_data, dict) else fr_data,
            feedback_prompt=ctx.get("feedback_prompt", ""),
        )
        result = await run_intent_agent(input_data)
        return {"intent_result": result.model_dump(), "intent_error": None}
    except Exception as e:
        return {"intent_result": None, "intent_error": str(e)}

async def node_po_agent(state: PipelineState) -> dict:
    """Run PO Agent: PRD + User Stories + AC."""
    try:
        ctx = state.get("context", {})
        pc_data = ctx.get("project_context", {})
        
        # In Option C, PO Agent reads intent assumptions from the context
        # (specifically, the user approved intent_assumptions)
        intent_assumptions = ""
        for art in ctx.get("intent_assumptions", []):
            if isinstance(art, dict) and "content" in art:
                intent_assumptions += art["content"] + "\n\n"
        
        # We also need the original FeatureRequest to instantiate POAgentInput properly,
        # or we might just pass the FeatureRequest inside intent assumptions.
        # But POAgentInput expects feature_request. Since we don't have the original
        # request stored easily in the downstream task input (the task has intent_assumptions),
        # Let's mock a feature request containing the intent assumptions as the description.
        # This makes sense because the user Approved the AI Assumptions as the actual requirement!
        fr = FeatureRequest(
            title=ctx.get("title", "Feature Request from AI Assumptions"),
            description=intent_assumptions,
            priority="High",
            target_user="See Intent Assumptions",
            business_goal="See Intent Assumptions"
        )
        
        input_data = POAgentInput(
            feature_request=fr,
            project_context=ProjectContext(**pc_data) if isinstance(pc_data, dict) else ProjectContext(),
            feedback_prompt=ctx.get("feedback_prompt", ""),
        )
        result = await run_po_agent(input_data)
        return {"po_result": result.model_dump(), "po_error": None}
    except Exception as e:
        return {"po_result": None, "po_error": str(e)}


async def node_ux_agent(state: PipelineState) -> dict:
    """Run UX Agent: UX Spec + User Flow + Wireframe."""
    try:
        ctx = state.get("context", {})
        input_data = UXAgentInput(
            prd=ctx.get("prd", ""),
            acceptance_criteria=ctx.get("acceptance_criteria", []),
            feedback_prompt=ctx.get("feedback_prompt", ""),
        )
        result = await run_ux_agent(input_data)
        return {"ux_result": result.model_dump(), "ux_error": None}
    except Exception as e:
        return {"ux_result": None, "ux_error": str(e)}


async def node_dev_agent(state: PipelineState) -> dict:
    """Run DEV Agent: Implementation Plan + Code Diff + Risk."""
    try:
        ctx = state.get("context", {})
        pc_data = ctx.get("project_context", {})
        
        # If we are in a rework loop, append the sandbox report to the feedback prompt
        fp = ctx.get("feedback_prompt", "")
        if state.get("sandbox_report"):
            fp += f"\n\n[SYSTEM] Sandbox execution failed. Please fix the code. Error:\n{state.get('sandbox_report')}"
            
        input_data = DEVAgentInput(
            prd=ctx.get("prd", ""),
            ux_spec=ctx.get("ux_spec", ""),
            user_flow=ctx.get("user_flow", ""),
            acceptance_criteria=ctx.get("acceptance_criteria", []),
            project_context=ProjectContext(**pc_data) if isinstance(pc_data, dict) else ProjectContext(),
            feedback_prompt=fp,
        )
        result = await run_dev_agent(input_data)
        
        retries = state.get("dev_retries", 0)
        
        return {
            "dev_result": result.model_dump(), 
            "dev_error": None,
            "dev_retries": retries
        }
    except Exception as e:
        return {"dev_result": None, "dev_error": str(e)}

async def node_sandbox_gate(state: PipelineState) -> dict:
    """Run Sandbox Gate (G3): Test DEV output."""
    from src.tools.sandbox import run_sandbox_test
    
    dev_res = state.get("dev_result")
    if not dev_res:
        return {"dev_error": "No DEV result to test"}
        
    report = run_sandbox_test(
        dev_res.get("implementation_plan", ""),
        dev_res.get("mock_code_diff", "")
    )
    
    if report["success"]:
        return {"sandbox_report": None} # Passed
    else:
        return {
            "sandbox_report": report["report"],
            "dev_retries": state.get("dev_retries", 0) + 1
        }

def route_dev_sandbox(state: PipelineState) -> str:
    """Route: if sandbox failed and retries < 2, go back to DEV."""
    if state.get("sandbox_report") and state.get("dev_retries", 0) < 2:
        return "dev_agent"
    return "END"


async def node_qa_agent(state: PipelineState) -> dict:
    """Run QA Agent: Test Cases + QA Report + Coverage Matrix."""
    try:
        ctx = state.get("context", {})
        input_data = QAAgentInput(
            prd=ctx.get("prd", ""),
            acceptance_criteria=ctx.get("acceptance_criteria", []),
            ux_spec=ctx.get("ux_spec", ""),
            implementation_plan=ctx.get("implementation_plan", ""),
            mock_code_diff=ctx.get("mock_code_diff", ""),
            risk_assessment=ctx.get("risk_assessment", ""),
            risk_level=ctx.get("risk_level", "LOW"),
            feedback_prompt=ctx.get("feedback_prompt", ""),
        )
        result = await run_qa_agent(input_data)
        return {"qa_result": result.model_dump(), "qa_error": None}
    except Exception as e:
        return {"qa_result": None, "qa_error": str(e)}


# =============================================================================
# Router
# =============================================================================

def route_target(state: PipelineState) -> str:
    target = state.get("node_target", "")
    mapping = {
        "intent_node": "intent_agent",
        "po_agent": "po_agent",
        "ux_agent": "ux_agent",
        "dev_agent": "dev_agent",
        "qa_agent": "qa_agent",
    }
    return mapping.get(target, "error")


# =============================================================================
# Build Graph
# =============================================================================

def build_graph():
    """Build and compile the unified LangGraph workflow."""
    workflow = StateGraph(PipelineState)

    # AIDLC SDLC pipeline nodes
    workflow.add_node("intent_agent", node_intent_agent)
    workflow.add_node("po_agent", node_po_agent)
    workflow.add_node("ux_agent", node_ux_agent)
    workflow.add_node("dev_agent", node_dev_agent)
    workflow.add_node("sandbox_gate", node_sandbox_gate)
    workflow.add_node("qa_agent", node_qa_agent)
    # Error node
    workflow.add_node("error_node", lambda state: {"error": f"Unknown node_target: {state.get('node_target')}"})

    workflow.set_conditional_entry_point(
        route_target,
        path_map={
                        "intent_agent": "intent_agent",
            "po_agent": "po_agent",
            "ux_agent": "ux_agent",
            "dev_agent": "dev_agent",
            "qa_agent": "qa_agent",
            "error": "error_node",
        },
    )

    for node in ["intent_agent", "po_agent", "ux_agent", "qa_agent", "error_node"]:
        workflow.add_edge(node, END)
        
    workflow.add_edge("dev_agent", "sandbox_gate")
    workflow.add_conditional_edges(
        "sandbox_gate",
        route_dev_sandbox,
        {
            "dev_agent": "dev_agent",
            "END": END
        }
    )

    return workflow.compile()


# Singleton graph instance
_graph = None


def get_graph():
    """Get or create the compiled graph (singleton)."""
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
