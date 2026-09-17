import asyncio
import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

from fastapi import Request, Response

from .config import (
    SCRYPT_DKLEN,
    SCRYPT_N,
    SCRYPT_P,
    SCRYPT_R,
    SCRYPT_SALT_BYTES,
    SESSION_TOKEN_BYTES,
    get_settings,
)
from .database import get_pool
from .util import isoformat

AuthAction = Literal["login", "register"]


def _scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        password.encode(),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )


async def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SCRYPT_SALT_BYTES)
    derived_key = await asyncio.to_thread(_scrypt, password, salt)
    return f"scrypt:{salt.hex()}:{derived_key.hex()}"


async def verify_password(password: str, stored_hash: str) -> bool:
    parts = stored_hash.split(":")
    if len(parts) != 3 or parts[0] != "scrypt":
        return False
    try:
        salt = bytes.fromhex(parts[1])
        expected = bytes.fromhex(parts[2])
    except ValueError:
        return False
    actual = await asyncio.to_thread(_scrypt, password, salt)
    return len(expected) == len(actual) and hmac.compare_digest(expected, actual)


def is_password_valid(password: str) -> bool:
    settings = get_settings()
    return settings.password_min_length <= len(password) <= settings.password_max_length


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _random_token(size: int) -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(size)).decode().rstrip("=")


def public_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "email": row["email"],
        "createdAt": isoformat(row["created_at"]),
    }


def _cookie_kwargs() -> dict[str, Any]:
    settings = get_settings()
    return {
        "httponly": True,
        "secure": settings.secure_cookies,
        "samesite": settings.session_cookie_samesite,
        "path": settings.session_cookie_path,
    }


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_seconds,
        **_cookie_kwargs(),
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(get_settings().session_cookie_name, **_cookie_kwargs())


async def create_session(response: Response, user_id: str) -> None:
    settings = get_settings()
    token = _random_token(SESSION_TOKEN_BYTES)
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.session_ttl_seconds)
    pool = await get_pool()
    async with pool.connection() as connection:
        await connection.execute("DELETE FROM user_sessions WHERE expires_at <= NOW()")
        await connection.execute(
            """
            INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
            VALUES (%s, %s, %s, %s)
            """,
            (uuid4(), user_id, _token_hash(token), expires_at),
        )
    set_session_cookie(response, token)


async def get_current_user(request: Request) -> dict[str, Any] | None:
    token = request.cookies.get(get_settings().session_cookie_name)
    if not token:
        return None
    pool = await get_pool()
    async with pool.connection() as connection:
        cursor = await connection.execute(
            """
            SELECT users.id, users.name, users.email, users.created_at
            FROM user_sessions
            JOIN users ON users.id = user_sessions.user_id
            WHERE user_sessions.token_hash = %s
              AND user_sessions.expires_at > NOW()
            LIMIT 1
            """,
            (_token_hash(token),),
        )
        row = await cursor.fetchone()
    return public_user(row) if row else None


async def destroy_session(request: Request, response: Response) -> None:
    token = request.cookies.get(get_settings().session_cookie_name)
    if token:
        pool = await get_pool()
        async with pool.connection() as connection:
            await connection.execute(
                """
                DELETE FROM user_sessions
                WHERE token_hash = %s OR expires_at <= NOW()
                """,
                (_token_hash(token),),
            )
    clear_session_cookie(response)


def _attempt_count(row: dict[str, Any] | None) -> int:
    if not row:
        return 0
    value = row.get("n")
    return int(value) if value is not None else 0


async def auth_attempt_count(
    connection: Any,
    action: AuthAction,
    *,
    email: str | None = None,
    ip_address: str | None = None,
    succeeded: bool | None = False,
) -> int:
    clauses = ["action = %s", "created_at > NOW() - (%s * INTERVAL '1 minute')"]
    parameters: list[Any] = [action, get_settings().login_window_minutes]
    if succeeded is not None:
        clauses.append("succeeded = %s")
        parameters.append(succeeded)
    identity = []
    if email:
        identity.append("email = %s")
        parameters.append(email)
    if ip_address:
        identity.append("ip_address = %s")
        parameters.append(ip_address)
    if identity:
        clauses.append(f"({' OR '.join(identity)})")
    cursor = await connection.execute(
        f"""
        SELECT COUNT(*)::int AS n
        FROM auth_attempts
        WHERE {" AND ".join(clauses)}
        """,
        tuple(parameters),
    )
    return _attempt_count(await cursor.fetchone())


async def record_auth_attempt(
    connection: Any,
    action: AuthAction,
    email: str,
    ip_address: str,
    succeeded: bool,
) -> None:
    await connection.execute(
        """
        INSERT INTO auth_attempts (id, email, ip_address, action, succeeded)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (uuid4(), email, ip_address, action, succeeded),
    )


async def login_locked(connection: Any, email: str, ip_address: str) -> bool:
    count = await auth_attempt_count(
        connection, "login", email=email, ip_address=ip_address, succeeded=False
    )
    return count >= get_settings().login_max_attempts


async def register_locked(connection: Any, ip_address: str) -> bool:
    count = await auth_attempt_count(
        connection,
        "register",
        ip_address=ip_address,
        succeeded=None,
    )
    return count >= get_settings().register_max_attempts
