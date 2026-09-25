import asyncio
import logging

from .config import get_settings
from .database import get_pool

logger = logging.getLogger(__name__)


async def purge_expired_data() -> None:
    if not get_settings().database_url:
        return
    settings = get_settings()
    pool = await get_pool()
    async with pool.connection() as connection:
        await connection.execute("DELETE FROM user_sessions WHERE expires_at <= NOW()")
        await connection.execute(
            """
            DELETE FROM auth_attempts
            WHERE created_at < NOW() - (%s * INTERVAL '1 day')
            """,
            (settings.auth_attempts_retention_days,),
        )
        await connection.execute(
            """
            DELETE FROM review_history
            WHERE created_at < NOW() - (%s * INTERVAL '1 day')
            """,
            (settings.history_retention_days,),
        )
        await connection.execute(
            """
            DELETE FROM inference_requests
            WHERE created_at < NOW() - (%s * INTERVAL '1 day')
            """,
            (settings.inference_requests_retention_days,),
        )


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(get_settings().cleanup_interval_seconds)
        try:
            await purge_expired_data()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Scheduled retention cleanup failed")
