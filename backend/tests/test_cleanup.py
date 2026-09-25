import asyncio
import logging

import pytest

from app import cleanup
from app.cleanup import cleanup_loop, purge_expired_data
from app.config import get_settings
from tests.helpers import patch_pool


async def test_purge_skips_when_database_is_unconfigured(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()
    called = []

    async def boom():
        called.append("pool")
        raise AssertionError("should not open a pool")

    monkeypatch.setattr("app.cleanup.get_pool", boom)
    await purge_expired_data()
    assert called == []


async def test_purge_expired_data_deletes_sessions_history_and_attempts(
    monkeypatch,
):
    monkeypatch.setenv("DATABASE_URL", "postgresql://example")
    get_settings.cache_clear()
    from app import cleanup

    pool = patch_pool(monkeypatch, cleanup)
    await purge_expired_data()
    queries = " ".join(query for query, _parameters in pool.connection_value.calls)
    assert "DELETE FROM user_sessions" in queries
    assert "DELETE FROM auth_attempts" in queries
    assert "DELETE FROM review_history" in queries
    assert "DELETE FROM inference_requests" in queries


async def test_cleanup_loop_logs_failures_and_reraises_cancel(monkeypatch, caplog):
    calls = {"sleep": 0, "purge": 0}

    async def fake_sleep(_seconds):
        calls["sleep"] += 1
        if calls["sleep"] > 2:
            raise AssertionError("loop should have stopped")

    async def fake_purge():
        calls["purge"] += 1
        if calls["purge"] == 1:
            raise RuntimeError("database down")
        raise asyncio.CancelledError

    monkeypatch.setattr(cleanup.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(cleanup, "purge_expired_data", fake_purge)

    with caplog.at_level(logging.ERROR):
        with pytest.raises(asyncio.CancelledError):
            await cleanup_loop()

    assert calls["purge"] == 2
    assert "Scheduled retention cleanup failed" in caplog.text
