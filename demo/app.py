"""
AIDLC Control Platform  Demo Server
Run: cd demo && python -m uvicorn app:app --port 8080 --reload
"""
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="AIDLC Control Platform Demo")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

#  Paths 
BASE   = Path(__file__).parent
MOCK   = BASE.parent / "mock-data"
STATIC = BASE / "static"

#  Mock user (single dev account, full access) 
MOCK_USERS: dict[str, dict] = {
    "dev@aidlc.ai": {
        "id": "usr-001", "name": "Dev User", "email": "dev@aidlc.ai",
        "password": "dev123", "role": "admin", "avatar": "DV",
        "projects": 12, "workflows": 47,
    },
}

sessions: dict[str, dict] = {}

#  Workflow constants 
AGENT_ARTIFACTS = {
    "PO_RUNNING": [
        ("prd",                 "po-agent/prd.md",                 "PRD"),
        ("user_stories",        "po-agent/user_stories.md",        "User Stories"),
        ("acceptance_criteria", "po-agent/acceptance_criteria.md", "Acceptance Criteria"),
        ("scope",               "po-agent/scope.md",               "Scope"),
    ],
    "UX_RUNNING": [
        ("ux_spec",             "ux-agent/ux_spec.md",             "UX Spec"),
        ("user_flow",           "ux-agent/user_flow.md",           "User Flow"),
        ("wireframe_spec",      "ux-agent/wireframe_spec.md",      "Wireframe Spec"),
        ("component_inventory", "ux-agent/component_inventory.md", "Component Inventory"),
    ],
    "DEV_RUNNING": [
        ("implementation_plan", "dev-agent/implementation_plan.md", "Implementation Plan"),
        ("mock_code_diff",      "dev-agent/mock_code_diff.md",      "Code Diff"),
        ("changed_files",       "dev-agent/changed_files.json",     "Changed Files"),
        ("risk_assessment",     "dev-agent/risk_assessment.md",     "Risk Assessment"),
    ],
    # QA: dynamic  picked in _run_qa() based on run count
}

QA_ARTIFACTS_FAIL = [
    ("test_cases",         "qa-agent/test_cases_fail.md",    "Test Cases [FAIL]"),
    ("ac_coverage_matrix", "qa-agent/ac_coverage_matrix.md", "AC Coverage Matrix"),
    ("qa_report",          "qa-agent/qa_report_fail.md",     "QA Report [FAIL]"),
]

QA_ARTIFACTS_PASS = [
    ("test_cases",         "qa-agent/test_cases.md",          "Test Cases [PASS]"),
    ("ac_coverage_matrix", "qa-agent/ac_coverage_matrix.md",  "AC Coverage Matrix"),
    ("qa_report",          "qa-agent/qa_report.md",           "QA Report [PASS]"),
]

AGENT_STAGES = {
    "po": [
        "Intent parse",
        "PRD draft",
        "Stories + AC",
        "Contract publish",
    ],
    "ux": [
        "Consume PRD contract",
        "User flow",
        "Wireframe spec",
        "Design token handoff",
    ],
    "dev": [
        "Consume UX/API contract",
        "Implementation plan",
        "Code diff",
        "Risk + CI handoff",
    ],
    "qa": [
        "Consume build contract",
        "Generate tests",
        "Run E2E + report",
    ],
}

