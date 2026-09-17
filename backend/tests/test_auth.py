import hashlib
from datetime import UTC, datetime

from fastapi import Request, Response

from app import auth
from app.auth import hash_password, public_user, verify_password
from app.config import (
    SCRYPT_DKLEN,
    SCRYPT_N,
    SCRYPT_P,
    SCRYPT_R,
    SCRYPT_SALT_BYTES,
    get_settings,
)
from tests.helpers import FakeConnection, patch_pool


async def test_password_hash_round_trip_and_node_format():
    stored = await hash_password("correct horse battery staple")
    algorithm, salt_hex, key_hex = stored.split(":")

    assert algorithm == "scrypt"
    assert len(bytes.fromhex(salt_hex)) == SCRYPT_SALT_BYTES
    assert len(bytes.fromhex(key_hex)) == SCRYPT_DKLEN
    assert await verify_password("correct horse battery staple", stored)
    assert not await verify_password("wrong", stored)


async def test_verifies_existing_node_scrypt_parameters():
    password = "existing-password"
    salt = bytes.fromhex("00112233445566778899aabbccddeeff")
    key = hashlib.scrypt(
        password.encode(),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    stored = f"scrypt:{salt.hex()}:{key.hex()}"
    assert await verify_password(password, stored)


async def test_verify_password_rejects_malformed_hashes():
    assert not await verify_password("secret", "not-scrypt")
    assert not await verify_password("secret", "scrypt:zz:00")
    assert not await verify_password("secret", "scrypt:00:zz")


def test_public_user_normalizes_string_and_naive_datetimes():
    assert public_user(
        {
            "id": "user-id",
            "name": "M",
            "email": "m@example.com",
            "created_at": "2026-01-01T00:00:00Z",
        }
    ) == {
        "id": "user-id",
        "name": "M",
        "email": "m@example.com",
        "createdAt": "2026-01-01T00:00:00.000Z",
    }
    assert (
        public_user(
            {
                "id": "user-id",
                "name": "M",
                "email": "m@example.com",
                "created_at": datetime(2026, 1, 1, 12, 0, 0),
            }
        )["createdAt"]
        == "2026-01-01T12:00:00.000Z"
    )


async def test_session_create_lookup_and_destroy(monkeypatch):
    row = {
        "id": "user-id",
        "name": "M",
        "email": "m@example.com",
        "created_at": datetime(2026, 1, 1, tzinfo=UTC),
    }
    pool = patch_pool(monkeypatch, auth, result=row)
    response = Response()
    await auth.create_session(response, "user-id")

    cookie = response.headers["set-cookie"]
    token = cookie.split("=", 1)[1].split(";", 1)[0]
    assert cookie.startswith("japanese_session=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "expires_at <= NOW()" in pool.connection_value.calls[0][0]
    insert_parameters = pool.connection_value.calls[1][1]
    assert insert_parameters[2] == hashlib.sha256(token.encode()).hexdigest()

    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/auth/session",
            "headers": [
                (b"cookie", f"{get_settings().session_cookie}={token}".encode())
            ],
        }
    )
    assert await auth.get_current_user(request) == {
        "id": "user-id",
        "name": "M",
        "email": "m@example.com",
        "createdAt": "2026-01-01T00:00:00.000Z",
    }

    logout_response = Response()
    await auth.destroy_session(request, logout_response)
    logout_query = pool.connection_value.calls[-1][0]
    assert "DELETE FROM user_sessions" in logout_query
    assert "expires_at <= NOW()" in logout_query
    assert "Max-Age=0" in logout_response.headers["set-cookie"]


async def test_missing_session_cookie_returns_anonymous_user():
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/auth/session",
            "headers": [],
        }
    )
    assert await auth.get_current_user(request) is None


async def test_destroy_session_without_cookie_still_clears_it():
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/logout",
            "headers": [],
        }
    )
    response = Response()
    await auth.destroy_session(request, response)
    assert "Max-Age=0" in response.headers["set-cookie"]


async def test_production_session_cookie_uses_host_prefix(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    patch_pool(monkeypatch, auth)
    response = Response()
    await auth.create_session(response, "user-id")
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("__Host-japanese_session=")
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=lax" in cookie
    assert "Domain=" not in cookie.split("japanese_session")[-1]


async def test_auth_attempt_count_optional_identity_filters():
    only_email = FakeConnection(result={"n": None})
    count = await auth.auth_attempt_count(only_email, "login", email="m@example.com")
    assert count == 0
    query, parameters = only_email.calls[0]
    assert "email = %s" in query
    assert "ip_address" not in query
    assert parameters[-1] == "m@example.com"

    neither = FakeConnection(result={"n": 2})
    assert await auth.auth_attempt_count(neither, "register", succeeded=None) == 2
    query, _parameters = neither.calls[0]
    assert "email = %s" not in query
    assert "ip_address" not in query
    assert "OR" not in query
