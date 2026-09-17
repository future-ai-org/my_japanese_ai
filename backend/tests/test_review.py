from app.prompts import (
    REVIEW_DETAILED_MIN_TOKENS,
    REVIEW_SYSTEM_PROMPT,
    create_review_prompt,
)


def test_system_prompt_matches_browser_contract():
    assert "Return only JSON" in REVIEW_SYSTEM_PROMPT
    assert "Do not claim to reveal" in REVIEW_SYSTEM_PROMPT
    assert "translation must be the full Japanese rendering" in REVIEW_SYSTEM_PROMPT
    assert "never a copy of the source" in REVIEW_SYSTEM_PROMPT
    assert "Put that Japanese text in translation first" in REVIEW_SYSTEM_PROMPT
    assert "Do not score" in REVIEW_SYSTEM_PROMPT
    assert "exactly three short paragraphs" in REVIEW_SYSTEM_PROMPT
    assert "separated by the marker |||" in REVIEW_SYSTEM_PROMPT
    assert "Lesson language is English" in REVIEW_SYSTEM_PROMPT
    assert 'Example: translation "来週の打ち合わせを確認いたします。"' in (
        REVIEW_SYSTEM_PROMPT
    )
    assert "Never write full Japanese sentences as the lesson body" in (
        REVIEW_SYSTEM_PROMPT
    )


def test_create_review_prompt_matches_browser_contract():
    prompt = create_review_prompt("polite", "Please reply soon.", 256)
    assert prompt.endswith("\n\nPlease reply soon.")
    assert "Translate this English text into polite-register Japanese" in prompt
    assert "keys in this order: translation, lesson" in prompt
    assert "do not copy the English source into translation" in prompt
    assert "exactly three short English paragraphs" in prompt
    assert "separated by the marker |||" in prompt
    assert "Write the lesson in English for learners" in prompt
    assert "exactly three English teaching paragraphs" not in prompt


def test_create_review_prompt_uses_detailed_template_at_medium_budget():
    prompt = create_review_prompt(
        "polite", "Please reply soon.", REVIEW_DETAILED_MIN_TOKENS
    )
    assert "Translate this English text into polite-register Japanese" in prompt
    assert "do not copy the English source into translation" in prompt
    assert "exactly three English teaching paragraphs" in prompt
    assert "separated by the marker |||" in prompt
    assert "keys in this order: translation, lesson" in prompt
    assert "exactly three short English paragraphs" not in prompt
