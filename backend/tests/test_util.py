from datetime import UTC, datetime

from fastapi import Request

from app.util import is_number, isoformat, json_object, now_iso


def test_is_number_rejects_bools():
    assert is_number(1)
    assert is_number(1.5)
    assert not is_number(True)
    assert not is_number("1")


def test_now_iso_uses_utc():
    stamp = now_iso()
    parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    assert parsed.tzinfo == UTC
    assert isoformat(parsed) == stamp


async def test_json_object_returns_empty_dict_for_invalid_payloads():
    async def invalid_json():
        return {"type": "http.request", "body": b"not-json"}

    invalid = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/",
            "headers": [(b"content-type", b"application/json")],
        },
        invalid_json,
    )
    assert await json_object(invalid) == {}

    async def json_array():
        return {"type": "http.request", "body": b"[1]"}

    array = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/",
            "headers": [(b"content-type", b"application/json")],
        },
        json_array,
    )
    assert await json_object(array) == {}
