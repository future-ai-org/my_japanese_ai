import json

import httpx
import pytest
import respx

from app import inference
from app.config import (
    CUSTOM_DEFAULT_DESCRIPTION,
    CUSTOM_DEFAULT_LABEL,
    DEFAULT_MODEL_ID,
    DEFAULT_REQUESTS_PER_WINDOW,
    HUGGINGFACE_DEFAULT_DESCRIPTION,
    HUGGINGFACE_DEFAULT_LABEL,
    HUGGINGFACE_DEFAULT_URL,
    MODAL_DEFAULT_DESCRIPTION,
    MODAL_DEFAULT_LABEL,
    get_settings,
)
from app.inference import (
    CloudInferenceError,
    _append_log,
    _json_error_parts,
    _post_chat_completion,
    _with_response_detail,
    complete_cloud_request,
    list_cloud_providers,
    reserve_cloud_request,
    run_cloud_review,
)
from tests.helpers import MODAL_URL, patch_pool
from tests.test_review import TINYSWALLOW_HF_OUTPUT

VALID_REVIEW = {
    "score": 80,
    "summary": "Solid",
    "rationale": "No concrete defects found.",
    "metrics": [
        {
            "label": "Correctness",
            "score": 80,
            "description": "Behavior is sound.",
            "snippet": "return result",
        },
        {
            "label": "Security",
            "score": 80,
            "description": "No obvious exposure.",
            "snippet": "validate(data)",
        },
        {
            "label": "Maintainability",
            "score": 80,
            "description": "Structure is clear.",
            "snippet": "def helper():",
        },
    ],
    "findings": [],
}


def provider_limits():
    settings = get_settings()
    return {
        "temperature": settings.temperature,
        "maxCodeCharacters": settings.max_code_characters,
        "maxTokens": settings.max_tokens,
        "maxFindings": settings.max_findings,
        "timeoutMs": settings.timeout_ms,
        "requestsPerWindow": settings.requests_per_window,
        "rateLimitWindowMinutes": settings.rate_limit_window_minutes,
    }


async def _noop_sleep(_seconds: float) -> None:
    return None


def _completion_payload(content: str | None = None, **extra):
    return {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": json.dumps(VALID_REVIEW) if content is None else content
                },
            }
        ],
        **extra,
    }


def mock_modal(*, status=200, payload=None, content=None, text=None, side_effect=None):
    if side_effect is not None:
        return respx.post(MODAL_URL).mock(side_effect=side_effect)
    if text is not None:
        return respx.post(MODAL_URL).mock(
            return_value=httpx.Response(status, text=text)
        )
    if payload is None and (content is not None or status == 200):
        payload = _completion_payload(content)
    if payload is None:
        return respx.post(MODAL_URL).mock(return_value=httpx.Response(status))
    return respx.post(MODAL_URL).mock(return_value=httpx.Response(status, json=payload))


async def run_modal(**overrides):
    settings = get_settings()
    params = {
        "temperature": settings.temperature,
        "max_tokens": settings.max_tokens,
        "max_findings": settings.max_findings,
        **overrides,
    }
    language = params.pop("language", "python")
    code = params.pop("code", "print('hello')")
    return await run_cloud_review("modal", language, code, **params)


def test_discovers_only_fully_configured_providers(modal_env):
    assert list_cloud_providers() == [
        {
            "id": "modal",
            "label": MODAL_DEFAULT_LABEL,
            "description": MODAL_DEFAULT_DESCRIPTION,
            "modelId": "test-model",
            **provider_limits(),
        }
    ]


def test_discovers_custom_provider(monkeypatch):
    monkeypatch.delenv("MODAL_URL", raising=False)
    monkeypatch.delenv("MODAL_API_KEY", raising=False)
    monkeypatch.delenv("HUGGINGFACE_URL", raising=False)
    monkeypatch.delenv("HUGGINGFACE_API_KEY", raising=False)
    monkeypatch.setenv(
        "CUSTOM_INFERENCE_URL", "https://example.test/v1/chat/completions"
    )
    monkeypatch.setenv("CUSTOM_INFERENCE_API_KEY", "custom-secret")
    monkeypatch.delenv("CUSTOM_INFERENCE_LABEL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_DESCRIPTION", raising=False)

    provider = list_cloud_providers()[0]
    assert provider["id"] == "custom"
    assert provider["label"] == CUSTOM_DEFAULT_LABEL
    assert provider["description"] == CUSTOM_DEFAULT_DESCRIPTION
    assert provider["modelId"] == DEFAULT_MODEL_ID

    monkeypatch.setenv("CUSTOM_INFERENCE_LABEL", "Private GPU")
    get_settings.cache_clear()
    assert list_cloud_providers()[0]["label"] == "Private GPU"