AGENT_STAGE_DETAILS = {
    "po": {
        "Intent parse": {
            "does": "Normalize the user feature request into structured product intent.",
            "input": "feature_request + project_context",
            "mcp": "None",
            "a2a": "Prepares product_intent contract for all downstream workers.",
            "output": "Problem statement, goals, constraints, stakeholder intent.",
        },
        "PRD draft": {
            "does": "Draft the PRD from validated intent and project context.",
            "input": "product_intent contract",
            "mcp": "Notion MCP draft page",
            "a2a": "Publishes prd.v1 fields for UX, DEV, and QA.",
            "output": "prd.md",
        },
        "Stories + AC": {
            "does": "Generate user stories and acceptance criteria as executable contracts.",
            "input": "prd.v1",
            "mcp": "Notion MCP update",
            "a2a": "Sends acceptance_criteria.v1 to UX and QA.",
            "output": "user_stories.md, acceptance_criteria.md",
        },
        "Contract publish": {
            "does": "Validate required fields and expose the product contract to the graph.",
            "input": "PRD + stories + AC",
            "mcp": "Notion MCP publish",
            "a2a": "PO -> UX/DEV/QA: product_contract.v1",
            "output": "scope.md + contract validation event",
        },
    },
    "ux": {
        "Consume PRD contract": {
            "does": "Read PO's product contract and map requirements to UX tasks.",
            "input": "product_contract.v1",
            "mcp": "None",
            "a2a": "Consumes PO -> UX product_contract.v1.",
            "output": "UX task map",
        },
        "User flow": {
            "does": "Create the login flow and key interaction states.",
            "input": "PRD + acceptance criteria",
            "mcp": "Figma MCP prepare frames",
            "a2a": "Shares ux_flow.v1 with DEV for feasibility.",
            "output": "user_flow.md",
        },
        "Wireframe spec": {
            "does": "Define screen layout, responsive behavior, and edge states.",
            "input": "ux_flow.v1",
            "mcp": "Figma MCP create/update frames",
            "a2a": "UX -> DEV: wireframe_spec.v1",
            "output": "wireframe_spec.md",
        },
        "Design token handoff": {
            "does": "Package component inventory and tokens for implementation.",
            "input": "Figma frame metadata",
            "mcp": "Figma MCP export tokens",
            "a2a": "UX -> DEV: design_handoff.v1",
            "output": "ux_spec.md + component_inventory.md",
        },
    },
    "dev": {
        "Consume UX/API contract": {
            "does": "Merge PO acceptance criteria with UX design handoff.",
            "input": "product_contract.v1 + design_handoff.v1",
            "mcp": "GitHub MCP read repo context",
            "a2a": "Consumes PO/UX contracts before implementation.",
            "output": "implementation task graph",
        },
        "Implementation plan": {
            "does": "Plan code changes, files, tests, and migration risk.",
            "input": "contract bundle",
            "mcp": "GitHub MCP branch metadata",
            "a2a": "DEV -> QA: planned_test_surface.v1",
            "output": "implementation_plan.md",
        },
        "Code diff": {
            "does": "Generate the mocked implementation diff for Google auth.",
            "input": "implementation_plan",
            "mcp": "GitHub MCP create PR / diff",
            "a2a": "DEV -> QA: build_artifact.v1",
            "output": "mock_code_diff.md, changed_files.json",
        },
        "Risk + CI handoff": {
            "does": "Classify changed auth and DB files, then hand off to QA.",
            "input": "changed_files + CI summary",
            "mcp": "GitHub MCP CI status",
            "a2a": "DEV -> QA/Supervisor: risk_assessment.v1",
            "output": "risk_assessment.md",
        },
    },
    "qa": {
        "Consume build contract": {
            "does": "Load DEV build artifact, changed files, and acceptance criteria.",
            "input": "build_artifact.v1 + acceptance_criteria.v1",
            "mcp": "TestRail/Jira MCP context lookup",
            "a2a": "Consumes DEV -> QA build_artifact.v1.",
            "output": "QA execution plan",
        },
        "Generate tests": {
            "does": "Create test cases directly from acceptance criteria and risk files.",
            "input": "AC + risk_assessment",
            "mcp": "TestRail MCP create/update cases",
            "a2a": "QA -> Supervisor: qa_plan.v1",
            "output": "test_cases.md",
        },
        "Run E2E + report": {
            "does": "Run checks, isolate owner of each issue, and publish QA report.",
            "input": "test_cases + build_artifact",
            "mcp": "Jira MCP file bug, TestRail MCP update run",
            "a2a": "QA -> Supervisor: qa_result.v1 with owner hints.",
            "output": "qa_report.md + bug ownership",
        },
    },
}

#  LangGraph-style state 
# Workflow states:
#   DRAFT  SUPERVISOR_INIT  WORKERS_RUNNING (PO/UX/DEV/QA in parallel)
#    HITL_REVIEW (single human gate)
#    on approve: READY (done)
#    on feedback: SUPERVISOR_REWORK  targeted worker fan-out  HITL_REVIEW
state: dict = {
    "workflow_run_id": "WR-001",
    "fanout_count":    0,
    "status":          "IDLE",   # IDLE | RUNNING | WAITING_GATE | DONE
    "workflow_state":  "DRAFT",
    "artifacts":       {},
    "audit":           [],
    "approvals":       [],
    "agent_progress":  0,
    "current_gate":    None,
    "rework_count":    0,
    "supervisor_msg":  "",       # current supervisor decision/routing message
    "started_at":      None,
    "risk_level":      "LOW",
    "risk_files":      [],
    "qa_run_count":    0,
    "qa_has_blocker":  False,
    "qa_bugs":         [],
    "worker_status":   {"po": "idle", "ux": "idle", "dev": "idle", "qa": "idle"},
    "worker_progress": {"po": 0, "ux": 0, "dev": 0, "qa": 0},
    "worker_stage":    {"po": "", "ux": "", "dev": "", "qa": ""},
    "worker_steps":    AGENT_STAGES,
    "worker_stage_details": AGENT_STAGE_DETAILS,
    "worker_runs":     {"po": None, "ux": None, "dev": None, "qa": None},
}

