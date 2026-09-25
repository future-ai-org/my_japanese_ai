import asyncio
import json
from time import perf_counter
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from .config import (
    CLOUD_PROVIDER_IDS,
    JSON_ERROR_LIST_LIMIT,
    JSON_ERROR_OBJECT_KEYS,
    JSON_ERROR_VALUE_KEYS,
    LOG_BODY_KEY_LIMIT,
    LOG_ERROR_KEYS,
    MAX_ERROR_DETAIL_CHARS,
    MAX_LOG_TEXT_CHARS,
    REDACTED_HEADERS,
    RETRYABLE_PROVIDER_STATUSES,
    CloudProvider,
    get_settings,
)
from .database import get_pool
from .http import get_http_client
from .prompts import REVIEW_SYSTEM_PROMPT, create_review_prompt
from .review import (
    REVIEW_SCHEMA,
    normalize_review_result,
    parse_huggingface_review,
)
from .util import now_iso


class CloudInferenceError(RuntimeError):
    def __init__(self, message: str, logs: list[dict[str, Any]] | None = None):
        super().__init__(message)
        self.logs = logs or []


def list_cloud_providers() -> list[dict[str, Any]]:
    settings = get_settings()
    providers = [settings.provider(provider_id) for provider_id in CLOUD_PROVIDER_IDS]
    return [
        {
            "id": provider.id,
            "label": provider.label,
            "description": provider.description,
            "modelId": provider.model_id,
            "temperature": settings.temperature,
            "maxCodeCharacters": settings.max_code_characters,
            "maxTokens": settings.max_tokens,
            "maxFindings": settings.max_findings,
            "timeoutMs": settings.timeout_ms,
            "requestsPerWindow": settings.requests_per_window,
            "rateLimitWindowMinutes": settings.rate_limit_window_minutes,
        }
        for provider in providers
        if provider is not None
    ]


async def reserve_cloud_request(user_id: str, provider: CloudProvider) -> str | None:
    settings = get_settings()
    request_id = str(uuid4())
    pool = await get_pool()
    async with pool.connection() as connection:
        async with connection.transaction():
            await connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (user_id,),
            )
            cursor = await connection.execute(
                """
                SELECT 1
                FROM inference_requests
                WHERE user_id = %s
                  AND created_at >= NOW() - make_interval(mins => %s)
                LIMIT %s
                """,
                (
                    user_id,
                    settings.rate_limit_window_minutes,
                    settings.requests_per_window,
                ),
            )
            rows = await cursor.fetchall()
            if len(rows) >= settings.requests_per_window:
                return None
            await connection.execute(
                """
                INSERT INTO inference_requests (id, user_id, provider, status)
                VALUES (%s, %s, %s, 'started')
                """,
                (request_id, user_id, provider),
            )
    return request_id


async def complete_cloud_request(
    request_id: str, status: Literal["completed", "failed"], duration_ms: int
) -> None:
    pool = await get_pool()
    async with pool.connection() as connection:
        await connection.execute(
            """
            UPDATE inference_requests
            SET status = %s, duration_ms = %s
            WHERE id = %s
            """,
            (status, duration_ms, request_id),
        )


def _append_log(
    logs: list[dict[str, Any]],
    *,
    level: str,
    stage: str,
    message: str,
    details: Any = None,
) -> None:
    entry: dict[str, Any] = {
        "id": str(uuid4()),
        "timestamp": now_iso(),
        "level": level,
        "stage": stage,
        "message": message,
    }
    if details is not None:
        entry["details"] = details
    logs.append(entry)


def _header_map(headers: Any) -> dict[str, str]:
    return {
        str(name): (
            "[redacted]" if str(name).lower() in REDACTED_HEADERS else str(value)
        )
        for name, value in dict(headers).items()
    }