def test_discovers_huggingface_provider(monkeypatch):
    monkeypatch.delenv("MODAL_URL", raising=False)
    monkeypatch.delenv("MODAL_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_URL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("HUGGINGFACE_URL", raising=False)
    monkeypatch.setenv("HUGGINGFACE_API_KEY", "hf_secret")
    monkeypatch.delenv("HUGGINGFACE_LABEL", raising=False)
    monkeypatch.delenv("HUGGINGFACE_DESCRIPTION", raising=False)

    provider = list_cloud_providers()[0]
    assert provider["id"] == "huggingface"
    assert provider["label"] == HUGGINGFACE_DEFAULT_LABEL
    assert provider["description"] == HUGGINGFACE_DEFAULT_DESCRIPTION
    assert provider["modelId"] == DEFAULT_MODEL_ID

    monkeypatch.setenv("HUGGINGFACE_LABEL", "HF Featherless")
    get_settings.cache_clear()
    listed = list_cloud_providers()[0]
    hf = get_settings().huggingface_provider
    assert listed["label"] == "HF Featherless"
    assert hf is not None
    assert hf.url == HUGGINGFACE_DEFAULT_URL


def test_provider_temperature_follows_settings(modal_env, monkeypatch):
    monkeypatch.setenv("INFERENCE_TEMPERATURE", "0.4")
    get_settings.cache_clear()
    assert list_cloud_providers()[0]["temperature"] == 0.4


@respx.mock
async def test_sends_structured_request_and_normalizes_response(modal_env):
    route = mock_modal(payload=_completion_payload(usage={"total_tokens": 42}))

    result = await run_modal(
        language="typescript",
        code="const value = 1;",
        temperature=0.7,
        max_tokens=256,
        max_findings=1,
    )

    assert result["inference"]["provider"] == "modal"
    request = route.calls[0].request
    assert request.headers["Authorization"] == "Bearer secret"
    payload = json.loads(request.content)
    assert payload["model"] == "test-model"
    assert payload["response_format"]["type"] == "json_schema"
    assert payload["temperature"] == 0.7
    assert payload["max_tokens"] == 256
    user_content = payload["messages"][1]["content"]
    assert "one-sentence description" in user_content
    assert "write 3-4 sentences in description" not in user_content
    assert result["inference"]["generationConfig"] == {
        "temperature": 0.7,
        "maxTokens": 256,
        "maxFindings": 1,
    }
    serialized = json.dumps(result["inference"]["logs"])
    assert "secret" not in serialized
    assert "Bearer" not in serialized
    http_log = next(
        entry
        for entry in result["inference"]["logs"]
        if entry["stage"] == "cloud-http" and "HTTP 200" in entry["message"]
    )
    assert http_log["level"] == "debug"
    assert http_log["details"]["status"] == 200
    assert http_log["details"]["usage"] == {"total_tokens": 42}
    assert "body" not in http_log["details"]
    assert "const value = 1;" not in serialized
    request_headers = {
        name.lower(): value
        for name, value in http_log["details"]["request"]["headers"].items()
    }
    assert request_headers["authorization"] == "[redacted]"


@respx.mock
async def test_huggingface_omits_json_schema_response_format(monkeypatch):
    monkeypatch.delenv("MODAL_URL", raising=False)
    monkeypatch.delenv("MODAL_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_URL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("HUGGINGFACE_URL", raising=False)
    monkeypatch.setenv("HUGGINGFACE_API_KEY", "hf_secret")
    get_settings.cache_clear()

    route = respx.post(HUGGINGFACE_DEFAULT_URL).mock(
        return_value=httpx.Response(200, json=_completion_payload())
    )
    settings = get_settings()
    result = await run_cloud_review(
        "huggingface",
        "python",
        "print('hello')",
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        max_findings=settings.max_findings,
    )

    payload = json.loads(route.calls[0].request.content)
    assert "response_format" not in payload
    assert payload["model"] == DEFAULT_MODEL_ID
    assert result["inference"]["provider"] == "huggingface"


@respx.mock
async def test_huggingface_parses_tinyswallow_markdown(monkeypatch):
    monkeypatch.delenv("MODAL_URL", raising=False)
    monkeypatch.delenv("MODAL_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_URL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("HUGGINGFACE_URL", raising=False)
    monkeypatch.setenv("HUGGINGFACE_API_KEY", "hf_secret")
    get_settings.cache_clear()

    respx.post(HUGGINGFACE_DEFAULT_URL).mock(
        return_value=httpx.Response(
            200, json=_completion_payload(TINYSWALLOW_HF_OUTPUT)
        )
    )
    settings = get_settings()
    result = await run_cloud_review(
        "huggingface",
        "python",
        "print('hello')",
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        max_findings=settings.max_findings,
    )
    assert result["score"] == 82
    assert result["metrics"][1]["label"] == "Security"
    assert result["metrics"][1]["score"] == 70
    assert result["inference"]["provider"] == "huggingface"


@respx.mock
async def test_maps_upstream_timeout(modal_env):
    mock_modal(side_effect=httpx.ReadTimeout("timed out"))
    with pytest.raises(RuntimeError, match="timed out"):
        await run_modal()


@respx.mock
async def test_retries_provider_startup_then_succeeds(modal_env, monkeypatch):
    monkeypatch.setattr("app.inference.asyncio.sleep", _noop_sleep)
    route = mock_modal(
        side_effect=[
            httpx.Response(503),
            httpx.Response(200, json=_completion_payload(usage={"total_tokens": 12})),
        ]
    )
    result = await run_modal()
    assert route.call_count == 2
    assert result["inference"]["provider"] == "modal"


@respx.mock
async def test_maps_provider_startup_status(modal_env, monkeypatch):
    monkeypatch.setattr("app.inference.asyncio.sleep", _noop_sleep)
    mock_modal(status=503)
    with pytest.raises(RuntimeError, match="start up.*HTTP 503"):
        await run_modal()


@pytest.mark.parametrize(
    ("status", "fragment"),
    [
        (401, "authentication failed"),
        (403, "authentication failed"),
        (404, "endpoint was not found"),
        (429, "rate-limited"),
        (408, "temporarily unavailable"),
        (500, "returned an error"),
    ],
)
@respx.mock
async def test_maps_provider_status_codes(modal_env, status, fragment):
    mock_modal(status=status)
    with pytest.raises(CloudInferenceError, match=fragment) as failure:
        await run_modal()
    assert any(
        isinstance(entry.get("details"), dict)
        and entry["details"].get("status") == status
        for entry in failure.value.logs
    )


@respx.mock
async def test_maps_transport_failures(modal_env):
    mock_modal(side_effect=httpx.ConnectError("connection refused"))
    with pytest.raises(CloudInferenceError, match="temporarily unavailable"):
        await run_modal()


@respx.mock
async def test_maps_transport_failure_without_detail(modal_env):
    class EmptyHTTPError(httpx.ConnectError):
        def __str__(self) -> str:
            return ""

    mock_modal(side_effect=EmptyHTTPError("ignored"))
    with pytest.raises(
        CloudInferenceError, match=r"Cloud inference is temporarily unavailable\.$"
    ):
        await run_modal()


@respx.mock
async def test_rejects_non_json_success_body(modal_env):
    mock_modal(text="not-json")
    with pytest.raises(CloudInferenceError, match="returned no review"):
        await run_modal()


@respx.mock
async def test_rejects_empty_and_invalid_model_output(modal_env):
    mock_modal(
        payload={"choices": [{"finish_reason": "stop", "message": {"content": ""}}]}
    )
    with pytest.raises(CloudInferenceError, match="returned no review"):
        await run_modal()

    mock_modal(content="not-json")
    with pytest.raises(CloudInferenceError, match="invalid review"):
        await run_modal()

    mock_modal(
        content="以下が結果です。\n```json\n"
        + json.dumps(VALID_REVIEW)
        + "\n```\n以上。"
    )
    wrapped = await run_modal()
    assert wrapped["score"] == VALID_REVIEW["score"]
    assert wrapped["inference"]["provider"] == "modal"

    mock_modal(
        content='return {"name": data["name"], "email": data["email"]}\n'
        + json.dumps(VALID_REVIEW)
    )
    skipped_snippet = await run_modal()
    assert skipped_snippet["score"] == VALID_REVIEW["score"]

    mock_modal(content=json.dumps({"score": 40, "summary": "Risky HTTP usage."}))
    partial = await run_modal()
    assert partial["score"] == 40
    assert partial["rationale"] == ""
    assert partial["metrics"] == []
    assert partial["findings"] == []

    mock_modal(content=json.dumps({"score": "40", "summary": "Risky HTTP usage."}))
    string_score = await run_modal()
    assert string_score["score"] == 40

    mock_modal(
        content=json.dumps(
            {"review": {"Score": "70/100", "Summary": "Needs timeouts."}}
        )
    )
    nested = await run_modal()
    assert nested["score"] == 70
    assert nested["summary"] == "Needs timeouts."

    bool_review = json.dumps({"score": True, "summary": "nope"})
    mock_modal(content=bool_review)
    with pytest.raises(CloudInferenceError, match="invalid review") as schema_failure:
        await run_modal()
    assert any(
        entry.get("message") == "Raw model output."
        and entry.get("details") == bool_review
        for entry in schema_failure.value.logs
    )
    schema_log = next(
        entry
        for entry in schema_failure.value.logs
        if entry.get("message") == "Model JSON did not match the review schema."
    )
    assert schema_log["details"]["payload"]["scoreType"] == "bool"
    assert schema_log["details"]["rawOutput"] == bool_review

    mock_modal(content="[1, 2]")
    with pytest.raises(CloudInferenceError, match="invalid review") as list_failure:
        await run_modal()
    list_log = next(
        entry
        for entry in list_failure.value.logs
        if entry.get("message") == "Model JSON did not match the review schema."
    )
    assert list_log["details"]["payload"] == {"type": "list"}

    mock_modal(payload={"choices": []})
    with pytest.raises(CloudInferenceError, match="returned no review"):
        await run_modal()


@respx.mock
async def test_schema_error_without_parsed_payload(modal_env, monkeypatch):
    def boom(_text: str):
        raise ValueError("broken parser")

    monkeypatch.setattr(inference, "parse_huggingface_review", boom)
    mock_modal(content="{}")
    with pytest.raises(CloudInferenceError, match="invalid review") as failure:
        await run_modal()
    schema_log = next(
        entry
        for entry in failure.value.logs
        if entry.get("message") == "Model JSON did not match the review schema."
    )
    assert "payload" not in schema_log["details"]
    assert schema_log["details"]["error"] == "broken parser"


@pytest.mark.parametrize(
    ("response_kwargs", "fragment"),
    [
        (
            {
                "status": 422,
                "payload": {"detail": [{"msg": "field required"}, "also bad"]},
            },
            "field required; also bad",
        ),
        ({"status": 400, "text": "x" * 400}, "…"),
        (
            {
                "status": 400,
                "payload": {
                    "error": {
                        "message": "guided decoding is not supported",
                        "type": "BadRequestError",
                    }
                },
            },
            (
                "rejected the request\\. \\(HTTP 400 Bad Request: "
                "guided decoding is not supported; BadRequestError\\)"
            ),
        ),
        ({"status": 400, "payload": {"unrelated": True}}, '"unrelated": true'),
    ],
)
@respx.mock
async def test_includes_provider_error_details(modal_env, response_kwargs, fragment):
    mock_modal(**response_kwargs)
    with pytest.raises(CloudInferenceError, match=fragment):
        await run_modal()


@respx.mock
async def test_includes_plain_text_http_body(modal_env, monkeypatch):
    monkeypatch.setattr("app.inference.asyncio.sleep", _noop_sleep)
    mock_modal(
        status=502,
        text="upstream connect error or disconnect/reset before headers",
    )
    with pytest.raises(
        RuntimeError,
        match=(
            "temporarily unavailable\\. \\(HTTP 502 Bad Gateway: "
            "upstream connect error or disconnect/reset before headers\\)"
        ),
    ):
        await run_modal()


async def test_unconfigured_provider_raises(monkeypatch):
    monkeypatch.delenv("MODAL_URL", raising=False)
    monkeypatch.delenv("MODAL_API_KEY", raising=False)
    with pytest.raises(CloudInferenceError, match="not configured"):
        await run_modal()


def test_log_helpers_omit_source_and_truncate_bodies():
    assert inference._preview("a" * 400).endswith("…")
    assert inference._truncate_logged_body("hello") == "hello"
    assert inference._truncate_logged_body({"error": "boom", "other": 1}) == {
        "error": "boom"
    }
    assert inference._truncate_logged_body({"unrelated": True}) == {
        "keys": ["unrelated"]
    }
    assert inference._truncate_logged_body([1, 2]) == [1, 2]
    assert (
        inference._message_chars({"messages": ["x", {"content": 1}, {"content": "ab"}]})
        == 2
    )
    logs: list[dict] = []
    _append_log(logs, level="info", stage="test", message="hello")
    assert logs[0]["message"] == "hello"
    assert "details" not in logs[0]


def test_json_error_parts_covers_payload_shapes():
    assert _json_error_parts(["not", "a", "dict"]) == []
    assert _json_error_parts({"error": "  boom  "}) == ["boom"]
    assert _json_error_parts({"message": "top", "detail": "also"}) == ["top", "also"]
    assert _json_error_parts({"detail": [{"msg": ""}, {"message": "  "}, "  "]}) == []
    assert _json_error_parts({"error": {"message": "dup"}, "message": "dup"}) == ["dup"]


def test_response_detail_omits_blank_reason_and_empty_body():
    class FakeResponse:
        status_code = 500
        reason_phrase = "  "
        text = ""

        def json(self):
            raise json.JSONDecodeError("Expecting value", "", 0)

    assert _with_response_detail("Cloud inference failed.", FakeResponse()) == (
        "Cloud inference failed. (HTTP 500)"
    )

    class ListBody:
        status_code = 500
        reason_phrase = "Error"
        text = "fallback"

    assert _with_response_detail("Cloud inference failed.", ListBody(), [1]) == (
        "Cloud inference failed. (HTTP 500 Error: fallback)"
    )


@respx.mock
async def test_success_log_omits_blank_reason_phrase(modal_env, monkeypatch):
    monkeypatch.setattr(httpx.Response, "reason_phrase", "", raising=False)
    mock_modal()
    result = await run_modal()
    assert any(
        entry["stage"] == "cloud-http"
        and entry["message"] == "Upstream responded HTTP 200."
        for entry in result["inference"]["logs"]
    )


async def test_times_out_when_deadline_elapses_before_first_attempt(monkeypatch):
    samples = [0.0]

    def fake_perf_counter() -> float:
        return samples.pop(0) if samples else 10_000.0

    monkeypatch.setattr("app.inference.perf_counter", fake_perf_counter)
    logs: list[dict] = []
    with pytest.raises(RuntimeError, match="timed out"):
        await _post_chat_completion(
            MODAL_URL,
            {"Authorization": "Bearer secret"},
            {"model": "test-model"},
            55.0,
            logs,
        )
    assert any(
        entry["message"] == "Upstream request deadline elapsed."
        and entry["details"]["lastStatus"] is None
        for entry in logs
    )


@respx.mock
async def test_raises_last_retryable_status_when_deadline_elapses(monkeypatch):
    monkeypatch.setattr("app.inference.asyncio.sleep", _noop_sleep)
    mock_modal(status=503, text="warming up")
    samples = [0.0, 1.0, 1.0, 2.0, 3.0]

    def fake_perf_counter() -> float:
        return samples.pop(0) if samples else 10_000.0

    monkeypatch.setattr("app.inference.perf_counter", fake_perf_counter)
    logs: list[dict] = []
    with pytest.raises(RuntimeError, match="start up"):
        await _post_chat_completion(
            MODAL_URL,
            {"Authorization": "Bearer secret"},
            {"model": "test-model"},
            55.0,
            logs,
        )
    assert any(
        entry["message"] == "Upstream request deadline elapsed."
        and entry["details"]["lastStatus"] == 503
        for entry in logs
    )


async def test_rate_limit_reservation_is_atomic(monkeypatch):
    pool = patch_pool(monkeypatch, inference, handler=lambda _query, _: None)
    reservation = await reserve_cloud_request("user-id", "modal")

    assert reservation is not None
    assert "hashtextextended" in pool.connection_value.calls[0][0]
    assert any(
        "INSERT INTO inference_requests" in query
        for query, _ in pool.connection_value.calls
    )


async def test_rate_limit_rejects_when_window_is_full(monkeypatch):
    pool = patch_pool(
        monkeypatch,
        inference,
        handler=lambda query, _: (
            None if "INSERT" in query else [{"one": 1}] * DEFAULT_REQUESTS_PER_WINDOW
        ),
    )
    reservation = await reserve_cloud_request("user-id", "modal")

    assert reservation is None
    assert not any(
        "INSERT INTO inference_requests" in query
        for query, _ in pool.connection_value.calls
    )


async def test_complete_cloud_request_updates_status(monkeypatch):
    pool = patch_pool(monkeypatch, inference)
    await complete_cloud_request("request-id", "failed", 42)
    query, parameters = pool.connection_value.calls[0]
    assert "UPDATE inference_requests" in query
    assert parameters == ("failed", 42, "request-id")