subscribers: list[asyncio.Queue] = []

#  Helpers 
def read_mock(rel: str) -> str:
    p = MOCK / rel
    return p.read_text(encoding="utf-8") if p.exists() else f"_(mock file not found: {rel})_"

def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")

def log(
    actor: str,
    action: str,
    note: str = "",
    artifact_id: str = "",
    worker: str = "",
    run_id: str = "",
    parent: str = "",
):
    entry = {
        "id":              f"LOG-{len(state['audit'])+1:03d}",
        "workflow_run_id": state["workflow_run_id"],
        "actor":           actor,
        "action":          action,
        "note":            note,
        "artifact":        artifact_id,
        "state":           state["workflow_state"],
        "worker":          worker,
        "run_id":          run_id,
        "parent":          parent,
        "ts":              ts(),
    }
    state["audit"].append(entry)
    broadcast({"type": "audit", "entry": entry})

def broadcast(msg: dict):
    data = json.dumps(msg)
    for q in list(subscribers):
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            pass

def push_state():
    broadcast({"type": "state", "data": get_public_state()})

def get_public_state() -> dict:
    return {
        "workflow_run_id": state["workflow_run_id"],
        "status":         state["status"],
        "workflow_state": state["workflow_state"],
        "agent_progress": state["agent_progress"],
        "current_gate":   state["current_gate"],
        "artifacts":      list(state["artifacts"].keys()),
        "approvals":      state["approvals"],
        "audit_count":    len(state["audit"]),
        "rework_count":   state["rework_count"],
        "supervisor_msg": state["supervisor_msg"],
        "started_at":     state["started_at"],
        "risk_level":     state["risk_level"],
        "risk_files":     state["risk_files"],
        "qa_has_blocker": state["qa_has_blocker"],
        "qa_bugs":        state["qa_bugs"],
        "worker_status":  state["worker_status"],
        "worker_progress": state["worker_progress"],
        "worker_stage":   state["worker_stage"],
        "worker_steps":   state["worker_steps"],
        "worker_stage_details": state["worker_stage_details"],
        "worker_runs":    state["worker_runs"],
    }

#  Agent simulation 
async def simulate_agent(running_state: str, artifact_defs: list, agent_name: str, delay: float = 1.2, worker_key: str | None = None):
    run_info = state["worker_runs"].get(worker_key) if worker_key else None
    trace = {
        "worker": worker_key or "",
        "run_id": run_info.get("run_id", "") if run_info else "",
        "parent": run_info.get("parent", "") if run_info else "",
    }
    if not worker_key:
        state["workflow_state"] = running_state
    state["status"]         = "RUNNING"
    state["agent_progress"] = _aggregate_worker_progress()
    if worker_key:
        state["worker_status"][worker_key] = "running"
        state["worker_progress"][worker_key] = 0
        state["worker_stage"][worker_key] = AGENT_STAGES.get(worker_key, ["Running"])[0]
        if run_info:
            run_info["status"] = "running"
            run_info["started_at"] = ts()
    log("WORKFLOW_ORCHESTRATOR", "AGENT_START",
        f"{agent_name} started  phase: {running_state}", **trace)
    push_state()

    for i, (key, path, label) in enumerate(artifact_defs):
        if worker_key:
            stages = AGENT_STAGES.get(worker_key, [])
            current_stage = stages[min(i, len(stages) - 1)] if stages else label
            state["worker_stage"][worker_key] = current_stage
            if run_info:
                run_info["stage"] = current_stage
            log(agent_name.upper().replace(" ", "_"), "NODE_STAGE_START",
                f"LangGraph node stage: {current_stage}", worker=worker_key,
                run_id=trace["run_id"], parent=trace["parent"])
            push_state()
        await asyncio.sleep(delay)
        state["artifacts"][key] = {
            "label":   label,
            "content": read_mock(path),
            "path":    path,
            "phase":   running_state,
        }
        pct = int((i + 1) / len(artifact_defs) * 100)
        if worker_key:
            state["worker_progress"][worker_key] = pct
            state["agent_progress"] = _aggregate_worker_progress()
            if run_info:
                run_info["progress"] = pct
                run_info["artifacts"].append(key)
        else:
            state["agent_progress"] = pct
        log(agent_name.upper().replace(" ", "_"), f"GENERATE_{key.upper()}",
            f"Artifact created: {label}", key, **trace)
        broadcast({"type": "artifact", "key": key, "label": label, "phase": running_state})
        push_state()

    await asyncio.sleep(0.7)
    log(agent_name.upper().replace(" ", "_"), "SELF_REVIEW",
        "Output contract validation passed  all required fields present", **trace)
    if worker_key:
        state["worker_status"][worker_key] = "done"
        state["worker_progress"][worker_key] = 100
        state["worker_stage"][worker_key] = "Complete"
        state["agent_progress"] = _aggregate_worker_progress()
        if run_info:
            run_info["status"] = "done"
            run_info["progress"] = 100
            run_info["stage"] = "Complete"
            run_info["completed_at"] = ts()
    else:
        state["agent_progress"] = 100

