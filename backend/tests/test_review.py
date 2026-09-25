import json
from pathlib import Path

import pytest

from app.config import DEFAULT_MAX_FINDINGS, DEFAULT_TEMPERATURE
from app.prompts import (
    REVIEW_DETAILED_MIN_TOKENS,
    REVIEW_SYSTEM_PROMPT,
    create_review_prompt,
)
from app.review import (
    _coerce_text,
    coerce_review_payload,
    normalize_review_result,
    parse_huggingface_review,
    parse_review_json,
)

INFERENCE = {
    "provider": "modal",
    "modelId": "test-model",
    "startedAt": "2026-01-01T00:00:00.000Z",
    "completedAt": "2026-01-01T00:00:01.000Z",
    "systemPrompt": "system",
    "userPrompt": "user",
    "responseSchema": {},
    "generationConfig": {
        "temperature": DEFAULT_TEMPERATURE,
        "maxTokens": 256,
        "maxFindings": DEFAULT_MAX_FINDINGS,
    },
    "finishReason": "stop",
    "rawOutput": "{}",
    "logs": [],
}


def normalize(payload, **overrides):
    options = {
        "line_count": 1,
        "duration_ms": 1,
        "max_findings": DEFAULT_MAX_FINDINGS,
        "inference": INFERENCE,
        "create_id": lambda: "id",
    }
    options.update(overrides)
    return normalize_review_result(payload, **options)


def test_parse_review_json_accepts_fences_and_surrounding_text():
    payload = {"score": 1, "summary": "ok"}
    encoded = json.dumps(payload)
    assert parse_review_json(encoded) == payload
    assert parse_review_json(f"```json\n{encoded}\n```") == payload
    assert parse_review_json(f"以下が結果です。\n{encoded}\n以上。") == payload


def test_parse_review_json_skips_earlier_non_review_objects():
    review = {"score": 70, "summary": "Needs timeouts and error handling."}
    text = 'return {"name": data["name"], "email": data["email"]}\n' + json.dumps(
        review
    )
    assert parse_review_json(text) == review


def test_parse_review_json_rejects_non_objects():
    with pytest.raises(json.JSONDecodeError):
        parse_review_json("not-json")
    with pytest.raises(json.JSONDecodeError):
        parse_review_json("")


def test_coerce_review_payload_fills_missing_collections():
    assert coerce_review_payload({"score": 40, "summary": "Risky HTTP usage."}) == {
        "score": 40,
        "summary": "Risky HTTP usage.",
        "rationale": "",
        "metrics": [],
        "findings": [],
    }
    assert coerce_review_payload("not-an-object") == "not-an-object"
    assert coerce_review_payload({1: "kept", "score": 10, "summary": 1.5}) == {
        1: "kept",
        "score": 10,
        "summary": "1.5",
        "rationale": "",
        "metrics": [],
        "findings": [],
    }
    integer_summary = coerce_review_payload({"score": "1e2", "summary": 70})
    assert integer_summary["score"] == 100.0
    assert integer_summary["summary"] == "70"
    assert coerce_review_payload({"score": "approx 12", "summary": "ok"})["score"] == 12
    assert coerce_review_payload({"score": "nope", "summary": "ok"})["score"] == "nope"
    empty_ratio = coerce_review_payload({"score": " /100", "summary": "ok"})
    assert empty_ratio["score"] == " /100"
    assert _coerce_text("already text") == "already text"
    skipped = coerce_review_payload(
        {
            "score": "%",
            "summary": None,
            "metrics": [1, {"label": "Security", "score": "approx 12.5"}],
            "findings": [
                "skip",
                {
                    "severity": "low",
                    "title": "Nit",
                    "description": "Rename the helper.",
                    "suggestion": "Extract a function.",
                },
            ],
        }
    )
    assert skipped["score"] == "%"
    assert skipped["summary"] == ""
    assert skipped["metrics"] == [{"label": "Security", "score": 12.5}]
    assert skipped["findings"] == [
        {
            "severity": "suggestion",
            "title": "Nit",
            "description": "Rename the helper.",
            "line": 1,
            "suggestion": "Extract a function.",
        }
    ]


