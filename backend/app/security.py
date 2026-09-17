from urllib.parse import urlparse

from fastapi import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import (
    API_CONTENT_SECURITY_POLICY,
    API_PREFIX,
    HSTS_VALUE,
    MAX_CLIENT_IP_CHARS,
    PERMISSIONS_POLICY,
    PRODUCTION_ENVIRONMENT,
    REFERRER_POLICY,
    UNSAFE_HTTP_METHODS,
    X_CONTENT_TYPE_OPTIONS,
    X_FRAME_OPTIONS,
    get_settings,
)


def client_ip(request: Request) -> str:
    settings = get_settings()
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",", 1)[0].strip()[:MAX_CLIENT_IP_CHARS]
    if request.client is not None:
        return request.client.host
    return "unknown"


def request_origin(headers: dict[str, str]) -> str | None:
    origin = headers.get("origin", "").strip().rstrip("/")
    if origin:
        return origin
    referer = headers.get("referer", "").strip()
    if not referer:
        return None
    parsed = urlparse(referer)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return None


def has_session_cookie(cookie_header: str) -> bool:
    prefix = f"{get_settings().session_cookie_name}="
    return any(part.strip().startswith(prefix) for part in cookie_header.split(";"))


def origin_allowed(origin: str | None) -> bool:
    return bool(origin) and origin in get_settings().allowed_origins


class CsrfOriginMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "").upper()
        path = scope.get("path", "")
        headers = {
            key.decode().lower(): value.decode()
            for key, value in scope.get("headers", [])
        }
        if (
            method in UNSAFE_HTTP_METHODS
            and path.startswith(f"{API_PREFIX}/")
            and has_session_cookie(headers.get("cookie", ""))
            and not origin_allowed(request_origin(headers))
        ):
            body = b'{"error": "Request origin is not allowed."}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 403,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                existing = {key.lower() for key, _value in headers}
                for name, value in _security_headers():
                    encoded_name = name.encode()
                    if encoded_name not in existing:
                        headers.append((encoded_name, value.encode()))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


def _security_headers() -> list[tuple[str, str]]:
    headers = [
        ("content-security-policy", API_CONTENT_SECURITY_POLICY),
        ("x-frame-options", X_FRAME_OPTIONS),
        ("x-content-type-options", X_CONTENT_TYPE_OPTIONS),
        ("referrer-policy", REFERRER_POLICY),
        ("permissions-policy", PERMISSIONS_POLICY),
    ]
    if get_settings().environment == PRODUCTION_ENVIRONMENT:
        headers.append(("strict-transport-security", HSTS_VALUE))
    return headers
