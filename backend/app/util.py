from datetime import UTC, datetime
from typing import Any

from fastapi import Request


def is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


async def json_object(request: Request) -> dict[str, Any]:
    try:
        value = await request.json()
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def isoformat(value: datetime | str) -> str:
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return (
        value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    )


def now_iso() -> str:
    return isoformat(datetime.now(UTC))