def test_parse_review_json_finds_nested_review_objects():
    review = {"score": 55, "summary": "Missing error handling."}
    assert parse_review_json(json.dumps({"review": review})) == review
    assert parse_review_json(json.dumps([{"skip": True}, review])) == review


def test_parse_review_json_keeps_non_review_objects():
    payload = {"foo": 1}
    assert parse_review_json(json.dumps(payload)) == payload
    review = {"score": 20, "summary": "Needs tests."}
    assert parse_review_json('prefix {"foo": 1} ' + json.dumps(review)) == review


def test_coerce_review_payload_accepts_unguided_model_shapes():
    coerced = coerce_review_payload(
        {
            "Score": "70/100",
            "Summary": "Requests can hang and leak credentials.",
            "reason": "No timeout or status check.",
            "metrics": [
                {"label": "Security", "score": "40"},
                {"label": "Ignored"},
            ],
            "issues": [
                {
                    "severity": "error",
                    "title": "No timeout",
                    "description": "The HTTP call can hang.",
                    "line": "8",
                },
                {"title": "Incomplete"},
            ],
        }
    )
    assert coerced["score"] == 70
    assert coerced["summary"] == "Requests can hang and leak credentials."
    assert coerced["rationale"] == "No timeout or status check."
    assert coerced["metrics"] == [{"label": "Security", "score": 40}]
    assert coerced["findings"] == [
        {
            "severity": "critical",
            "title": "No timeout",
            "description": "The HTTP call can hang.",
            "line": 8,
        }
    ]


def test_normalize_accepts_coerced_unguided_payload():
    result = normalize(
        coerce_review_payload(
            {
                "score": "40",
                "summary": "Risky HTTP usage.",
                "metrics": [{"name": "Reliability", "score": "25%"}],
                "findings": [
                    {
                        "severity": "warn",
                        "title": "No timeout",
                        "message": "The request can hang.",
                    }
                ],
            }
        )
    )
    assert result["score"] == 40
    assert result["metrics"][0]["score"] == 25
    assert result["findings"][0]["severity"] == "warning"
    assert result["findings"][0]["line"] == 1


TINYSWALLOW_HF_OUTPUT = (
    Path(__file__).with_name("tinyswallow_hf.txt").read_text(encoding="utf-8")
)
TINYSWALLOW_NAMED_LISTS_OUTPUT = (
    Path(__file__).with_name("tinyswallow_named_lists.txt").read_text(encoding="utf-8")
)


def test_coerce_review_payload_reads_metric_maps_and_named_objects():
    mapped = coerce_review_payload(
        {
            "score": 80,
            "summary": "Mixed",
            "rationale": "See metrics.",
            "metrics": {
                "Correctness": {
                    "score": 85,
                    "description": "Happy path returns the parsed integer.",
                },
                "Security": {
                    "score": 70,
                    "description": (
                        "The handler interpolates request.path into a shell."
                    ),
                },
                "Maintainability": {
                    "score": 90,
                    "description": "Helpers are named clearly.",
                },
            },
            "findings": [],
        }
    )
    assert [metric["label"] for metric in mapped["metrics"]] == [
        "Correctness",
        "Security",
        "Maintainability",
    ]
    assert mapped["metrics"][1]["description"].startswith("The handler interpolates")

    named = coerce_review_payload(
        {
            "score": 75,
            "summary": "One object",
            "rationale": "Keys",
            "metrics": [
                {
                    "Correctness": 82,
                    "description": "Returns on the happy path.",
                },
                {"Security": 40, "description": "Command injection on request.path."},
                {"Maintainability": 61},
            ],
            "findings": [],
        }
    )
    assert [metric["score"] for metric in named["metrics"]] == [82, 40, 61]
    assert named["metrics"][0]["description"] == "Returns on the happy path."