def _aggregate_worker_progress() -> int:
    progress = state.get("worker_progress", {})
    statuses = state.get("worker_status", {})
    active_keys = [k for k, v in statuses.items() if v in ("queued", "running", "done")]
    if not active_keys:
        return 0
    return int(sum(progress.get(k, 0) for k in active_keys) / len(active_keys))

def _worker_trace(worker_key: str) -> dict:
    run_info = state["worker_runs"].get(worker_key) or {}
    return {
        "worker": worker_key,
        "run_id": run_info.get("run_id", ""),
        "parent": run_info.get("parent", ""),
    }

#  LangGraph Worker nodes 
async def _run_po(is_rework: bool = False):
    label = "PO Agent (Fix)" if is_rework else "PO Agent"
    await simulate_agent("PO_RUNNING", AGENT_ARTIFACTS["PO_RUNNING"], label, worker_key="po")
    log("MCP_TOOL_BUS", "MCP_CALL_NOTION", "Published PRD, User Stories, and Acceptance Criteria.", **_worker_trace("po"))
    log("A2A_PROTOCOL", "A2A_CONTRACT_VALIDATED", "PO contract payload ready for UX/DEV/QA consumers.", **_worker_trace("po"))
    log("PO_AGENT", "WORKER_COMPLETE",
        "Requirements analysis done. PRD + User Stories + AC delivered to Supervisor.",
        **_worker_trace("po"))

async def _run_ux(is_rework: bool = False):
    label = "UI/UX Agent (Fix)" if is_rework else "UI/UX Agent"
    await simulate_agent("UX_RUNNING", AGENT_ARTIFACTS["UX_RUNNING"], label, worker_key="ux")
    log("MCP_TOOL_BUS", "MCP_CALL_FIGMA", "Created frames, interaction notes, and design token export.", **_worker_trace("ux"))
    log("A2A_PROTOCOL", "A2A_MESSAGE_SENT", "UX/UI sent Figma spec and component inventory to DEV.", **_worker_trace("ux"))
    log("UIUX_AGENT", "WORKER_COMPLETE",
        "UX Spec + Wireframes + User Flow delivered to Supervisor.",
        **_worker_trace("ux"))

async def _run_dev(is_rework: bool = False):
    label = "DEV Agent (Fix)" if is_rework else "DEV Agent"
    await simulate_agent("DEV_RUNNING", AGENT_ARTIFACTS["DEV_RUNNING"], label,
                         delay=0.9 if is_rework else 1.2, worker_key="dev")
    state["risk_level"] = "HIGH"
    state["risk_files"] = [
        "backend/routers/auth.py",
        "backend/services/google_auth_service.py",
        "backend/migrations/add_google_auth_columns.sql",
    ]
    log("MCP_TOOL_BUS", "MCP_CALL_GITHUB", "Opened implementation branch, updated code diff, and attached CI metadata.", **_worker_trace("dev"))
    log("A2A_PROTOCOL", "A2A_MESSAGE_SENT", "DEV sent build artifact, changed files, and risk assessment to QA.", **_worker_trace("dev"))
    if is_rework:
        log("DEV_AGENT", "WORKER_COMPLETE",
            " Fix applied: BUG-002 (redirect timeout). "
            "Implementation artifacts updated. Delivered to Supervisor.",
            **_worker_trace("dev"))
    else:
        log("DEV_AGENT", "WORKER_COMPLETE",
            "Implementation complete. Risk=HIGH flagged (auth flow + DB schema). "
            "Artifacts delivered to Supervisor for HITL review.",
            **_worker_trace("dev"))

