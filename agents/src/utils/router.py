"""
Category Router
Dynamically routes to the appropriate LLM based on token count.
"""
import logging
import os

logger = logging.getLogger(__name__)

# Try to import tiktoken, fallback to approximation
try:
    import tiktoken
    HAS_TIKTOKEN = True
except ImportError:
    HAS_TIKTOKEN = False

def count_tokens(text: str) -> int:
    """Count tokens in text."""
    if not text:
        return 0
        
    if HAS_TIKTOKEN:
        try:
            # Use o200k_base or cl100k_base
            enc = tiktoken.get_encoding("o200k_base")
            return len(enc.encode(text))
        except Exception:
            return len(text) // 4
    else:
        # Fallback approximation (1 token ~= 4 chars)
        return len(text) // 4

def route_model_by_tokens(context_text: str) -> str:
    """
    Route to the appropriate model based on token count.
    < 8000 tokens: gpt-4o-mini
    > 8000 tokens: claude-3-5-sonnet-20240620 (or gpt-4o if not configured)
    """
    tokens = count_tokens(context_text)
    
    if tokens < 8000:
        logger.info(f"[CategoryRouter] Tokens: {tokens}. Routing to QUICK model: gpt-4o-mini")
        return "gpt-4o-mini"
    else:
        # Check if Claude is specifically requested or if we should use gpt-4o
        # For LangChain ChatOpenAI, to use Claude we'd need ChatAnthropic.
        # But since the current code uses ChatOpenAI, we will route to gpt-4o 
        # (which is the OpenAI high-context model) by default to avoid breaking imports,
        # unless OPENAI_API_BASE points to a router that supports claude via openai interface (like Litellm).
        
        # We will assume litellm or standard OpenAI is used.
        target_model = os.getenv("ULTRABRAIN_MODEL", "gpt-4o")
        logger.info(f"[CategoryRouter] Tokens: {tokens} (>8k). Routing to ULTRABRAIN model: {target_model}")
        return target_model
