import asyncio

import httpx

from .config import get_settings

_client: httpx.AsyncClient | None = None
_lock: asyncio.Lock | None = None


def _client_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


def _new_client() -> httpx.AsyncClient:
    settings = get_settings()
    return httpx.AsyncClient(
        timeout=httpx.Timeout(settings.http_timeout_seconds),
        limits=httpx.Limits(
            max_connections=settings.http_max_connections,
            max_keepalive_connections=settings.http_max_keepalive_connections,
        ),
    )


async def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is not None and not _client.is_closed:
        return _client
    async with _client_lock():
        if _client is None or _client.is_closed:
            _client = _new_client()
        return _client


async def close_http_client() -> None:
    global _client
    if _client is None:
        return
    client = _client
    _client = None
    await client.aclose()