async def _run_qa(is_rework: bool = False):
    qa_run = state["qa_run_count"]
    state["qa_run_count"] += 1

    if qa_run == 0 and not is_rework:
        artifacts = QA_ARTIFACTS_FAIL
        state["qa_has_blocker"] = True
        state["qa_bugs"] = [
            {"id": "BUG-001", "severity": "BLOCKER",
             "title": "Google button not visible on Mobile Safari (iOS 17)",
             "tc": "TC-001", "file": "src/pages/LoginPage.tsx"},
            {"id": "BUG-002", "severity": "MAJOR",
             "title": "Redirect takes 5.8s on Slow 3G (spec: <3s)",
             "tc": "TC-003", "file": "backend/services/google_auth_service.py"},
        ]
        await simulate_agent("QA_RUNNING", artifacts, "QA Agent", delay=1.0, worker_key="qa")
        log("MCP_TOOL_BUS", "MCP_CALL_JIRA", "Filed BUG-001 and BUG-002 with severity, test case, and owning file.", **_worker_trace("qa"))
        log("ERROR_ISOLATION_LAYER", "BUSINESS_LOGIC_ERROR_ISOLATED",
            "QA detected owner-specific defects. Supervisor can route BUG-001 to UX and BUG-002 to DEV.",
            **_worker_trace("qa"))
        log("QA_AGENT", "WORKER_COMPLETE_WITH_ISSUES",
            " BLOCKER: BUG-001 (Mobile Safari).  MAJOR: BUG-002 (timeout). "
            "QA report delivered to Supervisor  flagged for HITL attention.",
            **_worker_trace("qa"))
    else:
        state["qa_has_blocker"] = False
        state["qa_bugs"] = []
        await simulate_agent("QA_RUNNING", QA_ARTIFACTS_PASS,
                             "QA Agent (Re-run)" if is_rework else "QA Agent", delay=0.8, worker_key="qa")
        log("MCP_TOOL_BUS", "MCP_CALL_TESTRAIL", "Updated passing QA run and coverage report.", **_worker_trace("qa"))
        log("A2A_PROTOCOL", "A2A_MESSAGE_SENT", "QA sent pass signal and report summary to Supervisor.", **_worker_trace("qa"))
        log("QA_AGENT", "WORKER_COMPLETE",
            " All tests passing (9/9 ACs, 0 blockers). QA report delivered to Supervisor.",
            **_worker_trace("qa"))

#  LangGraph Supervisor node 
def _supervisor_set(msg: str, wf_state: str | None = None):
    state["supervisor_msg"] = msg
    if wf_state:
        state["workflow_state"] = wf_state
        state["status"] = "RUNNING"

async def _supervisor_route_workers(is_rework: bool = False, start_from: str = "po"):
    """Supervisor fans out worker nodes in parallel starting from start_from."""
    order   = ["po", "ux", "dev", "qa"]
    workers = {
        "po":  lambda: _run_po(is_rework),
        "ux":  lambda: _run_ux(is_rework),
        "dev": lambda: _run_dev(is_rework),
        "qa":  lambda: _run_qa(is_rework),
    }
    names = {"po": "PO Agent", "ux": "UI/UX Agent", "dev": "DEV Agent", "qa": "QA Agent"}
    start_idx = order.index(start_from) if start_from in order else 0
    selected = [start_from] if is_rework else order[start_idx:]
    state["fanout_count"] += 1
    parent_run_id = (
        f"{state['workflow_run_id']}-{'REWORK' if is_rework else 'FANOUT'}-"
        f"{state['fanout_count']:02d}"
    )

    for w in selected:
        state["worker_status"][w] = "queued"
        state["worker_progress"][w] = 0
        state["worker_stage"][w] = "Queued"
        state["worker_runs"][w] = {
            "worker": w,
            "run_id": f"{parent_run_id}-{w.upper()}",
            "parent": parent_run_id,
            "status": "queued",
            "progress": 0,
            "stage": "Queued",
            "started_at": None,
            "completed_at": None,
            "artifacts": [],
        }

    _supervisor_set(
        ("Targeted rework: " if is_rework else "Fan-out dispatch: ")
        + ", ".join(names[w] for w in selected)
        + (" selected for fix." if is_rework else " running in parallel."),
        "WORKERS_RUNNING"
    )
    log(
        "SUPERVISOR",
        "TARGETED_REWORK" if is_rework else "FAN_OUT_DISPATCH",
        state["supervisor_msg"],
        run_id=parent_run_id,
        parent=state["workflow_run_id"],
    )
    push_state()
    await asyncio.sleep(0.4)

    await asyncio.gather(*(workers[w]() for w in selected))

    _supervisor_set("Targeted fix complete. Artifacts merged for HITL." if is_rework else "Fan-in complete. Worker artifacts merged for HITL.", "SUPERVISOR_FAN_IN")
    log(
        "SUPERVISOR",
        "FAN_IN_COMPLETE",
        state["supervisor_msg"],
        run_id=parent_run_id,
        parent=state["workflow_run_id"],
    )
    push_state()