def test_parse_huggingface_review_keeps_schema_json():
    payload = {
        "score": 40,
        "summary": "Risky HTTP usage.",
        "rationale": "No timeout.",
        "metrics": [{"label": "Security", "score": 40}],
        "findings": [],
    }
    parsed = parse_huggingface_review(json.dumps(payload))
    assert parsed["score"] == 40
    assert parsed["summary"] == payload["summary"]


def test_parse_huggingface_review_fills_missing_metrics_from_rationale():
    payload = {
        "score": 82,
        "summary": "Mostly sound.",
        "rationale": """
* **Correctness (85/100):**
    * The function returns the parsed integer on the happy path.
* **Security (70/100):**
    * The handler interpolates request.path into a shell command.
* **Maintainability (90/100):**
    * Names are clear, but there are no tests.
""",
        "metrics": [
            {
                "label": "Correctness",
                "score": 85,
                "description": (
                    "The function returns the parsed integer on the happy path."
                ),
            }
        ],
        "findings": [],
    }
    parsed = parse_huggingface_review(json.dumps(payload))
    assert [metric["label"] for metric in parsed["metrics"]] == [
        "Correctness",
        "Security",
        "Maintainability",
    ]
    assert "interpolates request.path" in parsed["metrics"][1]["description"]
    assert parsed["metrics"][2]["score"] == 90
    parsed = parse_huggingface_review(TINYSWALLOW_HF_OUTPUT)
    result = normalize(parsed)
    assert result["score"] == 82
    assert [metric["label"] for metric in result["metrics"]] == [
        "Correctness",
        "Security",
        "Maintainability",
    ]
    assert [metric["score"] for metric in result["metrics"]] == [85, 70, 90]
    assert result["metrics"][0]["description"].count("\n") >= 2
    assert "does not explicitly validate" in result["metrics"][0]["description"]
    assert "security issue" in result["metrics"][1]["snippet"]
    assert result["summary"].startswith(
        "Correctness 85, Security 70, Maintainability 90."
    )
    assert result["rationale"]
    assert result["findings"]
    assert {finding["severity"] for finding in result["findings"]} <= {
        "warning",
        "suggestion",
    }


def test_parse_huggingface_review_builds_review_from_markdown_only():
    parsed = parse_huggingface_review(
        """
* ** :**
    * ignored empty label
* **Correctness (80/100):**
    * The function works. However, it does not validate input.
* **Security:**
    * missing authentication on the public endpoint.
* **Maintainability (90/100):**
    * The code lacks tests for timeout handling.
* **Mystery:**
    * no numeric score here

```python

```
"""
    )
    result = normalize(parsed)
    assert [metric["label"] for metric in result["metrics"]] == [
        "Correctness",
        "Security",
        "Maintainability",
    ]
    assert [metric["score"] for metric in result["metrics"]] == [80, 50, 90]
    assert result["score"] == 73
    assert result["summary"].startswith(
        "Correctness 80, Security 50, Maintainability 90."
    )
    assert "missing authentication" in result["summary"]
    assert "Correctness (80/100):" in result["rationale"]
    assert result["findings"][0]["severity"] == "suggestion"


def test_parse_huggingface_review_uses_known_metric_keys_and_snippets():
    parsed = parse_huggingface_review(
        json.dumps({"Reliability": 40, "Performance": 90})
        + """

* **Reliability:**

* **Performance (90/100):**
    * Fast enough for the demo.

```python
print('hello')
```
"""
    )
    result = normalize(parsed)
    assert [metric["label"] for metric in result["metrics"]] == [
        "Reliability",
        "Performance",
    ]
    assert result["metrics"][0]["snippet"] == "print('hello')"
    assert "description" not in result["metrics"][0]
    assert result["findings"] == []


