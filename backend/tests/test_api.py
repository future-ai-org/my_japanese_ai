from datetime import UTC, datetime

from app import auth as auth_module
from app.auth import public_user
from app.config import DEFAULT_TEMPERATURE, get_settings
from app.inference import CloudInferenceError
from app.routes import auth as auth_routes
from app.routes import history, review
from app.util import isoformat
from tests.helpers import anonymous, current_user, patch_pool

REVIEW_BODY = {
    "provider": "modal",
    "language": "python",
    "code": "pass",
    "parameters": {
        "temperature": DEFAULT_TEMPERATURE,
        "maxTokens": 256,
        "maxFindings": 1,
    },
}
HISTORY_RESULT = {
    "score": 100,
    "summary": "Good",
    "findings": [],
    "metrics": [],
    "durationMs": 1,
}
HISTORY_ID = "8f4cb94c-3396-4d33-9582-b16dcb884ec6"
HISTORY_ROW = {
    "id": HISTORY_ID,
    "language": "python",
    "code": "pass",
    "result": HISTORY_RESULT,
    "starred": False,
    "created_at": "2026-01-01T00:00:00+00:00",
}
HISTORY_SUMMARY_ROW = {
    "id": HISTORY_ID,
    "language": "python",
    "code_preview": "pass",
    "line_count": 1,
    "character_count": 4,
    "summary": "Good",
    "score": 100,
    "provider": "modal",
    "model_id": "test-model",
    "generation_config": {
        "temperature": 0.2,
        "maxTokens": 256,
        "maxFindings": 1,
    },
    "duration_ms": 1,
    "starred": False,
    "created_at": "2026-01-01T00:00:00+00:00",
}
USER_ROW = {
    "id": "user-id",
    "name": "Maya",
    "email": "m@example.com",
    "password_hash": "scrypt:00:00",
    "created_at": datetime(2026, 1, 1, tzinfo=UTC),
}


def _sign_in_review(monkeypatch):
    monkeypatch.setattr(review, "get_current_user", current_user())


def _sign_in_history(monkeypatch):
    monkeypatch.setattr(history, "get_current_user", current_user())


def _history_pool(monkeypatch, *, listed=HISTORY_SUMMARY_ROW, full=HISTORY_ROW):
    def handler(query, parameters):
        if "UPDATE review_history" in query:
            starred = parameters[0] if parameters else True
            return {**listed, "starred": starred}
        if "split_part" in query:
            return listed
        if "DELETE FROM review_history" in query:
            return {"id": HISTORY_ID}
        return full

    return patch_pool(monkeypatch, history, handler=handler)


async def instant_hash(_password):
    return "scrypt:00:00"


