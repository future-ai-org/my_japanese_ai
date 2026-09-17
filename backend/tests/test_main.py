from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import MaxBodySizeMiddleware, app


async def test_middleware_passes_non_http_scopes():
    seen = []

    async def inner(scope, _receive, _send):
        seen.append(scope["type"])

    middleware = MaxBodySizeMiddleware(inner, max_bytes=8)

    async def receive():
        raise AssertionError("non-http scopes should not receive")

    async def send(_message):
        raise AssertionError("non-http scopes should not send")

    await middleware({"type": "lifespan"}, receive, send)
    assert seen == ["lifespan"]


async def test_middleware_ignores_non_body_messages():
    received = []

    async def inner(_scope, receive, send):
        received.append(await receive())
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = MaxBodySizeMiddleware(inner, max_bytes=8)
    sent = []

    async def receive():
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    await middleware({"type": "http", "headers": []}, receive, send)
    assert received == [{"type": "http.disconnect"}]
    assert sent[0]["status"] == 200


async def test_middleware_rejects_chunked_body_over_limit():
    async def inner(_scope, receive, _send):
        while True:
            message = await receive()
            if not message.get("more_body"):
                break

    middleware = MaxBodySizeMiddleware(inner, max_bytes=8)
    chunks = [
        {"type": "http.request", "body": b"1234", "more_body": True},
        {"type": "http.request", "body": b"56789", "more_body": False},
    ]
    sent = []

    async def receive():
        return chunks.pop(0)

    async def send(message):
        sent.append(message)

    await middleware({"type": "http", "headers": []}, receive, send)
    assert sent[0]["status"] == 413
    assert sent[1]["body"] == b'{"error": "Request body too large."}'


def test_middleware_reads_max_bytes_from_settings(monkeypatch):
    monkeypatch.setenv("MAX_REQUEST_BYTES", "16")
    get_settings.cache_clear()
    middleware = MaxBodySizeMiddleware(lambda *_args: None)
    assert middleware.max_bytes == 16


def test_lifespan_closes_shared_clients(monkeypatch):
    closed = []

    async def fake_close_pool():
        closed.append("pool")

    monkeypatch.setattr("app.main.close_pool", fake_close_pool)
    with TestClient(app):
        pass
    assert closed == ["pool"]


def test_openapi_and_docs_are_disabled(client):
    for path in ("/openapi.json", "/docs", "/redoc"):
        assert client.get(path).status_code == 404
