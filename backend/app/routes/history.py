from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from psycopg.types.json import Jsonb

from ..auth import get_current_user
from ..config import API_HISTORY_PREFIX, LANGUAGES, UUID_PATTERN, get_settings
from ..database import get_pool
from ..util import is_number, isoformat, json_object

router = APIRouter(prefix=API_HISTORY_PREFIX)

# Cheap result/metadata projections shared by list SELECT and star RETURNING.
_SUMMARY_RESULT_COLUMNS = """
  COALESCE(result->>'translation', result->>'summary', '') AS translation,
  result#>>'{inference,provider}' AS provider,
  result#>>'{inference,modelId}' AS model_id,
  result#>'{inference,generationConfig}' AS generation_config,
  (result->>'durationMs')::double precision AS duration_ms
"""

_SUMMARY_COLUMNS = f"""
  id,
  language,
  split_part(code, E'\\n', 1) AS code_preview,
  CASE
    WHEN code IS NULL OR code = '' THEN 0
    ELSE cardinality(string_to_array(code, E'\\n'))
  END AS line_count,
  COALESCE(char_length(code), 0) AS character_count,
  {_SUMMARY_RESULT_COLUMNS.strip()},
  starred,
  created_at
"""

# Star only flips `starred`; skip code scans used for list previews/counts.
_STAR_RETURNING_COLUMNS = f"""
  id,
  language,
  {_SUMMARY_RESULT_COLUMNS.strip()},
  starred,
  created_at
"""


def _is_starred(row: dict[str, Any]) -> bool:
    return bool(row.get("starred"))


def _serialize_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "language": row["language"],
        "code": row["code"],
        "result": row["result"],
        "starred": _is_starred(row),
        "createdAt": isoformat(row["created_at"]),
    }


def _serialize_summary(row: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": str(row["id"]),
        "language": row["language"],
        "createdAt": isoformat(row["created_at"]),
        "translation": row["translation"] or "",
        "starred": _is_starred(row),
    }
    if "code_preview" in row:
        payload["codePreview"] = row["code_preview"] or ""
    line_count = row.get("line_count")
    if is_number(line_count):
        payload["lineCount"] = int(line_count)
    character_count = row.get("character_count")
    if is_number(character_count):
        payload["characterCount"] = int(character_count)
    if row.get("provider"):
        payload["provider"] = row["provider"]
    if row.get("model_id"):
        payload["modelId"] = row["model_id"]
    config = row.get("generation_config")
    if isinstance(config, dict):
        temperature = config.get("temperature")
        max_tokens = config.get("maxTokens")
        if is_number(temperature):
            payload["temperature"] = temperature
        if is_number(max_tokens):
            payload["maxTokens"] = max_tokens
    duration_ms = row.get("duration_ms")
    if is_number(duration_ms):
        payload["durationMs"] = duration_ms
    return payload


def _is_review_result(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("translation"), str)
        and isinstance(value.get("lesson"), str)
        and is_number(value.get("durationMs"))
    )


def _invalid_identifier() -> JSONResponse:
    return JSONResponse({"error": "Invalid history identifier."}, status_code=400)


def _invalid_star_payload() -> JSONResponse:
    return JSONResponse({"error": "Invalid favorite payload."}, status_code=400)


async def _require_user(request: Request) -> dict[str, Any] | JSONResponse:
    user = await get_current_user(request)
    if user is None:
        return JSONResponse({"error": "Sign in to access history."}, status_code=401)
    return user


@router.get("")
async def get_history(request: Request) -> JSONResponse:
    try:
        user = await _require_user(request)
        if isinstance(user, JSONResponse):
            return user
        pool = await get_pool()
        async with pool.connection() as connection:
            cursor = await connection.execute(
                f"""
                SELECT {_SUMMARY_COLUMNS}
                FROM review_history
                WHERE user_id = %s
                ORDER BY starred DESC, created_at DESC
                LIMIT %s
                """,
                (user["id"], get_settings().history_page_size),
            )
            rows = await cursor.fetchall()
        return JSONResponse([_serialize_summary(row) for row in rows])
    except Exception:
        return JSONResponse({"error": "History service unavailable."}, status_code=500)