def test_health_check(client, monkeypatch):
    for path in ("/", "/healthz"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert client.head(path).status_code == 200

    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()
    healthz = client.get("/healthz").json()
    assert healthz == {"status": "ok", "databaseConfigured": False}


def test_provider_metadata_does_not_expose_credentials(client, modal_env):
    response = client.get("/api/review")
    assert response.status_code == 200
    providers = response.json()["providers"]
    assert [item["id"] for item in providers] == ["modal"]
    assert providers[0]["modelId"] == "test-model"
    assert "secret" not in response.text
    assert "example.modal.run" not in response.text
    assert "url" not in providers[0]
    assert "apiKey" not in providers[0]


def test_cloud_review_requires_authentication(client, monkeypatch):
    monkeypatch.setattr(review, "get_current_user", anonymous)
    response = client.post("/api/review", json=REVIEW_BODY)
    assert response.status_code == 401
    assert response.json() == {"error": "Sign in to use cloud inference."}


def test_cloud_review_rejects_invalid_payloads(client, monkeypatch, modal_env):
    _sign_in_review(monkeypatch)
    missing_parameters = client.post(
        "/api/review",
        json={"provider": "modal", "language": "python", "code": "pass"},
    )
    empty_code = client.post(
        "/api/review",
        json={
            **REVIEW_BODY,
            "code": "   ",
        },
    )
    oversized = client.post(
        "/api/review",
        json={
            **REVIEW_BODY,
            "parameters": {
                **REVIEW_BODY["parameters"],
                "maxTokens": get_settings().max_tokens + 1,
            },
        },
    )
    invalid_json = client.post(
        "/api/review",
        content=b"not-json",
        headers={"content-type": "application/json"},
    )
    unknown_language = client.post(
        "/api/review",
        json={**REVIEW_BODY, "language": "ruby"},
    )
    for response in (
        missing_parameters,
        empty_code,
        oversized,
        invalid_json,
        unknown_language,
    ):
        assert response.status_code == 400
        assert response.json() == {"error": "Invalid review request."}


def test_cloud_review_requires_configured_provider(client, monkeypatch):
    _sign_in_review(monkeypatch)
    monkeypatch.delenv("MODAL_URL", raising=False)
    monkeypatch.delenv("MODAL_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_URL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_API_KEY", raising=False)
    response = client.post("/api/review", json=REVIEW_BODY)
    assert response.status_code == 503
    assert response.json() == {
        "error": "The selected cloud provider is not configured."
    }


def test_cloud_review_rate_limit(client, monkeypatch, modal_env):
    _sign_in_review(monkeypatch)

    async def none_reserved(_user_id, _provider):
        return None

    monkeypatch.setattr(review, "reserve_cloud_request", none_reserved)
    response = client.post("/api/review", json=REVIEW_BODY)
    assert response.status_code == 429
    assert "Cloud review limit reached" in response.json()["error"]
    assert response.headers["retry-after"] == "3600"


def test_cloud_review_success_and_failure_contracts(client, monkeypatch, modal_env):
    _sign_in_review(monkeypatch)
    completed = []
    captured = []

    async def reserve(_user_id, _provider):
        return "reservation-id"

    async def complete(request_id, status, duration_ms):
        completed.append((request_id, status, duration_ms))

    async def succeed(*args, **kwargs):
        captured.append((args, kwargs))
        return {"score": 80, "summary": "Solid"}

    monkeypatch.setattr(review, "reserve_cloud_request", reserve)
    monkeypatch.setattr(review, "complete_cloud_request", complete)
    monkeypatch.setattr(review, "run_cloud_review", succeed)

    success = client.post("/api/review", json=REVIEW_BODY)
    assert success.status_code == 200
    assert success.json()["score"] == 80
    assert captured[0][0][:3] == ("modal", "python", "pass")
    assert captured[0][1] == {
        "temperature": 0.2,
        "max_tokens": 256,
        "max_findings": 1,
    }
    assert completed[0][0] == "reservation-id"
    assert completed[0][1] == "completed"

    async def fail(*_args, **_kwargs):
        raise CloudInferenceError(
            "Cloud inference timed out. Try again shortly.",
            logs=[{"id": "log-1", "message": "deadline", "stage": "cloud-http"}],
        )

    monkeypatch.setattr(review, "run_cloud_review", fail)
    failure = client.post("/api/review", json=REVIEW_BODY)
    assert failure.status_code == 502
    assert failure.json()["error"].startswith("Cloud inference timed out")
    assert failure.json()["diagnostics"]["logs"][0]["id"] == "log-1"
    assert completed[1][1] == "failed"

    async def boom(*_args, **_kwargs):
        raise ValueError("unexpected")

    monkeypatch.setattr(review, "run_cloud_review", boom)
    generic = client.post("/api/review", json=REVIEW_BODY)
    assert generic.status_code == 502
    assert generic.json() == {"error": "Cloud inference is temporarily unavailable."}


def test_cloud_review_ignores_complete_failure_after_error(
    client, monkeypatch, modal_env
):
    _sign_in_review(monkeypatch)

    async def reserve(_user_id, _provider):
        return "reservation-id"

    async def fail_complete(_request_id, _status, _duration_ms):
        raise RuntimeError("database down")

    async def fail_review(*_args, **_kwargs):
        raise CloudInferenceError("Cloud inference timed out. Try again shortly.")

    monkeypatch.setattr(review, "reserve_cloud_request", reserve)
    monkeypatch.setattr(review, "complete_cloud_request", fail_complete)
    monkeypatch.setattr(review, "run_cloud_review", fail_review)
    response = client.post("/api/review", json=REVIEW_BODY)
    assert response.status_code == 502
    assert response.json()["error"].startswith("Cloud inference timed out")


def test_cloud_review_generic_error_before_reservation(client, monkeypatch):
    async def boom(_request):
        raise RuntimeError("auth down")

    monkeypatch.setattr(review, "get_current_user", boom)
    response = client.post("/api/review", json=REVIEW_BODY)
    assert response.status_code == 502
    assert response.json() == {"error": "Cloud inference is temporarily unavailable."}


def test_cloud_inference_error_before_reservation(client, monkeypatch):
    async def boom(_request):
        raise CloudInferenceError("The selected cloud provider is not configured.")

    monkeypatch.setattr(review, "get_current_user", boom)
    response = client.post("/api/review", json=REVIEW_BODY)
    assert response.status_code == 502
    assert response.json() == {
        "error": "The selected cloud provider is not configured."
    }


def test_cloud_review_generic_error_ignores_complete_failure(
    client, monkeypatch, modal_env
):
    _sign_in_review(monkeypatch)

    async def reserve(_user_id, _provider):
        return "reservation-id"

    async def fail_complete(_request_id, _status, _duration_ms):
        raise RuntimeError("database down")

    async def boom(*_args, **_kwargs):
        raise ValueError("unexpected")

    monkeypatch.setattr(review, "reserve_cloud_request", reserve)
    monkeypatch.setattr(review, "complete_cloud_request", fail_complete)
    monkeypatch.setattr(review, "run_cloud_review", boom)
    response = client.post("/api/review", json=REVIEW_BODY)
    assert response.status_code == 502
    assert response.json() == {"error": "Cloud inference is temporarily unavailable."}


def test_history_requires_authentication(client, monkeypatch):
    monkeypatch.setattr(history, "get_current_user", anonymous)
    listed = client.get("/api/history")
    fetched = client.get(f"/api/history/{HISTORY_ID}")
    saved = client.post(
        "/api/history",
        json={"language": "python", "code": "pass", "result": HISTORY_RESULT},
    )
    starred = client.patch(f"/api/history/{HISTORY_ID}", json={"starred": True})
    deleted = client.delete(f"/api/history/{HISTORY_ID}")
    for response in (listed, fetched, saved, starred, deleted):
        assert response.status_code == 401
        assert response.json() == {"error": "Sign in to access history."}


def test_history_crud_contract(client, monkeypatch):
    _sign_in_history(monkeypatch)
    _history_pool(monkeypatch)

    listed = client.get("/api/history")
    fetched = client.get(f"/api/history/{HISTORY_ID}")
    saved = client.post(
        "/api/history",
        json={"language": "python", "code": "pass", "result": HISTORY_RESULT},
    )
    starred = client.patch(f"/api/history/{HISTORY_ID}", json={"starred": True})
    deleted = client.delete(f"/api/history/{HISTORY_ID}")

    assert listed.status_code == 200
    assert listed.json()[0] == {
        "id": HISTORY_ID,
        "language": "python",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "codePreview": "pass",
        "lineCount": 1,
        "characterCount": 4,
        "score": 100,
        "summary": "Good",
        "starred": False,
        "provider": "modal",
        "modelId": "test-model",
        "temperature": 0.2,
        "maxTokens": 256,
        "maxFindings": 1,
        "durationMs": 1,
    }
    assert fetched.status_code == 200
    assert fetched.json()["result"]["score"] == 100
    assert fetched.json()["starred"] is False
    assert saved.status_code == 201
    assert saved.json()["result"]["score"] == 100
    assert saved.json()["starred"] is False
    assert starred.status_code == 200
    assert starred.json()["starred"] is True
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}