def _preview(text: str, limit: int = MAX_LOG_TEXT_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _parse_body(text: str) -> Any:
    if not text:
        return ""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _truncate_logged_body(payload: Any) -> Any:
    if isinstance(payload, str):
        return _preview(payload)
    if isinstance(payload, dict):
        compact: dict[str, Any] = {}
        for key in LOG_ERROR_KEYS:
            if key in payload:
                value = payload[key]
                compact[key] = _preview(value) if isinstance(value, str) else value
        return compact or {"keys": sorted(payload)[:LOG_BODY_KEY_LIMIT]}
    return payload


def _review_shape(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {"type": type(value).__name__}
    keys = [str(key) for key in value]
    metrics = value.get("metrics")
    findings = value.get("findings")
    return {
        "keys": keys[:LOG_BODY_KEY_LIMIT],
        "keyCount": len(keys),
        "scoreType": type(value.get("score")).__name__,
        "summaryType": type(value.get("summary")).__name__,
        "rationaleType": type(value.get("rationale")).__name__,
        "metricsType": type(metrics).__name__,
        "findingsType": type(findings).__name__,
        "metricCount": len(metrics) if isinstance(metrics, list) else None,
        "findingCount": len(findings) if isinstance(findings, list) else None,
    }


def _code_stats(code: str) -> dict[str, Any]:
    return {
        "codeCharacters": len(code),
        "codeLines": code.count("\n") + 1 if code else 0,
    }


def _message_chars(body: dict[str, Any]) -> int:
    total = 0
    for message in body.get("messages") or []:
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            total += len(message["content"])
    return total


def _endpoint_details(url: str) -> dict[str, Any]:
    parsed = urlparse(url)
    return {
        "scheme": parsed.scheme,
        "host": parsed.hostname,
        "port": parsed.port,
        "path": parsed.path,
        "query": parsed.query,
    }


def _response_snapshot(
    response: httpx.Response, *, attempt: int, elapsed_ms: int, decoded: Any
) -> dict[str, Any]:
    request = response.request
    snapshot: dict[str, Any] = {
        "attempt": attempt,
        "elapsedMs": elapsed_ms,
        "request": {
            "method": request.method,
            "url": str(request.url),
            "headers": _header_map(request.headers),
        },
        "status": response.status_code,
        "reason": response.reason_phrase,
        "ok": response.is_success,
        "httpVersion": response.http_version,
        "url": str(response.url),
        "numBytes": len(response.content),
        "headers": _header_map(response.headers),
    }
    if response.is_success:
        if isinstance(decoded, dict) and decoded.get("usage") is not None:
            snapshot["usage"] = decoded.get("usage")
        return snapshot
    snapshot["body"] = _truncate_logged_body(decoded)
    return snapshot


def _clean_error_detail(text: str) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) > MAX_ERROR_DETAIL_CHARS:
        return cleaned[: MAX_ERROR_DETAIL_CHARS - 1].rstrip() + "…"
    return cleaned


def _json_error_parts(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []
    parts: list[str] = []
    error = payload.get("error")
    if isinstance(error, dict):
        for key in JSON_ERROR_OBJECT_KEYS:
            value = error.get(key)
            if isinstance(value, str | int) and str(value).strip():
                parts.append(str(value).strip())
    elif isinstance(error, str) and error.strip():
        parts.append(error.strip())
    for key in JSON_ERROR_VALUE_KEYS:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
        elif isinstance(value, list):
            for entry in value[:JSON_ERROR_LIST_LIMIT]:
                if isinstance(entry, dict):
                    msg = entry.get("msg") or entry.get("message")
                    if isinstance(msg, str) and msg.strip():
                        parts.append(msg.strip())
                elif isinstance(entry, str) and entry.strip():
                    parts.append(entry.strip())
    unique: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if part not in seen:
            seen.add(part)
            unique.append(part)
    return unique


def _provider_response_detail(
    response: httpx.Response, decoded: Any | None = None
) -> str:
    payload = _parse_body(response.text) if decoded is None else decoded
    if isinstance(payload, dict):
        parts = _json_error_parts(payload)
        if parts:
            return _clean_error_detail("; ".join(parts))
        return _clean_error_detail(json.dumps(payload, ensure_ascii=True))
    if isinstance(payload, str):
        return _clean_error_detail(payload)
    return _clean_error_detail(response.text or "")


def _status_label(response: httpx.Response) -> str:
    reason = (response.reason_phrase or "").strip()
    label = f"HTTP {response.status_code}"
    return f"{label} {reason}" if reason else label


def _with_response_detail(
    summary: str, response: httpx.Response, decoded: Any | None = None
) -> str:
    detail = _provider_response_detail(response, decoded)
    status_label = _status_label(response)
    if detail:
        return f"{summary} ({status_label}: {detail})"
    return f"{summary} ({status_label})"


def _raise_provider_status(
    response: httpx.Response, decoded: Any | None = None
) -> None:
    status = response.status_code
    if status in {401, 403}:
        summary = "Cloud inference authentication failed."
    elif status == 404:
        summary = "The cloud inference endpoint was not found."
    elif status == 429:
        summary = (
            "The cloud inference provider rate-limited the request. Try again shortly."
        )
    elif status == 503:
        summary = (
            "Modal's cloud inference provider sometimes needs a moment to start "
            "up a sleeping container. This is a normal behaviour. Wait a minute "
            "and try again."
        )
    elif status in {408, 502, 504}:
        summary = "Cloud inference is temporarily unavailable."
    elif 400 <= status < 500:
        summary = "The cloud inference provider rejected the request."
    else:
        summary = "The cloud inference provider returned an error."
    raise RuntimeError(_with_response_detail(summary, response, decoded))


async def _post_chat_completion(
    url: str,
    headers: dict[str, str],
    body: dict[str, Any],
    timeout_s: float,
    logs: list[dict[str, Any]],
) -> tuple[httpx.Response, Any]:
    deadline = perf_counter() + timeout_s
    last_response: httpx.Response | None = None
    last_decoded: Any = None
    attempts = 0
    client = await get_http_client()
    _append_log(
        logs,
        level="debug",
        stage="cloud-http",
        message="Prepared upstream chat completion request.",
        details={
            "endpoint": _endpoint_details(url),
            "timeoutSeconds": timeout_s,
            "headers": _header_map(headers),
            "model": body.get("model"),
            "temperature": body.get("temperature"),
            "maxTokens": body.get("max_tokens"),
            "messageChars": _message_chars(body),
        },
    )
    while True:
        remaining = deadline - perf_counter()
        if remaining <= 0:
            _append_log(
                logs,
                level="debug",
                stage="cloud-http",
                message="Upstream request deadline elapsed.",
                details={
                    "attempts": attempts,
                    "timeoutSeconds": timeout_s,
                    "lastStatus": (
                        last_response.status_code if last_response else None
                    ),
                },
            )
            if last_response is not None:
                _raise_provider_status(last_response, last_decoded)
            raise RuntimeError("Cloud inference timed out. Try again shortly.")
        attempt = attempts + 1
        attempt_started = perf_counter()
        _append_log(
            logs,
            level="debug",
            stage="cloud-http",
            message=f"Sending upstream request (attempt {attempt}).",
            details={
                "attempt": attempt,
                "remainingTimeoutMs": round(remaining * 1_000),
            },
        )
        try:
            response = await client.post(
                url,
                headers=headers,
                json=body,
                timeout=httpx.Timeout(remaining),
            )
        except httpx.TimeoutException as error:
            _append_log(
                logs,
                level="debug",
                stage="cloud-http",
                message="Upstream request timed out.",
                details={
                    "attempt": attempt,
                    "elapsedMs": round((perf_counter() - attempt_started) * 1_000),
                    "errorType": type(error).__name__,
                    "error": str(error),
                },
            )
            raise RuntimeError(
                "Cloud inference timed out. Try again shortly."
            ) from error
        except httpx.HTTPError as error:
            _append_log(
                logs,
                level="debug",
                stage="cloud-http",
                message="Upstream HTTP transport failed.",
                details={
                    "attempt": attempt,
                    "elapsedMs": round((perf_counter() - attempt_started) * 1_000),
                    "errorType": type(error).__name__,
                    "error": str(error),
                },
            )
            detail = str(error).strip()
            if detail:
                raise RuntimeError(
                    f"Cloud inference is temporarily unavailable. {detail}"
                ) from error
            raise RuntimeError("Cloud inference is temporarily unavailable.") from error
        elapsed_ms = round((perf_counter() - attempt_started) * 1_000)
        decoded = _parse_body(response.text)
        snapshot = _response_snapshot(
            response, attempt=attempt, elapsed_ms=elapsed_ms, decoded=decoded
        )
        _append_log(
            logs,
            level="debug",
            stage="cloud-http",
            message=f"Upstream responded {_status_label(response)}.",
            details=snapshot,
        )
        if response.is_success:
            return response, decoded
        last_response = response
        last_decoded = decoded
        attempts = attempt
        remaining = deadline - perf_counter()
        settings = get_settings()
        if (
            response.status_code not in RETRYABLE_PROVIDER_STATUSES
            or remaining < settings.retry_remaining_seconds
            or attempts >= settings.max_startup_attempts
        ):
            _raise_provider_status(response, decoded)
        sleep_s = min(
            settings.retry_max_seconds,
            max(
                settings.retry_min_seconds,
                remaining / settings.retry_sleep_divisor,
            ),
        )
        _append_log(
            logs,
            level="debug",
            stage="cloud-http",
            message="Retrying after retryable upstream status.",
            details={
                "attempt": attempts,
                "status": response.status_code,
                "sleepMs": round(sleep_s * 1_000),
                "remainingTimeoutMs": round(remaining * 1_000),
            },
        )
        await asyncio.sleep(sleep_s)


async def run_cloud_review(
    provider_id: CloudProvider,
    language: str,
    code: str,
    *,
    temperature: float,
    max_tokens: int,
    max_findings: int,
) -> dict[str, Any]:
    settings = get_settings()
    provider = settings.provider(provider_id)
    if provider is None:
        raise CloudInferenceError("The selected cloud provider is not configured.")

    started = perf_counter()
    started_at = now_iso()
    user_prompt = create_review_prompt(language, code, max_tokens)
    logs: list[dict[str, Any]] = []
    _append_log(
        logs,
        level="debug",
        stage="cloud-generation",
        message=f"Prepared review for {provider.label}.",
        details={
            "provider": provider.id,
            "label": provider.label,
            "modelId": provider.model_id,
            "language": language,
            **_code_stats(code),
            "temperature": temperature,
            "maxTokens": max_tokens,
            "maxFindings": max_findings,
            "timeoutMs": settings.timeout_ms,
        },
    )
    body: dict[str, Any] = {
        "model": provider.model_id,
        "messages": [
            {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    # Featherless (Hugging Face Inference Providers) rejects OpenAI
    # response_format.json_schema. The prompt still asks for JSON; we parse it.
    if provider.json_schema:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": settings.review_json_schema_name,
                "strict": True,
                "schema": REVIEW_SCHEMA,
            },
        }

    try:
        _response, payload = await _post_chat_completion(
            provider.url,
            {
                "Authorization": f"Bearer {provider.api_key}",
                "Content-Type": "application/json",
            },
            body,
            settings.timeout_ms / 1_000,
            logs,
        )
    except RuntimeError as error:
        raise CloudInferenceError(str(error), logs) from error

    try:
        choice = payload.get("choices", [])[0]
        content = choice.get("message", {}).get("content")
    except (AttributeError, IndexError, TypeError) as error:
        _append_log(
            logs,
            level="debug",
            stage="cloud-generation",
            message="Upstream payload was missing a chat completion.",
            details={
                "errorType": type(error).__name__,
                "bodyPreview": _truncate_logged_body(payload),
            },
        )
        raise CloudInferenceError(
            "The cloud inference provider returned no review.", logs
        ) from error
    if not content:
        _append_log(
            logs,
            level="debug",
            stage="cloud-generation",
            message="Upstream chat completion had empty content.",
            details={
                "finishReason": choice.get("finish_reason"),
                "hasContent": False,
            },
        )
        raise CloudInferenceError(
            "The cloud inference provider returned no review.", logs
        )

    completed_at = now_iso()
    _append_log(
        logs,
        level="debug",
        stage="cloud-generation",
        message="Raw model output.",
        details=content,
    )
    _append_log(
        logs,
        level="debug",
        stage="cloud-generation",
        message="Parsed upstream chat completion.",
        details={
            "finishReason": choice.get("finish_reason"),
            "usage": payload.get("usage"),
            "id": payload.get("id"),
            "model": payload.get("model"),
            "rawOutputChars": len(content),
        },
    )
    inference = {
        "provider": provider.id,
        "modelId": provider.model_id,
        "startedAt": started_at,
        "completedAt": completed_at,
        "systemPrompt": REVIEW_SYSTEM_PROMPT,
        "userPrompt": user_prompt,
        "responseSchema": REVIEW_SCHEMA,
        "generationConfig": {
            "temperature": temperature,
            "maxTokens": max_tokens,
            "maxFindings": max_findings,
        },
        "finishReason": choice.get("finish_reason"),
        "usage": payload.get("usage"),
        "rawOutput": content,
        "logs": logs,
    }
    parsed: Any = None
    try:
        parsed = parse_huggingface_review(content)
        return normalize_review_result(
            parsed,
            line_count=code.count("\n") + 1 if code else 0,
            duration_ms=round((perf_counter() - started) * 1_000),
            max_findings=max_findings,
            inference=inference,
            create_id=lambda: str(uuid4()),
        )
    except json.JSONDecodeError as error:
        _append_log(
            logs,
            level="debug",
            stage="cloud-generation",
            message="Model output was not valid JSON.",
            details={
                "rawOutputChars": len(content),
                "error": str(error),
                "rawOutput": content,
            },
        )
        raise CloudInferenceError(
            "The cloud inference provider returned an invalid review.", logs
        ) from error
    except ValueError as error:
        details: dict[str, Any] = {
            "rawOutputChars": len(content),
            "error": str(error),
            "rawOutput": content,
        }
        if parsed is not None:
            details["payload"] = _review_shape(parsed)
        _append_log(
            logs,
            level="debug",
            stage="cloud-generation",
            message="Model JSON did not match the review schema.",
            details=details,
        )
        raise CloudInferenceError(
            "The cloud inference provider returned an invalid review.", logs
        ) from error
