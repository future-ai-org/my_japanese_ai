import asyncio

import pytest

from app import database


@pytest.fixture(autouse=True)
def reset_pool():
    database._pool = None
    yield
    database._pool = None


async def test_get_pool_requires_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL is not configured"):
        await database.get_pool()


async def test_get_pool_opens_once_and_close_resets(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://example")
    monkeypatch.setenv("DATABASE_POOL_SIZE", "8")
    monkeypatch.setenv("DATABASE_POOL_MIN_SIZE", "1")
    monkeypatch.setenv("DATABASE_PREPARE_THRESHOLD", "5")
    opened: list[str] = []
    created: list[dict] = []

    class FakePool:
        def __init__(self, **kwargs):
            created.append(kwargs)

        async def open(self):
            opened.append("open")

        async def close(self):
            opened.append("close")

    monkeypatch.setattr(database, "AsyncConnectionPool", FakePool)

    first = await database.get_pool()
    second = await database.get_pool()
    assert first is second
    assert opened == ["open"]
    assert created[0]["min_size"] == 1
    assert created[0]["max_size"] == 8
    assert created[0]["kwargs"]["prepare_threshold"] == 5

    await database.close_pool()
    assert database._pool is None
    assert opened == ["open", "close"]

    await database.close_pool()
    assert opened == ["open", "close"]


async def test_concurrent_get_pool_opens_once(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://example")
    opened: list[str] = []

    class FakePool:
        def __init__(self, **_kwargs):
            pass

        async def open(self):
            opened.append("open")
            await asyncio.sleep(0)

        async def close(self):
            pass

    monkeypatch.setattr(database, "AsyncConnectionPool", FakePool)
    first, second = await asyncio.gather(database.get_pool(), database.get_pool())
    assert first is second
    assert opened == ["open"]
    await database.close_pool()