async def enter_hitl_gate():
    state["workflow_state"] = "HITL_REVIEW"
    state["status"]         = "WAITING_GATE"
    state["current_gate"]   = {
        "id": 1,
        "label": "HITL  Final Human Review",
        "phase": "All Agents",
        "risk": state["risk_level"] == "HIGH",
        "qa_blocker": state["qa_has_blocker"],
    }
    _supervisor_set("All workers complete. Awaiting HITL decision.")
    log("SUPERVISOR", "HITL_GATE_OPEN",
        f"Submitting to HITL. Risk={state['risk_level']}. "
        f"QA blockers={'YES' if state['qa_has_blocker'] else 'none'}. "
        "Human review required before release.")
    push_state()

def _determine_fix_target(feedback: str) -> str:
    """Supervisor keyword-routing: which worker needs to fix.
    Uses whole-word checks to avoid false substring matches (e.g. 'report'  'po').
    """
    import re
    f = feedback.lower()
    explicit = {
        "po": ["po", "product owner", "prd", "requirement", "requirements", "acceptance criteria", "user story", "user stories", "scope"],
        "ux": ["ux", "ui", "design", "wireframe", "user flow", "screen", "layout", "mockup", "figma", "mobile safari", "button not visible", "login page"],
        "dev": ["dev", "code", "implement", "css", "api", "backend", "frontend", "auth", "migration", "timeout", "performance", "service"],
        "qa": ["qa", "test", "tests", "quality", "coverage", "test case", "test cases", "qa report", "retest"],
    }

    # Known demo bugs point at the agent that owns the root cause.
    if "bug-001" in f:
        return "ux"
    if "bug-002" in f:
        return "dev"

    def has_phrase(words):
        return any(w in f for w in words)

    def has_word(words):
        return any(re.search(r'\b' + re.escape(w) + r'\b', f) for w in words)

    if has_phrase(explicit["po"]):
        return "po"
    if has_phrase(explicit["ux"]):
        return "ux"
    if has_phrase(explicit["dev"]):
        return "dev"
    if has_word(explicit["qa"]) or "tc-" in f:
        return "qa"

    # If the reviewer says only "bug/blocker/fail", ask QA to triage the failing evidence.
    if has_word(["bug", "blocker", "fail", "failed"]):
        return "qa"
    return "qa"

def _apply_targeted_fix_outcome(target: str):
    if target == "qa":
        state["qa_bugs"] = []
        state["qa_has_blocker"] = False
        return

    resolved_by_target = {
        "ux": {"BUG-001"},
        "dev": {"BUG-002"},
        "po": set(),
    }
    resolved = resolved_by_target.get(target, set())
    if resolved:
        state["qa_bugs"] = [bug for bug in state["qa_bugs"] if bug.get("id") not in resolved]
        state["qa_has_blocker"] = any(
            bug.get("severity") == "BLOCKER" for bug in state["qa_bugs"]
        )

async def supervisor_handle_feedback(feedback: str):
    """Supervisor receives HITL feedback  routes targeted worker to fix  back to HITL."""
    state["current_gate"]  = None
    state["rework_count"] += 1

    target = _determine_fix_target(feedback)
    names  = {"po": "PO Agent", "ux": "UI/UX Agent", "dev": "DEV Agent", "qa": "QA Agent"}

    _supervisor_set(
        f"HITL feedback received. Analyzing  routing fix to {names[target]}.",
        "SUPERVISOR_REWORK"
    )
    log("SUPERVISOR", "FEEDBACK_ANALYSIS",
        f"Feedback: '{feedback[:120]}'  Target: {names[target]}. "
        f"Rework cycle #{state['rework_count']}.")
    push_state()
    await asyncio.sleep(1.5)

    # Run only the worker selected by Supervisor.
    await _supervisor_route_workers(is_rework=True, start_from=target)
    _apply_targeted_fix_outcome(target)

    _supervisor_set("Rework complete. Re-submitting to HITL for review.")
    log("SUPERVISOR", "REWORK_COMPLETE", state["supervisor_msg"])
    push_state()
    await asyncio.sleep(0.5)
    await enter_hitl_gate()