def test_history_serializes_naive_datetimes(client, monkeypatch):
    _sign_in_history(monkeypatch)
    _history_pool(
        monkeypatch,
        listed={**HISTORY_SUMMARY_ROW, "created_at": datetime(2026, 1, 1, 12, 0, 0)},
    )
    listed = client.get("/api/history")
    assert listed.json()[0]["createdAt"] == "2026-01-01T12:00:00.000Z"


def test_history_invalid_identifier_and_payload(client, monkeypatch):
    _sign_in_history(monkeypatch)
    invalid_id = client.delete("/api/history/not-a-uuid")
    assert invalid_id.status_code == 400
    assert invalid_id.json() == {"error": "Invalid history identifier."}
    assert client.get("/api/history/not-a-uuid").status_code == 400
    invalid_star_id = client.patch("/api/history/not-a-uuid", json={"starred": True})
    assert invalid_star_id.status_code == 400

    invalid_star = client.patch(f"/api/history/{HISTORY_ID}", json={"starred": "yes"})
    assert invalid_star.status_code == 400
    assert invalid_star.json() == {"error": "Invalid favorite payload."}

    invalid_payload = client.post(
        "/api/history",
        json={"language": "python", "code": "pass", "result": {"score": 1}},
    )
    invalid_json = client.post(
        "/api/history",
        content=b"not-json",
        headers={"content-type": "application/json"},
    )
    unknown_language = client.post(
        "/api/history",
        json={"language": "ruby", "code": "pass", "result": HISTORY_RESULT},
    )
    assert invalid_payload.status_code == 400
    assert invalid_json.status_code == 400
    assert unknown_language.status_code == 400
    assert invalid_payload.json() == {"error": "Invalid review payload."}
    assert invalid_json.json() == {"error": "Invalid review payload."}
    assert unknown_language.json() == {"error": "Invalid review payload."}