def test_parse_huggingface_review_keeps_snippet_on_weakest_without_security_metric():
    parsed = parse_huggingface_review(
        """
* **Correctness (90/100):**
    * Looks correct.
* **Maintainability (40/100):**
    * Fine.

```python
# security issue: hardcoded token
secret = "token"
```
"""
    )
    result = normalize(parsed)
    assert result["metrics"][1]["label"] == "Maintainability"
    assert result["metrics"][1]["snippet"].startswith("# security issue")


def test_parse_huggingface_review_caps_caveat_findings():
    parsed = parse_huggingface_review(
        """
* **Correctness (80/100):**
    * However, input is not validated.
* **Security (70/100):**
    * However, credentials are logged.
* **Maintainability (60/100):**
    * However, the module is too large.
* **Reliability (50/100):**
    * However, retries are missing.
"""
    )
    result = normalize(parsed)
    assert [metric["label"] for metric in result["metrics"]] == [
        "Correctness",
        "Security",
        "Maintainability",
    ]
    assert len(result["findings"]) == 3


def test_parse_huggingface_review_returns_or_rejects_unusable_payloads():
    leftover = parse_huggingface_review('{"note": "not a review"}')
    assert leftover["note"] == "not a review"
    assert leftover["metrics"] == []
    with pytest.raises(json.JSONDecodeError):
        parse_huggingface_review("definitely not a review")
    skipped_unknown = parse_huggingface_review(json.dumps({"Foo": 10}))
    assert skipped_unknown["metrics"] == []
    mixed = parse_huggingface_review(
        json.dumps({"Correctness": "nope", "Security": 40, "hello": "world"})
    )
    assert mixed["metrics"] == [{"label": "Security", "score": 40}]


def test_parse_huggingface_review_recovers_named_string_lists():
    text = TINYSWALLOW_NAMED_LISTS_OUTPUT
    parsed = parse_huggingface_review(text)
    result = normalize(parsed)
    assert [metric["label"] for metric in result["metrics"]] == [
        "Correctness",
        "Security",
        "Maintainability",
    ]
    assert [metric["score"] for metric in result["metrics"]] == [50, 50, 50]
    assert result["score"] == 50
    assert "PAYMENTS_API_KEY" in result["metrics"][0]["description"]
    assert "\n" in result["metrics"][0]["description"]
    assert "SQL injection" in result["metrics"][1]["description"]
    assert "API_KEY" in result["metrics"][2]["description"]
    assert "fn key" in result["metrics"][0]["snippet"]
    assert result["summary"].startswith(
        "Correctness 50, Security 50, Maintainability 50."
    )
    assert "PAYMENTS_API_KEY" in result["rationale"]
    assert result["findings"]


def test_system_prompt_matches_browser_contract():
    assert "Return only JSON" in REVIEW_SYSTEM_PROMPT
    assert "Do not claim to reveal" in REVIEW_SYSTEM_PROMPT
    assert (
        "write metrics as an object with keys Correctness, Security, "
        "and Maintainability before summary" in REVIEW_SYSTEM_PROMPT
    )


def test_create_review_prompt_matches_browser_contract():
    prompt = create_review_prompt("python", "print('ok')", 256)
    assert prompt.endswith("\n\nprint('ok')")
    assert (
        "metrics as an object with keys Correctness, Security, and Maintainability"
        in prompt
    )
    assert "keys in this order: score, metrics, summary, rationale, findings" in prompt
    assert "one-sentence description" in prompt
    assert "Do not include a snippet" in prompt
    assert "Never omit a metric to make room for findings" in prompt
    assert "write 3-4 sentences in description" not in prompt
    assert "Do not define what Correctness, Security, or Maintainability means" in (
        prompt
    )


def test_create_review_prompt_uses_detailed_template_at_medium_budget():
    prompt = create_review_prompt("python", "print('ok')", REVIEW_DETAILED_MIN_TOKENS)
    assert "write 3-4 sentences in description" in prompt
    assert "Do not write a one-sentence description" in prompt
    assert "Close all three metric values before writing summary" in prompt


