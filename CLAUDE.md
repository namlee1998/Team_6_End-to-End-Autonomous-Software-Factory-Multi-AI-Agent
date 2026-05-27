# AI Guidelines (Claude / Cursor / Gemini)

When interacting with this repository, AI Coding Assistants MUST follow these strict rules:

1. **Do NOT break SSE Streaming**: The `stream_` functions in Python Agents rely on `astream_events` to pipe tokens to the UI. Do not aggressively refactor these to use OpenAI Function Calling (`with_structured_output`) unless you have specifically handled the JSON Delta reconstruction for streaming.
2. **Respect the Hybrid Router**: The `_get_llm(model_config)` function signature is mandatory. Do not revert it to `model=None`.
3. **Frontend UI Overlaps**: When modifying `sdlc.css`, be extremely careful with CSS Grid vs Flexbox. The `sdlc-pipeline` uses Flexbox to prevent connector arrows and phase cards from wrapping onto multiple lines.
4. **Auth Mocking**: Never hardcode production credentials. If you mock Auth for testing, ensure it is properly reverted or documented.
5. **No Legacy Agents**: `agent_1`, `agent_2`, and `agent_3` are strictly forbidden and have been deleted. Do not attempt to import them into `main_pipeline.py`.
