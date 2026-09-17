from pathlib import Path

_PROMPTS = Path(__file__).resolve().parent


def _load_prompt(name: str) -> str:
    return (_PROMPTS / name).read_text(encoding="utf-8").strip()


REVIEW_SYSTEM_PROMPT = _load_prompt("review_system.txt")
REVIEW_USER_PROMPT_TEMPLATE = _load_prompt("review_user.txt")
REVIEW_USER_PROMPT_DETAILED = _load_prompt("review_user_detailed.txt")
# Keep in sync with frontend VITE_REVIEW_TOKEN_MEDIUM / detailed min tokens.
REVIEW_DETAILED_MIN_TOKENS = 384


def create_review_prompt(
    language: str, code: str, max_tokens: int | None = None
) -> str:
    template = (
        REVIEW_USER_PROMPT_DETAILED
        if max_tokens is not None and max_tokens >= REVIEW_DETAILED_MIN_TOKENS
        else REVIEW_USER_PROMPT_TEMPLATE
    )
    return f"{template.replace('{language}', language)}\n\n{code}"