def test_normalization_clamps_and_limits_values():
    result = normalize(
        {
            "score": 120,
            "summary": "Summary",
            "rationale": "Evidence",
            "metrics": [
                {
                    "label": "Correctness",
                    "score": -5,
                    "description": "Incorrect result.",
                    "snippet": "return wrong",
                },
                {
                    "label": "Security",
                    "score": 49.5,
                    "description": "Some risk.",
                    "snippet": "eval(input)",
                },
                {
                    "label": "Maintainability",
                    "score": 101,
                    "description": "Easy to change.",
                    "snippet": "def helper():",
                },
                {"label": "Ignored", "score": 1},
            ],
            "findings": [
                {
                    "severity": "warning",
                    "title": "Issue",
                    "description": "Description",
                    "line": 99,
                    "suggestion": "Fix it",
                },
                {
                    "severity": "suggestion",
                    "title": "Ignored",
                    "description": "Description",
                    "line": 1,
                    "suggestion": "",
                },
            ],
        },
        line_count=10,
        duration_ms=12,
        max_findings=1,
    )

    assert result["score"] == 100
    assert [metric["score"] for metric in result["metrics"]] == [0, 50, 100]
    assert result["metrics"][0]["description"] == "Incorrect result."
    assert result["metrics"][0]["snippet"] == "return wrong"
    assert result["findings"] == [
        {
            "id": "review-0-id",
            "severity": "warning",
            "title": "Issue",
            "description": "Description",
            "line": 10,
            "suggestion": "Fix it",
        }
    ]


def test_normalization_rejects_incomplete_and_invalid_shapes():
    with pytest.raises(ValueError, match="incomplete review"):
        normalize(
            {
                "score": True,
                "summary": "Summary",
                "rationale": "Evidence",
                "metrics": [],
                "findings": [],
            }
        )
    with pytest.raises(ValueError, match="incomplete review"):
        normalize({"score": 50})
    with pytest.raises(ValueError, match="invalid review"):
        normalize([])
    with pytest.raises(ValueError, match="invalid metric"):
        normalize(
            {
                "score": 10,
                "summary": "Summary",
                "rationale": "Evidence",
                "metrics": [{"label": "Correctness"}],
                "findings": [],
            }
        )
    with pytest.raises(ValueError, match="invalid finding"):
        normalize(
            {
                "score": 10,
                "summary": "Summary",
                "rationale": "Evidence",
                "metrics": [
                    {
                        "label": "Correctness",
                        "score": 10,
                        "description": "ok",
                        "snippet": "",
                    }
                ],
                "findings": [
                    {
                        "severity": "info",
                        "title": "Issue",
                        "description": "Description",
                        "line": 1,
                    }
                ],
            }
        )


def test_normalization_omits_empty_suggestions():
    result = normalize(
        {
            "score": 0,
            "summary": "Summary",
            "rationale": "Evidence",
            "metrics": [
                {
                    "label": "Correctness",
                    "score": 1,
                    "description": "ok",
                    "snippet": "pass",
                }
            ],
            "findings": [
                {
                    "severity": "critical",
                    "title": "Issue",
                    "description": "Description",
                    "line": 0,
                    "suggestion": "",
                }
            ],
        },
        line_count=0,
        duration_ms=9,
    )
    assert result["score"] == 0
    assert result["findings"][0]["line"] == 1
    assert "suggestion" not in result["findings"][0]
    assert result["durationMs"] == 9


def test_normalization_omits_non_string_metric_fields():
    result = normalize(
        {
            "score": 10,
            "summary": "Summary",
            "rationale": "Evidence",
            "metrics": [
                {
                    "label": "Correctness",
                    "score": 10,
                    "description": 1,
                    "snippet": None,
                }
            ],
            "findings": [],
        },
        duration_ms=4,
    )
    assert result["metrics"] == [{"label": "Correctness", "score": 10}]
