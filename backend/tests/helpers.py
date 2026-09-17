from collections.abc import Callable
from typing import Any


def current_user(user: dict[str, Any] | None = None):
    payload = {"id": "user-id"}
    if user is not None:
        payload.update(user)

    async def handler(_request):
        return payload

    return handler


async def anonymous(_request):
    return None


class FakeCursor:
    def __init__(self, result: Any = None):
        if isinstance(result, list):
            self.rows = result
        elif result is None:
            self.rows = []
        else:
            self.rows = [result]

    async def fetchone(self):
        return self.rows[0] if self.rows else None

    async def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(
        self,
        result: Any = None,
        handler: Callable[[str, Any], Any] | None = None,
    ):
        self.result = result
        self.handler = handler
        self.calls: list[tuple[str, Any]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def execute(self, query, parameters=()):
        self.calls.append((query, parameters))
        if self.handler is not None:
            return FakeCursor(self.handler(query, parameters))
        return FakeCursor(self.result)


class FakePool:
    def __init__(
        self,
        result: Any = None,
        handler: Callable[[str, Any], Any] | None = None,
    ):
        self.connection_value = FakeConnection(result=result, handler=handler)

    def connection(self):
        return self.connection_value


def patch_pool(monkeypatch, *targets, result: Any = None, handler=None) -> FakePool:
    pool = FakePool(result=result, handler=handler)

    async def fake_pool():
        return pool

    for target in targets:
        monkeypatch.setattr(target, "get_pool", fake_pool)
    return pool
