import asyncio

from app import http
from app.config import get_settings


async def test_http_client_is_reused_until_closed():
    first = await http.get_http_client()
    second = await http.get_http_client()
    assert first is second
    assert not first.is_closed
    assert first.timeout.read == get_settings().http_timeout_seconds

    await http.close_http_client()
    assert http._client is None

    await http.close_http_client()
    third = await http.get_http_client()
    assert third is not first
    await http.close_http_client()


async def test_get_http_client_replaces_closed_client():
    first = await http.get_http_client()
    await first.aclose()
    second = await http.get_http_client()
    assert second is not first
    assert not second.is_closed
    await http.close_http_client()


async def test_concurrent_get_http_client_returns_same_instance():
    http._client = None
    first, second = await asyncio.gather(http.get_http_client(), http.get_http_client())
    assert first is second
    await http.close_http_client()


async def test_get_http_client_reuses_client_created_while_waiting_for_lock():
    http._client = None
    lock = asyncio.Lock()
    await lock.acquire()
    http._lock = lock

    waiter = asyncio.create_task(http.get_http_client())
    await asyncio.sleep(0)
    assert not waiter.done()

    existing = http._new_client()
    http._client = existing
    lock.release()

    assert await waiter is existing
    await http.close_http_client()
