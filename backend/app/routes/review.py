from time import perf_counter
from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..auth import get_current_user
from ..config import (
    API_REVIEW_PREFIX,
    CLOUD_PROVIDERS,
    LANGUAGES,
    MAX_TEMPERATURE,
    MIN_TEMPERATURE,
    get_settings,
)
from ..inference import (
    CloudInferenceError,
    complete_cloud_request,
    list_cloud_providers,
    reserve_cloud_request,
    run_cloud_review,
)
from ..util import json_object

router = APIRouter(prefix=API_REVIEW_PREFIX)


def validate_cloud_review_request(value: Any) -> dict[str, Any] | None:
    settings = get_settings()
    parameters = value.get("parameters") if isinstance(value, dict) else None
    temperature = (
        parameters.get("temperature") if isinstance(parameters, dict) else None
    )
    max_tokens = parameters.get("maxTokens") if isinstance(parameters, dict) else None
    max_findings = (
        parameters.get("maxFindings") if isinstance(parameters, dict) else None
    )
    if (
        not isinstance(value, dict)
        or value.get("provider") not in CLOUD_PROVIDERS
        or value.get("language") not in LANGUAGES
        or not isinstance(value.get("code"), str)
        or not value["code"].strip()
        or len(value["code"]) > settings.max_code_characters
        or not isinstance(temperature, int | float)
        or isinstance(temperature, bool)
        or not MIN_TEMPERATURE <= temperature <= MAX_TEMPERATURE
        or not isinstance(max_tokens, int)
        or isinstance(max_tokens, bool)
        or not 1 <= max_tokens <= settings.max_tokens
        or not isinstance(max_findings, int)
        or isinstance(max_findings, bool)
        or not 0 <= max_findings <= settings.max_findings
    ):
        return None
    return {
        "provider": value["provider"],
        "language": value["language"],
        "code": value["code"],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "max_findings": max_findings,
    }


@router.get("")
async def get_review_providers() -> JSONResponse:
    return JSONResponse({"providers": list_cloud_providers()})


@router.post("")
async def review(request: Request) -> JSONResponse:
    reservation_id: str | None = None
    started = perf_counter()
    outcome: Literal["completed", "failed"] | None = None
    try:
        user = await get_current_user(request)
        if user is None:
            return JSONResponse(
                {"error": "Sign in to use cloud inference."}, status_code=401
            )
        body = validate_cloud_review_request(await json_object(request))
        if body is None:
            return JSONResponse({"error": "Invalid review request."}, status_code=400)

        provider = body["provider"]
        settings = get_settings()
        if settings.provider(provider) is None:
            return JSONResponse(
                {"error": "The selected cloud provider is not configured."},
                status_code=503,
            )

        reservation_id = await reserve_cloud_request(user["id"], provider)
        if reservation_id is None:
            return JSONResponse(
                {
                    "error": (
                        "Cloud review limit reached. Try again within "
                        f"{settings.rate_limit_window_minutes} minutes."
                    )
                },
                status_code=429,
                headers={"Retry-After": str(settings.rate_limit_window_minutes * 60)},
            )

        result = await run_cloud_review(
            provider,
            body["language"],
            body["code"],
            temperature=body["temperature"],
            max_tokens=body["max_tokens"],
            max_findings=body["max_findings"],
        )
        outcome = "completed"
        return JSONResponse(result)
    except CloudInferenceError as error:
        outcome = "failed"
        payload: dict[str, Any] = {"error": str(error)}
        if error.logs:
            payload["diagnostics"] = {"logs": error.logs}
        return JSONResponse(payload, status_code=502)
    except Exception:
        outcome = "failed"
        return JSONResponse(
            {"error": "Cloud inference is temporarily unavailable."},
            status_code=502,
        )
    finally:
        if reservation_id is not None and outcome is not None:
            try:
                await complete_cloud_request(
                    reservation_id,
                    outcome,
                    round((perf_counter() - started) * 1_000),
                )
            except Exception:
                pass