def test_history_missing_entry(client, monkeypatch):
    _sign_in_history(monkeypatch)
    patch_pool(monkeypatch, history)
    deleted = client.delete(f"/api/history/{HISTORY_ID}")
    fetched = client.get(f"/api/history/{HISTORY_ID}")
    starred = client.patch(f"/api/history/{HISTORY_ID}", json={"starred": True})
    assert deleted.status_code == 404
    assert fetched.status_code == 404
    assert starred.status_code == 404
    assert deleted.json() == {"error": "History entry not found."}
    assert fetched.json() == {"error": "History entry not found."}
    assert starred.json() == {"error": "History entry not found."}


def test_history_service_errors(client, monkeypatch):
    async def boom(_request):
        raise RuntimeError("database down")

    monkeypatch.setattr(history, "get_current_user", boom)
    listed = client.get("/api/history")
    assert listed.status_code == 500
    assert listed.json() == {"error": "History service unavailable."}

    _sign_in_history(monkeypatch)

    async def boom_pool():
        raise RuntimeError("database down")

    monkeypatch.setattr(history, "get_pool", boom_pool)
    saved = client.post(
        "/api/history",
        json={"language": "python", "code": "pass", "result": HISTORY_RESULT},
    )
    deleted = client.delete(f"/api/history/{HISTORY_ID}")
    fetched = client.get(f"/api/history/{HISTORY_ID}")
    starred = client.patch(f"/api/history/{HISTORY_ID}", json={"starred": True})
    assert saved.status_code == 500
    assert deleted.status_code == 500
    assert fetched.status_code == 500
    assert starred.status_code == 500
    assert saved.json() == {"error": "History service unavailable."}
    assert deleted.json() == {"error": "History service unavailable."}
    assert fetched.json() == {"error": "History service unavailable."}
    assert starred.json() == {"error": "History service unavailable."}


def test_register_validation_preserves_error_contract(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "M", "email": "bad", "password": "short"},
    )
    assert response.status_code == 400
    assert response.json() == {
        "error": (
            f"Enter a valid name and email, and use a password of at least "
            f"{get_settings().password_min_length} characters."
        )
    }


def test_method_not_allowed_uses_api_error_shape(client):
    response = client.put("/api/auth/login")
    assert response.status_code == 405
    assert response.json() == {"error": "Method not allowed."}
    assert response.headers["allow"] == "POST"


