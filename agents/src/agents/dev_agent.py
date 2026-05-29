"""
DEV Agent - Implementation Plan, Code Patch, Changed Files, Risk Assessment.
"""
from __future__ import annotations
import json, logging, os, re
from typing import Any
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from src.schemas.aidlc import DEVAgentInput, DEVAgentOutput, ChangedFile

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior software engineer implementing a feature request.
Given a PRD, UX Spec, and an existing Architecture Ledger, produce:
1. architecture_ledger_update — A concise summary of architectural changes introduced by this implementation (e.g. new tables, new core functions, new dependencies).
2. implementation_plan — Step-by-step markdown plan
3. mock_code_diff — A unified git diff compatible with `git apply --check`. Keep this legacy key name, but the content MUST be a real unified diff beginning with `diff --git`.
4. changed_files — Array of {path, reason, change_type: add/modify/delete}
5. risk_assessment — Markdown risk analysis (LOW/MEDIUM/HIGH + factors + mitigation)
6. risk_level — "LOW" | "MEDIUM" | "HIGH". Rule: auth/DB/security/payment → HIGH
Output ONLY valid JSON: {architecture_ledger_update, implementation_plan, mock_code_diff, changed_files, risk_assessment, risk_level, summary}"""

def _get_llm(model_config=None):
    if model_config is None:
        model_config = {}
        
    model_name = model_config.get("model") or os.getenv("DEFAULT_MODEL", "deepseek-v4-pro")
    temp = model_config.get("temperature", 0.0)
    max_tokens = model_config.get("max_tokens", 8192)
    thinking = model_config.get("thinking", True)
    
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
    except: return {"architecture_ledger_update": "", "implementation_plan": raw, "mock_code_diff": "", "changed_files": [], "risk_assessment": "", "risk_level": "MEDIUM", "summary": ""}

async def run_dev_agent(input_data: DEVAgentInput, model_config=None, trace_context=None) -> DEVAgentOutput:
    llm = _get_llm(model_config)
    pc = input_data.project_context
    content = f"PRD:\n{input_data.prd}\n\nUX Spec:\n{input_data.ux_spec}\n\nUser Flow:\n{input_data.user_flow}\n\n"
    if input_data.acceptance_criteria:
        content += "AC:\n" + "\n".join(f"- {a}" for a in input_data.acceptance_criteria) + "\n\n"
    content += f"Tech: {json.dumps(pc.tech_stack)}\n\n"
    if input_data.architecture_ledger:
        content += f"Architecture Ledger:\n{input_data.architecture_ledger}\n\n"
    if input_data.feedback_prompt:
        content = f"<human_feedback>\n{input_data.feedback_prompt}\n</human_feedback>\n\n{content}"
    cfg = trace_context.langchain_config("dev_agent") if trace_context else None
    resp = await llm.ainvoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=content)],
                              **({"config": cfg} if cfg else {}))
    p = _parse(resp.content)
    files = [ChangedFile(**f) if isinstance(f, dict) else f for f in p.get("changed_files", [])]
    return DEVAgentOutput(architecture_ledger_update=p.get("architecture_ledger_update",""),
                          implementation_plan=p.get("implementation_plan",""),
                          mock_code_diff=p.get("mock_code_diff",""), changed_files=files,
                          risk_assessment=p.get("risk_assessment",""), risk_level=p.get("risk_level","LOW"),
                          sandbox_report=p.get("sandbox_report",""), patch_branch=p.get("patch_branch",""),
                          patch_commit=p.get("patch_commit",""),
                          summary=p.get("summary","DEV Agent completed"))

async def stream_dev_agent(input_data: DEVAgentInput, model_config=None, trace_context=None):
    from src.tools.sandbox import run_sandbox_test
    
    llm = _get_llm(model_config)
    cfg = trace_context.langchain_config("dev_agent") if trace_context else None

    # Base content
    base_content = f"PRD:\n{input_data.prd}\n\nUX Spec:\n{input_data.ux_spec}\n"
    if input_data.architecture_ledger:
        base_content += f"\nArchitecture Ledger:\n{input_data.architecture_ledger}\n"
    if input_data.feedback_prompt:
        base_content = f"<human_feedback>\n{input_data.feedback_prompt}\n</human_feedback>\n\n{base_content}"
        
    retries = 0
    max_retries = 2
    
    while retries <= max_retries:
        content = base_content
        if retries > 0:
            yield {"event": "progress", "data": {"step": "sandbox_gate", "token": f"\n\n🔄 Sandbox execution failed. Retrying (Attempt {retries}/{max_retries})...\n\n"}}
            
        msgs = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=content)]
        full, tin, tout = "", 0, 0
        
        if hasattr(llm, "astream_events"):
            async for ev in llm.astream_events(msgs, version="v2", **({"config": cfg} if cfg else {})):
                if ev["event"] == "on_chat_model_stream" and ev["data"]["chunk"].content:
                    full += ev["data"]["chunk"].content
                    yield {"event":"progress","data":{"step":"dev_agent","token":ev["data"]["chunk"].content}}
                elif ev["event"] == "on_chat_model_end":
                    u = getattr(ev["data"].get("output"),"usage_metadata",None)
                    if u: tin += u.get("input_tokens",0); tout += u.get("output_tokens",0)
        else:
            async for chunk in llm.astream(msgs):
                if chunk.content: full += chunk.content; yield {"event":"progress","data":{"step":"dev_agent","token":chunk.content}}
        
        parsed = _parse(full)
        
        report = run_sandbox_test(
            parsed.get("implementation_plan", ""),
            parsed.get("mock_code_diff", ""),
            session_id=getattr(trace_context, "session_id", None),
        )
        parsed["sandbox_report"] = report.get("report", "")
        if report.get("patch_branch"):
            parsed["patch_branch"] = report["patch_branch"]
        if report.get("patch_commit"):
            parsed["patch_commit"] = report["patch_commit"]
        
        if report["success"]:
            yield {"event": "progress", "data": {"step": "sandbox_gate", "token": f"\n\n{report['report']}\n"}}
            yield {"event":"completed","data":{**parsed,"token_usage":{"input":tin,"output":tout}}}
            return
            
        # Sandbox failed
        yield {"event": "progress", "data": {"step": "sandbox_gate", "token": f"\n\n{report['report']}\n"}}
        base_content += f"\n\n[SYSTEM] Sandbox execution failed. Error:\n{report['report']}\nPlease fix your unified git diff."
        retries += 1
        
    # If we reached here, max retries exceeded
    yield {"event": "progress", "data": {"step": "sandbox_gate", "token": f"\n\n⚠️ Max retries ({max_retries}) reached. Sandbox still failing. Proceeding to QA Gate for manual review.\n"}}
    yield {"event":"completed","data":{**parsed,"token_usage":{"input":tin,"output":tout}}}
