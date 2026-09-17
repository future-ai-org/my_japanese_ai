import asyncio
import json
import logging
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .cleanup import cleanup_loop
from .config import APP_TITLE, HEALTH_PATHS, get_settings
from .database import close_pool
from .routes.auth import router as auth_router
from .routes.history import router as history_router
from .security import CsrfOriginMiddleware, SecurityHeadersMiddleware

logger = logging.getLogger(__name__)


class MaxBodySizeMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int | None = None) -> None:
        self.app = app
        self._max_bytes = max_bytes

    @property
    def max_bytes(self) -> int:
        return (
            self._max_bytes
            if self._max_bytes is not None
            else get_settings().max_request_bytes
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        length = dict(scope.get("headers", [])).get(b"content-length")
        if length is not None and int(length) > self.max_bytes:
            await self._reject(send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise BodyTooLargeError
            return message

        try:
            await self.app(scope, limited_receive, send)
        except BodyTooLargeError:
            await self._reject(send)

    @staticmethod
    async def _reject(send: Send) -> None:
        body = json.dumps({"error": "Request body too large."}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


class BodyTooLargeError(Exception):
    pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    for warning in settings.production_config_warnings():
        logger.warning("%s", warning)
    cleanup_task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task
        await close_pool()


app = FastAPI(
    title=APP_TITLE,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)
app.add_middleware(MaxBodySizeMiddleware)
app.add_middleware(CsrfOriginMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.include_router(auth_router)
app.include_router(history_router)


def _health_payload() -> dict[str, Any]:
    return {
        "status": "ok",
        "databaseConfigured": bool(get_settings().database_url),
    }


for _index, _health_path in enumerate(HEALTH_PATHS):
    app.add_api_route(
        _health_path,
        _health_payload,
        methods=["GET", "HEAD"],
        name=f"health_{_index}",
    )


@app.exception_handler(405)
async def method_not_allowed(_: Request, exception: Exception) -> JSONResponse:
    headers = getattr(exception, "headers", None)
    return JSONResponse(
        {"error": "Method not allowed."}, status_code=405, headers=headers
    )
