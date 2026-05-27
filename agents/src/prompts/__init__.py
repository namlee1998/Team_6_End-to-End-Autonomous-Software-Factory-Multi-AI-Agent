"""
Prompt loader — reads system prompt .txt files at import time.
All AI prompt strings live here as file references for easy tuning.
"""

import os

_PROMPTS_DIR = os.path.dirname(__file__)


def _load_prompt(filename: str) -> str:
    """Load a prompt file from the prompts/ directory."""
    path = os.path.join(_PROMPTS_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


# System prompts loaded from files
AGENT_1_EXTRACTION = _load_prompt("agent_1.txt")
AGENT_1_UI_CONTEXT = _load_prompt("agent_1_ui_context.txt")
AGENT_2_SCENARIOS = _load_prompt("agent_2.txt")
AGENT_3_AUTOMATION = _load_prompt("agent_3.txt")
