from pathlib import Path

from ..config import DEFAULT_DETAILED_MIN_TOKENS, get_settings

_PROMPTS = Path(__file__).resolve().parent


def _load_prompt(name: str) -> str:
    return (_PROMPTS / name).read_text(encoding="utf-8").strip()


REVIEW_SYSTEM_PROMPT = _load_prompt("review_system.txt")
REVIEW_USER_PROMPT_TEMPLATE = _load_prompt("review_user.txt")
REVIEW_USER_PROMPT_DETAILED = _load_prompt("review_user_detailed.txt")
# Medium and standard token budgets ask for 3-4 sentence metric writeups.
# Short stays on the compact template so all three metrics still fit.
REVIEW_DETAILED_MIN_TOKENS = DEFAULT_DETAILED_MIN_TOKENS


def create_review_prompt(
    language: str, code: str, max_tokens: int | None = None
) -> str:
    detailed_min_tokens = get_settings().detailed_min_tokens
    template = (
        REVIEW_USER_PROMPT_DETAILED
        if max_tokens is not None and max_tokens >= detailed_min_tokens
        else REVIEW_USER_PROMPT_TEMPLATE
    )
    return f"{template.replace('{language}', language)}\n\n{code}"