@router.get("/{entry_id}")
async def get_history_entry(entry_id: str, request: Request) -> JSONResponse:
    if UUID_PATTERN.fullmatch(entry_id) is None:
        return _invalid_identifier()

    try:
        user = await _require_user(request)
        if isinstance(user, JSONResponse):
            return user
        pool = await get_pool()
        async with pool.connection() as connection:
            cursor = await connection.execute(
                """
                SELECT id, language, code, result, starred, created_at
                FROM review_history
                WHERE id = %s AND user_id = %s
                """,
                (entry_id, user["id"]),
            )
            row = await cursor.fetchone()
        if row is None:
            return JSONResponse({"error": "History entry not found."}, status_code=404)
        return JSONResponse(_serialize_row(row))
    except Exception:
        return JSONResponse({"error": "History service unavailable."}, status_code=500)


@router.post("")
async def save_history(request: Request) -> JSONResponse:
    try:
        user = await _require_user(request)
        if isinstance(user, JSONResponse):
            return user
        body = await json_object(request)
        if (
            body.get("language") not in LANGUAGES
            or not isinstance(body.get("code"), str)
            or not 1 <= len(body["code"]) <= get_settings().max_history_code_characters
            or not _is_review_result(body.get("result"))
        ):
            return JSONResponse({"error": "Invalid review payload."}, status_code=400)

        pool = await get_pool()
        async with pool.connection() as connection:
            cursor = await connection.execute(
                """
                INSERT INTO review_history (id, user_id, language, code, result)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, language, code, result, starred, created_at
                """,
                (
                    uuid4(),
                    user["id"],
                    body["language"],
                    body["code"],
                    Jsonb(body["result"]),
                ),
            )
            row = await cursor.fetchone()
        return JSONResponse(_serialize_row(row), status_code=201)
    except Exception:
        return JSONResponse({"error": "History service unavailable."}, status_code=500)


@router.patch("/{entry_id}")
async def star_history(entry_id: str, request: Request) -> JSONResponse:
    if UUID_PATTERN.fullmatch(entry_id) is None:
        return _invalid_identifier()

    try:
        user = await _require_user(request)
        if isinstance(user, JSONResponse):
            return user
        body = await json_object(request)
        if not isinstance(body.get("starred"), bool):
            return _invalid_star_payload()

        pool = await get_pool()
        async with pool.connection() as connection:
            cursor = await connection.execute(
                f"""
                UPDATE review_history
                SET starred = %s
                WHERE id = %s AND user_id = %s
                RETURNING {_STAR_RETURNING_COLUMNS}
                """,
                (body["starred"], entry_id, user["id"]),
            )
            row = await cursor.fetchone()
        if row is None:
            return JSONResponse({"error": "History entry not found."}, status_code=404)
        return JSONResponse(_serialize_summary(row))
    except Exception:
        return JSONResponse({"error": "History service unavailable."}, status_code=500)


@router.delete("/{entry_id}")
async def delete_history(entry_id: str, request: Request) -> JSONResponse:
    if UUID_PATTERN.fullmatch(entry_id) is None:
        return _invalid_identifier()

    try:
        user = await _require_user(request)
        if isinstance(user, JSONResponse):
            return user
        pool = await get_pool()
        async with pool.connection() as connection:
            cursor = await connection.execute(
                """
                DELETE FROM review_history
                WHERE id = %s AND user_id = %s
                RETURNING id
                """,
                (entry_id, user["id"]),
            )
            row = await cursor.fetchone()
        if row is None:
            return JSONResponse({"error": "History entry not found."}, status_code=404)
        return JSONResponse({"deleted": True})
    except Exception:
        return JSONResponse({"error": "History service unavailable."}, status_code=500)