#  HITL gate decision 
async def hitl_decision(decision: str, comment: str):
    gate = state["current_gate"]
    if not gate:
        return

    log("HUMAN_USER", f"HITL_{decision.upper()}", comment or f"Human decision: {decision}")
    state["approvals"].append({"gate": gate["id"], "decision": decision,
                               "comment": comment, "ts": ts()})

    if decision == "approve":
        state["workflow_state"] = "READY"
        state["status"]         = "DONE"
        state["current_gate"]   = None
        _supervisor_set(" Feature APPROVED by HITL. Workflow complete.")
        log("SUPERVISOR", "WORKFLOW_RELEASED",
            " Feature RELEASED  all agents passed HITL review.")
        push_state()

    elif decision == "hold":
        state["workflow_state"] = "HOLD"
        state["status"]         = "DONE"
        state["current_gate"]   = None
        _supervisor_set(" Feature placed on HOLD by HITL reviewer.")
        log("SUPERVISOR", "WORKFLOW_HOLD", state["supervisor_msg"])
        push_state()

    elif decision in ("reject", "request_changes"):
        asyncio.create_task(supervisor_handle_feedback(comment or "Rework needed."))

#  Workflow entry point 
async def run_workflow():
    run_id = f"WR-{datetime.now().strftime('%H%M%S')}"
    state.update({
        "workflow_run_id": run_id, "fanout_count": 0,
        "status": "RUNNING", "workflow_state": "DRAFT", "agent_progress": 0,
        "started_at": ts(), "audit": [], "artifacts": {},
        "approvals": [], "rework_count": 0, "supervisor_msg": "",
        "risk_level": "LOW", "risk_files": [],
        "qa_run_count": 0, "qa_has_blocker": False, "qa_bugs": [],
        "current_gate": None,
        "worker_status": {"po": "idle", "ux": "idle", "dev": "idle", "qa": "idle"},
        "worker_progress": {"po": 0, "ux": 0, "dev": 0, "qa": 0},
        "worker_stage": {"po": "", "ux": "", "dev": "", "qa": ""},
        "worker_steps": AGENT_STAGES,
        "worker_stage_details": AGENT_STAGE_DETAILS,
        "worker_runs": {"po": None, "ux": None, "dev": None, "qa": None},
    })

    # Load intake artifacts
    for key, path, label, phase in [
        ("feature_request", "feature-request.json", "Feature Request", "INTAKE"),
        ("project_context",  "project-context.json", "Project Context",  "INTAKE"),
    ]:
        state["artifacts"][key] = {"label": label, "content": read_mock(path),
                                   "path": path, "phase": phase}
        broadcast({"type": "artifact", "key": key, "label": label, "phase": phase})

    # Supervisor initialises
    _supervisor_set(f"Workflow run {run_id} initialised. Validating intent", "SUPERVISOR_INIT")
    log("HUMAN_USER",  "CREATE_FEATURE_REQUEST", "Feature request created: Google Login", "feature_request")
    push_state()
    await asyncio.sleep(0.5)
    log("SUPERVISOR", "INTENT_VALIDATED", "Intent validated. Clarity: HIGH. Planning parallel worker fan-out.")
    await asyncio.sleep(0.5)
    log("SUPERVISOR", "PLAN_PARALLEL_WORKERS", "Execution plan: Supervisor fan-out to PO/UX/DEV/QA workers in parallel, then fan-in to HITL")
    push_state()
    await asyncio.sleep(0.6)

    # Dispatch all workers in parallel
    await _supervisor_route_workers(is_rework=False, start_from="po")

    # Final artifacts
    for key, path, label in [
        ("final_review_packet", "final/final_review_packet.md", "Final Review Packet"),
        ("audit_trail_file",    "final/audit_trail.json",       "Audit Trail (Preloaded)"),
    ]:
        state["artifacts"][key] = {"label": label, "content": read_mock(path),
                                   "path": path, "phase": "FINAL"}
        broadcast({"type": "artifact", "key": key, "label": label, "phase": "FINAL"})

    await enter_hitl_gate()

#  Static / HTML 
@app.get("/", response_class=HTMLResponse)
def root():
    f = STATIC / "index.html"
    return HTMLResponse(f.read_text(encoding="utf-8") if f.exists() else "<h1>index.html not found</h1>")

#  Pipeline API 
@app.get("/api/state")
def api_state():
    return get_public_state()

@app.get("/api/artifacts")
def api_artifacts():
    return {k: {"label": v["label"], "phase": v["phase"]} for k, v in state["artifacts"].items()}

@app.get("/api/artifact/{key}")
def api_artifact(key: str):
    a = state["artifacts"].get(key)
    return a if a else {"error": "not found"}

@app.get("/api/audit")
def api_audit():
    return state["audit"]