def test_rejects_oversized_request_body(client):
    response = client.post(
        "/api/auth/login",
        content=b"x" * (get_settings().max_request_bytes + 1),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413
    assert response.json() == {"error": "Request body too large."}


def test_login_requires_credentials(client):
    response = client.post("/api/auth/login", json={})
    assert response.status_code == 400
    assert response.json() == {"error": "Email and password are required."}


def test_login_rejects_unknown_or_invalid_user(client, monkeypatch):
    patch_pool(monkeypatch, auth_routes)
    unknown = client.post(
        "/api/auth/login",
        json={"email": "m@example.com", "password": "password1"},
    )
    assert unknown.status_code == 401
    assert unknown.json() == {"error": "Invalid email or password."}

    async def reject(_password, _stored):
        return False

    patch_pool(monkeypatch, auth_routes, result=USER_ROW)
    monkeypatch.setattr(auth_routes, "verify_password", reject)
    invalid = client.post(
        "/api/auth/login",
        json={"email": "m@example.com", "password": "password1"},
    )
    assert invalid.status_code == 401
    assert invalid.json() == {"error": "Invalid email or password."}


def test_register_conflict_and_login_success(client, monkeypatch):
    def handler(query, _parameters):
        if "INSERT INTO users" in query:
            return None
        if "FROM users" in query:
            return USER_ROW
        return None

    patch_pool(monkeypatch, auth_routes, auth_module, handler=handler)
    monkeypatch.setattr(auth_routes, "hash_password", instant_hash)

    async def accept(_password, _stored):
        return True

    monkeypatch.setattr(auth_routes, "verify_password", accept)

    conflict = client.post(
        "/api/auth/register",
        json={"name": "Maya", "email": "m@example.com", "password": "password1"},
    )
    assert conflict.status_code == 409
    assert conflict.json() == {"error": "An account with this email already exists."}

    signed_in = client.post(
        "/api/auth/login",
        json={"email": "m@example.com", "password": "password1"},
    )
    assert signed_in.status_code == 200
    assert signed_in.json()["user"]["email"] == "m@example.com"
    assert "ai_session=" in signed_in.headers["set-cookie"]


def test_session_and_logout(client, monkeypatch):
    monkeypatch.setattr(auth_routes, "get_current_user", current_user())

    async def destroy(_request, response):
        response.delete_cookie("ai_session", path="/")

    monkeypatch.setattr(auth_routes, "destroy_session", destroy)
    session = client.get("/api/auth/session")
    assert session.status_code == 200
    assert session.json() == {"user": {"id": "user-id"}}

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200
    assert logout.json() == {"signedOut": True}


def test_register_success_sets_session(client, monkeypatch):
    user_row = {
        "id": "user-id",
        "name": "Maya",
        "email": "m@example.com",
        "created_at": datetime(2026, 1, 1, tzinfo=UTC),
    }

    def handler(query, _parameters):
        if "INSERT INTO users" in query:
            return user_row
        return None

    patch_pool(monkeypatch, auth_routes, auth_module, handler=handler)
    monkeypatch.setattr(auth_routes, "hash_password", instant_hash)
    response = client.post(
        "/api/auth/register",
        json={"name": "Maya", "email": "m@example.com", "password": "password1"},
    )
    assert response.status_code == 201
    assert response.json()["user"]["email"] == "m@example.com"
    assert "ai_session=" in response.headers["set-cookie"]


def test_auth_invalid_json_and_service_errors(client, monkeypatch):
    invalid = client.post(
        "/api/auth/login",
        content=b"not-json",
        headers={"content-type": "application/json"},
    )
    assert invalid.status_code == 400
    assert invalid.json() == {"error": "Email and password are required."}

    array_body = client.post(
        "/api/auth/login",
        json=["m@example.com", "password1"],
    )
    assert array_body.status_code == 400

    async def boom_pool():
        raise RuntimeError("database down")

    monkeypatch.setattr(auth_routes, "hash_password", instant_hash)
    monkeypatch.setattr(auth_routes, "get_pool", boom_pool)
    login = client.post(
        "/api/auth/login",
        json={"email": "m@example.com", "password": "password1"},
    )
    register = client.post(
        "/api/auth/register",
        json={"name": "Maya", "email": "m@example.com", "password": "password1"},
    )
    assert login.status_code == 500
    assert login.json() == {"error": "Could not sign in."}
    assert register.status_code == 500
    assert register.json() == {"error": "Could not create the account."}

    async def boom_user(_request):
        raise RuntimeError("session down")

    monkeypatch.setattr(auth_routes, "get_current_user", boom_user)
    session = client.get("/api/auth/session")
    assert session.status_code == 500
    assert session.json() == {"error": "Could not load the session."}

    async def boom_logout(_request, _response):
        raise RuntimeError("logout down")

    monkeypatch.setattr(auth_routes, "destroy_session", boom_logout)
    logout = client.post("/api/auth/logout")
    assert logout.status_code == 500
    assert logout.json() == {"error": "Could not sign out."}


def test_history_summary_serializes_optional_generation_config():
    compact = history._serialize_summary(
        {
            **HISTORY_SUMMARY_ROW,
            "code_preview": None,
            "summary": None,
            "score": None,
            "provider": None,
            "model_id": None,
            "generation_config": '{"temperature": 0.5, "maxTokens": 128}',
        }
    )
    assert compact["codePreview"] == ""
    assert compact["lineCount"] == 1
    assert compact["characterCount"] == 4
    assert compact["summary"] == ""
    assert compact["score"] == 0
    assert "provider" not in compact
    assert compact["temperature"] == 0.5
    assert compact["maxTokens"] == 128
    assert "maxFindings" not in compact
    assert compact["durationMs"] == 1

    missing_duration = history._serialize_summary(
        {**HISTORY_SUMMARY_ROW, "duration_ms": None}
    )
    assert "durationMs" not in missing_duration

    missing_counts = history._serialize_summary(
        {**HISTORY_SUMMARY_ROW, "line_count": None, "character_count": None}
    )
    assert "lineCount" not in missing_counts
    assert "characterCount" not in missing_counts

    skipped = history._serialize_summary(
        {
            **HISTORY_SUMMARY_ROW,
            "generation_config": {
                "temperature": True,
                "maxTokens": False,
                "maxFindings": "3",
            },
        }
    )
    assert "temperature" not in skipped
    assert "maxTokens" not in skipped
    assert "maxFindings" not in skipped

    invalid = history._serialize_summary(
        {**HISTORY_SUMMARY_ROW, "generation_config": "{not-json"}
    )
    assert "temperature" not in invalid
    assert isoformat("2026-01-01T00:00:00Z") == "2026-01-01T00:00:00.000Z"


def test_login_lockout_returns_429(client, monkeypatch):
    def handler(query, _parameters):
        if "COUNT(*)" in query:
            return {"n": 5}
        return None

    patch_pool(monkeypatch, auth_routes, handler=handler)
    response = client.post(
        "/api/auth/login",
        json={"email": "m@example.com", "password": "password1"},
    )
    assert response.status_code == 429
    assert response.json() == {"error": "Too many attempts. Try again shortly."}


def test_export_and_delete(client, monkeypatch):
    def handler(query, _parameters):
        if "FROM review_history" in query:
            return []
        if "password_hash" in query:
            return {"password_hash": "scrypt:00:00"}
        if "DELETE FROM users" in query:
            return {"id": "user-id"}
        return None

    patch_pool(monkeypatch, auth_routes, auth_module, handler=handler)
    monkeypatch.setattr(
        auth_routes, "get_current_user", current_user(public_user(USER_ROW))
    )

    async def accept(_password, _stored):
        return True

    monkeypatch.setattr(auth_routes, "verify_password", accept)

    exported = client.post("/api/auth/export")
    assert exported.status_code == 200
    assert exported.json()["user"]["email"] == "m@example.com"
    assert exported.json()["reviews"] == []

    deleted = client.post("/api/auth/delete", json={"password": "password1"})
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}


