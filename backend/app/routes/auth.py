from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..auth import (
    create_session,
    destroy_session,
    get_current_user,
    hash_password,
    is_password_valid,
    login_locked,
    public_user,
    record_auth_attempt,
    register_locked,
    verify_password,
)
from ..config import API_AUTH_PREFIX, EMAIL_PATTERN, get_settings
from ..database import get_pool
from ..security import client_ip
from ..util import isoformat, json_object, now_iso

router = APIRouter(prefix=API_AUTH_PREFIX)


def _lockout_response() -> JSONResponse:
    retry_after = _get_lockout_seconds()
    return JSONResponse(
        {"error": "Too many attempts. Try again shortly."},
        status_code=429,
        headers={"Retry-After": str(retry_after)},
    )


def _get_lockout_seconds() -> int:
    return get_settings().login_window_minutes * 60


def _parse_email(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip().lower()


def _parse_password(value: object) -> str:
    return value if isinstance(value, str) else ""


async def _require_user(request: Request) -> dict[str, Any] | JSONResponse:
    user = await get_current_user(request)
    if user is None:
        return JSONResponse(
            {"error": "Sign in to manage your account."}, status_code=401
        )
    return user


@router.post("/register")
async def register(request: Request) -> JSONResponse:
    body = await json_object(request)
    name = body.get("name", "").strip() if isinstance(body.get("name"), str) else ""
    email = _parse_email(body.get("email"))
    password = _parse_password(body.get("password"))
    settings = get_settings()
    if (
        not settings.name_min_length <= len(name) <= settings.name_max_length
        or len(email) > settings.email_max_length
        or EMAIL_PATTERN.fullmatch(email) is None
        or not is_password_valid(password)
    ):
        return JSONResponse(
            {
                "error": (
                    "Enter a valid name and email, and use a password of at least "
                    f"{settings.password_min_length} characters."
                )
            },
            status_code=400,
        )

    ip_address = client_ip(request)
    try:
        pool = await get_pool()
        async with pool.connection() as connection:
            if await register_locked(connection, ip_address):
                return _lockout_response()
        password_hash = await hash_password(password)
        async with pool.connection() as connection:
            cursor = await connection.execute(
                """
                INSERT INTO users (id, name, email, password_hash)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (email) DO NOTHING
                RETURNING id, name, email, created_at
                """,
                (uuid4(), name, email, password_hash),
            )
            row = await cursor.fetchone()
            await record_auth_attempt(
                connection, "register", email, ip_address, row is not None
            )
        if row is None:
            return JSONResponse(
                {"error": "An account with this email already exists."},
                status_code=409,
            )
        response = JSONResponse({"user": public_user(row)}, status_code=201)
        await create_session(response, str(row["id"]))
        return response
    except Exception:
        return JSONResponse({"error": "Could not create the account."}, status_code=500)


@router.post("/login")
async def login(request: Request) -> JSONResponse:
    body = await json_object(request)
    email = _parse_email(body.get("email"))
    password = _parse_password(body.get("password"))
    if not email or not password:
        return JSONResponse(
            {"error": "Email and password are required."}, status_code=400
        )

    ip_address = client_ip(request)
    try:
        pool = await get_pool()
        async with pool.connection() as connection:
            if await login_locked(connection, email, ip_address):
                return _lockout_response()
            cursor = await connection.execute(
                """
                SELECT id, name, email, password_hash, created_at
                FROM users
                WHERE email = %s
                LIMIT 1
                """,
                (email,),
            )
            row = await cursor.fetchone()
            valid = row is not None and await verify_password(
                password, row["password_hash"]
            )
            await record_auth_attempt(connection, "login", email, ip_address, valid)
        if not valid:
            return JSONResponse(
                {"error": "Invalid email or password."}, status_code=401
            )
        response = JSONResponse({"user": public_user(row)})
        await create_session(response, str(row["id"]))
        return response
    except Exception:
        return JSONResponse({"error": "Could not sign in."}, status_code=500)


@router.get("/session")
async def session(request: Request) -> JSONResponse:
    try:
        return JSONResponse({"user": await get_current_user(request)})
    except Exception:
        return JSONResponse({"error": "Could not load the session."}, status_code=500)


@router.post("/logout")
async def logout(request: Request) -> JSONResponse:
    try:
        response = JSONResponse({"signedOut": True})
        await destroy_session(request, response)
        return response
    except Exception:
        return JSONResponse({"error": "Could not sign out."}, status_code=500)


@router.post("/export")
async def export_account(request: Request) -> JSONResponse:
    try:
        user = await _require_user(request)
        if isinstance(user, JSONResponse):
            return user
        limit = get_settings().export_max_reviews
        pool = await get_pool()
        async with pool.connection() as connection:
            cursor = await connection.execute(
                """
                SELECT id, language, code, result, starred, created_at
                FROM review_history
                WHERE user_id = %s
                ORDER BY starred DESC, created_at DESC
                LIMIT %s
                """,
                (user["id"], limit + 1),
            )
            rows = await cursor.fetchall()
        truncated = len(rows) > limit
        if truncated:
            rows = rows[:limit]
        return JSONResponse(
            {
                "exportedAt": now_iso(),
                "user": user,
                "truncated": truncated,
                "reviews": [
                    {
                        "id": str(row["id"]),
                        "language": row["language"],
                        "code": row["code"],
                        "result": row["result"],
                        "starred": bool(row.get("starred")),
                        "createdAt": isoformat(row["created_at"]),
                    }
                    for row in rows
                ],
            }
        )
    except Exception:
        return JSONResponse(
            {"error": "Could not export account data."}, status_code=500
        )


@router.post("/delete")
async def delete_account(request: Request) -> JSONResponse:
    body = await json_object(request)
    password = _parse_password(body.get("password"))
    if not password:
        return JSONResponse(
            {"error": "Enter your password to delete the account."}, status_code=400
        )

    try:
        user = await _require_user(request)
        if isinstance(user, JSONResponse):
            return user
        pool = await get_pool()
        async with pool.connection() as connection:
            cursor = await connection.execute(
                "SELECT password_hash FROM users WHERE id = %s LIMIT 1",
                (user["id"],),
            )
            row = await cursor.fetchone()
            if row is None or not await verify_password(password, row["password_hash"]):
                return JSONResponse(
                    {"error": "Password is incorrect."}, status_code=401
                )
            await connection.execute("DELETE FROM users WHERE id = %s", (user["id"],))
        response = JSONResponse({"deleted": True})
        await destroy_session(request, response)
        return response
    except Exception:
        return JSONResponse({"error": "Could not delete the account."}, status_code=500)
