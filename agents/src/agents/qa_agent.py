"""
QA Agent — Test Cases, QA Report, AC Coverage Matrix from all upstream artifacts.
"""
from __future__ import annotations
import json, logging, os, re
from typing import Any
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from src.schemas.aidlc import QAAgentInput, QAAgentOutput, QATestCase, ACCoverageRow

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior QA Engineer generating test cases from acceptance criteria.
Given PRD, AC list, UX Spec, Implementation Plan, Code Diff and Risk Assessment, produce:
1. test_cases — Array. Each: {id:"TC-001", source_ac, title, type, priority, precondition, steps:[], expected_result, status:"Not Run"}
   - Every AC must have at least 1 test case
   - Include happy path, negative, and edge cases for HIGH priority features
2. qa_report — Markdown QA report with: summary, pass/fail counts, blocker list, recommendation
3. ac_coverage_matrix — Array. Each: {ac, test_case_ids:[], covered:true/false}
4. pass_count, fail_count, blocker_count (integers, use 0 for initial run)
5. release_recommendation — "PASS" | "HOLD" | "REWORK"
Output ONLY valid JSON: {test_cases, qa_report, ac_coverage_matrix, pass_count, fail_count, blocker_count, release_recommendation, summary}"""

def _get_llm(model_config=None):
    if model_config is None:
        model_config = {}
        
    model_name = model_config.get("model") or os.getenv("DEFAULT_MODEL", "deepseek-v4-pro")
    temp = model_config.get("temperature", 0.1)
    max_tokens = model_config.get("max_tokens", 8192)
    thinking = model_config.get("thinking", False)
    
    kwargs = {
        "model": model_name,
        "temperature": temp,
        "max_tokens": max_tokens,
        "api_key": os.getenv("OPENAI_API_KEY", ""),
        "base_url": os.getenv("OPENAI_API_BASE") or None
    }
    
    if thinking:
        kwargs["model_kwargs"] = {"extra_body": {"thinking": True}}
        
    return ChatOpenAI(**kwargs)

def _parse(raw):
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence: text = fence.group(1).strip()
    try: return json.loads(text)
    except: return {"test_cases":[], "qa_report": raw, "ac_coverage_matrix":[], "pass_count":0,
                    "fail_count":0, "blocker_count":0, "release_recommendation":"HOLD", "summary":""}

async def run_qa_agent(input_data: QAAgentInput, model_config=None, trace_context=None) -> QAAgentOutput:
    llm = _get_llm(model_config)
    content = ""
    if input_data.acceptance_criteria:
        content += "Acceptance Criteria:\n" + "\n".join(f"- {a}" for a in input_data.acceptance_criteria) + "\n\n"
    if input_data.prd: content += f"PRD Summary:\n{input_data.prd[:3000]}\n\n"
    if input_data.ux_spec: content += f"UX Spec (summary):\n{input_data.ux_spec[:2000]}\n\n"
    if input_data.implementation_plan: content += f"Implementation Plan:\n{input_data.implementation_plan[:2000]}\n\n"
    if input_data.sandbox_report: content += f"Sandbox Report:\n{input_data.sandbox_report[:2000]}\n\n"
    if input_data.risk_assessment: content += f"Risk: {input_data.risk_level}\n{input_data.risk_assessment[:1000]}\n\n"
    if input_data.feedback_prompt:
        content = f"<human_feedback>\n{input_data.feedback_prompt}\n</human_feedback>\n\n{content}"
    cfg = trace_context.langchain_config("qa_agent") if trace_context else None
    resp = await llm.ainvoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=content)],
                              **({"config": cfg} if cfg else {}))
    p = _parse(resp.content)
    test_cases = [QATestCase(**t) if isinstance(t, dict) else t for t in p.get("test_cases", [])]
    matrix = [ACCoverageRow(**r) if isinstance(r, dict) else r for r in p.get("ac_coverage_matrix", [])]
    return QAAgentOutput(test_cases=test_cases, qa_report=p.get("qa_report",""),
                         ac_coverage_matrix=matrix, pass_count=p.get("pass_count",0),
                         fail_count=p.get("fail_count",0), blocker_count=p.get("blocker_count",0),
                         release_recommendation=p.get("release_recommendation","HOLD"),
                         summary=p.get("summary","QA Agent completed"))

async def stream_qa_agent(input_data: QAAgentInput, model_config=None, trace_context=None):
    llm = _get_llm(model_config)
    content = ""
    if input_data.acceptance_criteria:
        content += "AC:\n" + "\n".join(f"- {a}" for a in input_data.acceptance_criteria) + "\n\n"
    if input_data.prd: content += f"PRD:\n{input_data.prd[:2000]}\n\n"
    if input_data.ux_spec: content += f"UX Spec:\n{input_data.ux_spec[:1500]}\n\n"
    if input_data.implementation_plan: content += f"Plan:\n{input_data.implementation_plan[:1500]}\n\n"
    if input_data.sandbox_report: content += f"Sandbox:\n{input_data.sandbox_report[:1500]}\n\n"
    if input_data.feedback_prompt:
        content = f"<human_feedback>\n{input_data.feedback_prompt}\n</human_feedback>\n\n{content}"
    cfg = trace_context.langchain_config("qa_agent") if trace_context else None
    msgs = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=content)]
    full, tin, tout = "", 0, 0
    if hasattr(llm, "astream_events"):
        async for ev in llm.astream_events(msgs, version="v2", **({"config": cfg} if cfg else {})):
            if ev["event"] == "on_chat_model_stream" and ev["data"]["chunk"].content:
                full += ev["data"]["chunk"].content
                yield {"event":"progress","data":{"step":"qa_agent","token":ev["data"]["chunk"].content}}
            elif ev["event"] == "on_chat_model_end":
                u = getattr(ev["data"].get("output"),"usage_metadata",None)
                if u: tin += u.get("input_tokens",0); tout += u.get("output_tokens",0)
    else:
        async for chunk in llm.astream(msgs):
            if chunk.content: full += chunk.content; yield {"event":"progress","data":{"step":"qa_agent","token":chunk.content}}
    yield {"event":"completed","data":{**_parse(full),"token_usage":{"input":tin,"output":tout}}}
