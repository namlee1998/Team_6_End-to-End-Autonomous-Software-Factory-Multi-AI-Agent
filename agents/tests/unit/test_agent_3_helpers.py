from __future__ import annotations

from src.agents.agent_3 import _extract_text, _parse_json


def test_extract_text_skips_thinking_blocks():
    content = [
        {"type": "thinking", "text": "hidden"},
        {"type": "text", "text": "{\"yaml_files\": []}"},
    ]

    assert _extract_text(content) == "{\"yaml_files\": []}"


def test_parse_json_accepts_fenced_payload():
    payload = """
The result is below:
```json
{"yaml_files": [{"filename": "demo.yaml", "content": "name: demo"}]}
```
""".strip()

    parsed = _parse_json(payload)

    assert parsed["yaml_files"][0]["filename"] == "demo.yaml"
