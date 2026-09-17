import asyncio
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import get_settings

_pool: AsyncConnectionPool[Any] | None = None
_pool_lock: asyncio.Lock | None = None


def _lock() -> asyncio.Lock:
    global _pool_lock
    if _pool_lock is None:
        _pool_lock = asyncio.Lock()
    return _pool_lock


async def get_pool() -> AsyncConnectionPool[Any]:
    global _pool
    if _pool is not None:
        return _pool
    async with _lock():
        if _pool is not None:
            return _pool
        settings = get_settings()
        database_url = settings.database_url
        if not database_url:
            raise RuntimeError("DATABASE_URL is not configured.")
        pool = AsyncConnectionPool(
            conninfo=database_url,
            min_size=settings.database_pool_min_size,
            max_size=settings.database_pool_size,
            open=False,
            kwargs={
                "autocommit": True,
                "row_factory": dict_row,
                "prepare_threshold": settings.prepare_threshold,
            },
        )
        await pool.open()
        _pool = pool
        return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