@app.get("/api/audit/export.json")
def export_json():
    payload = {
        "exported_at":     datetime.now().isoformat(),
        "workflow_run_id": state["workflow_run_id"],
        "feature":         "Google Login (FR-001)",
        "total_events":    len(state["audit"]),
        "rework_cycles":   state["rework_count"],
        "final_status":    state["workflow_state"],
        "approvals":       state["approvals"],
        "events":          state["audit"],
    }
    return Response(
        content=json.dumps(payload, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=audit_trail_{state['workflow_run_id']}.json"},
    )

@app.get("/api/audit/export.csv")
def export_csv():
    rows = ["id,workflow_run_id,parent,run_id,worker,timestamp,actor,action,artifact,workflow_state,note"]
    for e in state["audit"]:
        note = (e.get("note") or "").replace('"', "'").replace("\n", " ")
        rows.append(
            f'"{e["id"]}","{e.get("workflow_run_id","")}","{e.get("parent","")}",'
            f'"{e.get("run_id","")}","{e.get("worker","")}","{e["ts"]}",'
            f'"{e["actor"]}","{e["action"]}","{e.get("artifact","")}",'
            f'"{e["state"]}","{note}"'
        )
    return Response(
        content="\n".join(rows),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_trail_{state['workflow_run_id']}.csv"},
    )

class StartReq(BaseModel):
    reset: bool = True

@app.post("/api/start")
async def api_start(req: StartReq):
    asyncio.create_task(run_workflow())
    return {"ok": True}

class ApprovalReq(BaseModel):
    decision: str
    comment:  str = ""

@app.post("/api/approve")
async def api_approve(req: ApprovalReq):
    """HITL decision: approve | reject | request_changes | hold"""
    asyncio.create_task(hitl_decision(req.decision, req.comment))
    return {"ok": True}

#  Auth 
class LoginReq(BaseModel):
    email:    str
    password: str

@app.post("/api/auth/login")
def api_login(req: LoginReq):
    email = req.email.lower().strip()
    user  = MOCK_USERS.get(email)
    if not user or user["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = f"demo-{user['id']}-{int(datetime.now().timestamp())}"
    sessions[token] = user
    return {
        "token": token,
        "user":  {k: user[k] for k in ("id", "name", "email", "role", "avatar")},
    }

@app.post("/api/auth/logout")
def api_logout(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    sessions.pop(token, None)
    return {"ok": True}

@app.get("/api/auth/me")
def api_me(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user  = sessions.get(token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {k: user[k] for k in ("id", "name", "email", "role", "avatar")}

#  Admin helpers 
def require_admin(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    user  = sessions.get(token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

#  Admin 
@app.get("/api/admin/stats")
def api_admin_stats(request: Request):
    require_admin(request)
    return {
        "total_users":     len(MOCK_USERS),
        "active_projects": 12,
        "total_workflows": 47,
        "success_rate":    94.2,
        "avg_cycle_time":  "2.3h",
        "gate_approvals":  156,
        "rework_rate":     "18%",
    }

@app.get("/api/admin/users")
def api_admin_users(request: Request):
    require_admin(request)
    return [
        {"id": u["id"], "name": u["name"], "email": e,
         "role": u["role"], "avatar": u["avatar"],
         "projects": u["projects"], "workflows": u["workflows"], "status": "active"}
        for e, u in MOCK_USERS.items()
    ]

@app.get("/api/admin/activity")
def api_admin_activity(request: Request):
    require_admin(request)
    return [
        {"id": "WR-042", "feature": "Google Login",         "status": "READY",      "rework": 2, "duration": "3.2h", "user": "Alex Developer"},
        {"id": "WR-041", "feature": "Dark Mode Toggle",     "status": "HOLD",       "rework": 1, "duration": "1.8h", "user": "Sam Reviewer"},
        {"id": "WR-040", "feature": "2FA Enroll Screen",    "status": "DEV_REVIEW", "rework": 0, "duration": "2.1h", "user": "Alex Developer"},
        {"id": "WR-039", "feature": "Profile Photo Upload", "status": "READY",      "rework": 1, "duration": "1.5h", "user": "Alex Developer"},
        {"id": "WR-038", "feature": "Push Notifications",   "status": "QA_REVIEW",  "rework": 0, "duration": "4.0h", "user": "Sam Reviewer"},
    ]

#  SSE 
async def event_generator(request: Request) -> AsyncGenerator[str, None]:
    q: asyncio.Queue = asyncio.Queue(maxsize=120)
    subscribers.append(q)
    yield f"data: {json.dumps({'type': 'state', 'data': get_public_state()})}\n\n"
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                msg = await asyncio.wait_for(q.get(), timeout=20.0)
                yield f"data: {msg}\n\n"
            except asyncio.TimeoutError:
                yield ": ping\n\n"
    finally:
        if q in subscribers:
            subscribers.remove(q)

@app.get("/api/stream")
async def api_stream(request: Request):
    return StreamingResponse(
        event_generator(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
