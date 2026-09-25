from fastapi import Request

from app.config import (
    API_CONTENT_SECURITY_POLICY,
    HSTS_VALUE,
    REFERRER_POLICY,
    X_CONTENT_TYPE_OPTIONS,
    X_FRAME_OPTIONS,
    get_settings,
)
from app.routes import auth as auth_routes
from app.security import (
    CsrfOriginMiddleware,
    SecurityHeadersMiddleware,
    client_ip,
    has_session_cookie,
    origin_allowed,
    request_origin,
)
from tests.helpers import current_user


def test_security_headers_on_health(client):
    response = client.get("/healthz")
    assert response.headers["content-security-policy"] == API_CONTENT_SECURITY_POLICY
    assert response.headers["x-frame-options"] == X_FRAME_OPTIONS
    assert response.headers["x-content-type-options"] == X_CONTENT_TYPE_OPTIONS
    assert response.headers["referrer-policy"] == REFERRER_POLICY
    assert "geolocation=()" in response.headers["permissions-policy"]
    assert "strict-transport-security" not in response.headers


def test_hsts_is_set_in_production(client, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    response = client.get("/healthz")
    assert response.headers["strict-transport-security"] == HSTS_VALUE


def test_csrf_rejects_cookie_post_from_unknown_origin(client):
    response = client.post(
        "/api/auth/logout",
        headers={
            "origin": "https://evil.example",
            "cookie": "ai_session=token",
        },
    )
    assert response.status_code == 403
    assert response.json() == {"error": "Request origin is not allowed."}


def test_csrf_allows_matching_origin(client, monkeypatch):
    monkeypatch.setattr(auth_routes, "get_current_user", current_user())

    async def destroy(_request, response):
        response.delete_cookie("ai_session", path="/")

    monkeypatch.setattr(auth_routes, "destroy_session", destroy)
    response = client.post(
        "/api/auth/logout",
        headers={
            "origin": "http://localhost:8022",
            "cookie": "ai_session=token",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"signedOut": True}


def test_origin_helpers():
    assert origin_allowed("http://localhost:8022")
    assert not origin_allowed("https://evil.example")
    assert not origin_allowed(None)
    assert (
        request_origin({"origin": "https://review.example/"})
        == "https://review.example"
    )
    assert request_origin({"referer": "http://localhost:8022/sign-in"}) == (
        "http://localhost:8022"
    )
    assert has_session_cookie("ai_session=abc; other=1")
    assert not has_session_cookie("other=1")


async def test_csrf_and_header_middleware_pass_non_http_scopes():
    seen = []

    async def inner(scope, _receive, _send):
        seen.append(scope["type"])

    async def receive():
        raise AssertionError("unused")

    async def send(_message):
        raise AssertionError("unused")

    await CsrfOriginMiddleware(inner)({"type": "lifespan"}, receive, send)
    await SecurityHeadersMiddleware(inner)({"type": "lifespan"}, receive, send)
    assert seen == ["lifespan", "lifespan"]


def test_client_ip_uses_forwarded_header_when_trusted(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [(b"x-forwarded-for", b"203.0.113.9, 10.0.0.1")],
            "client": ("127.0.0.1", 1234),
        }
    )
    assert client_ip(request) == "203.0.113.9"


def test_client_ip_falls_back_when_forwarded_header_is_empty(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "1")
    get_settings.cache_clear()
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": [],
            "client": ("127.0.0.1", 1234),
        }
    )
    assert client_ip(request) == "127.0.0.1"


def test_client_ip_is_unknown_without_a_peer():
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/healthz",
            "headers": [],
        }
    )
    assert request.client is None
    assert client_ip(request) == "unknown"


def test_request_origin_rejects_missing_and_invalid_referers():
    assert request_origin({}) is None
    assert request_origin({"referer": "   "}) is None
    assert request_origin({"referer": "/local"}) is None
    assert request_origin({"referer": "not-a-url"}) is None


async def test_security_headers_do_not_overwrite_existing_values():
    async def inner(_scope, _receive, send):
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"x-frame-options", b"SAMEORIGIN")],
            }
        )
        await send({"type": "http.response.body", "body": b"ok"})

    sent = []

    async def receive():
        return {"type": "http.request", "body": b""}

    async def send(message):
        sent.append(message)

    await SecurityHeadersMiddleware(inner)(
        {"type": "http", "method": "GET", "path": "/", "headers": []},
        receive,
        send,
    )
    headers = sent[0]["headers"]
    frame = [value for key, value in headers if key.lower() == b"x-frame-options"]
    assert frame == [b"SAMEORIGIN"]
    assert any(key.lower() == b"content-security-policy" for key, _value in headers)