def test_register_lockout_returns_429(client, monkeypatch):
    def handler(query, _parameters):
        if "COUNT(*)" in query:
            return {"n": 5}
        return None

    monkeypatch.setattr(auth_routes, "hash_password", instant_hash)
    patch_pool(monkeypatch, auth_routes, handler=handler)
    response = client.post(
        "/api/auth/register",
        json={"name": "Maya", "email": "m@example.com", "password": "password1"},
    )
    assert response.status_code == 429
    assert response.json() == {"error": "Too many attempts. Try again shortly."}
    assert response.headers["retry-after"] == "900"


def test_account_route_validation_and_unauthenticated_contracts(client):
    delete = client.post("/api/auth/delete", json={})
    assert delete.status_code == 400
    assert delete.json() == {"error": "Enter your password to delete the account."}

    for path in (
        "/api/auth/export",
        "/api/auth/delete",
    ):
        payload = {} if path != "/api/auth/delete" else {"password": "password1"}
        response = client.post(path, json=payload)
        assert response.status_code == 401
        assert response.json() == {"error": "Sign in to manage your account."}


def test_account_route_invalid_tokens_and_wrong_password(client, monkeypatch):
    async def reject(_password, _stored):
        return False

    monkeypatch.setattr(
        auth_routes, "get_current_user", current_user({"id": "user-id"})
    )
    monkeypatch.setattr(auth_routes, "verify_password", reject)
    patch_pool(monkeypatch, auth_routes, result={"password_hash": "scrypt:00:00"})
    deleted = client.post("/api/auth/delete", json={"password": "password1"})
    assert deleted.status_code == 401
    assert deleted.json() == {"error": "Password is incorrect."}


def test_account_route_service_errors(client, monkeypatch):
    async def boom_user(_request):
        raise RuntimeError("session down")

    monkeypatch.setattr(auth_routes, "get_current_user", boom_user)
    exported = client.post("/api/auth/export")
    deleted = client.post("/api/auth/delete", json={"password": "password1"})
    assert exported.status_code == 500
    assert exported.json() == {"error": "Could not export account data."}
    assert deleted.status_code == 500
    assert deleted.json() == {"error": "Could not delete the account."}
