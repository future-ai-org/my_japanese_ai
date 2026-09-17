from app.config import (
    DEFAULT_ENVIRONMENT,
    DEFAULT_HISTORY_RETENTION_DAYS,
    DEFAULT_LOGIN_MAX_ATTEMPTS,
    DEFAULT_POOL_MIN_SIZE,
    DEFAULT_POOL_SIZE,
    DEFAULT_PUBLIC_ORIGIN,
    DEFAULT_SESSION_COOKIE,
    DEFAULT_SESSION_COOKIE_PATH,
    DEFAULT_SESSION_COOKIE_SAMESITE,
    DEFAULT_SESSION_TTL_SECONDS,
    EXPORT_MAX_REVIEWS,
    HISTORY_PAGE_SIZE,
    MAX_HISTORY_CODE_CHARACTERS,
    MAX_REQUEST_BYTES,
    NAME_MIN_LENGTH,
    PASSWORD_MIN_LENGTH,
    get_settings,
)


def test_settings_use_documented_defaults(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("SESSION_COOKIE", raising=False)
    monkeypatch.delenv("SESSION_COOKIE_PATH", raising=False)
    monkeypatch.delenv("SESSION_COOKIE_SAMESITE", raising=False)
    monkeypatch.delenv("SESSION_TTL_SECONDS", raising=False)
    monkeypatch.delenv("AUTH_NAME_MIN_LENGTH", raising=False)
    monkeypatch.delenv("AUTH_PASSWORD_MIN_LENGTH", raising=False)
    monkeypatch.delenv("MAX_REQUEST_BYTES", raising=False)
    monkeypatch.delenv("HISTORY_PAGE_SIZE", raising=False)
    monkeypatch.delenv("EXPORT_MAX_REVIEWS", raising=False)
    monkeypatch.delenv("HISTORY_MAX_CODE_CHARACTERS", raising=False)
    monkeypatch.delenv("DATABASE_POOL_SIZE", raising=False)
    monkeypatch.delenv("DATABASE_POOL_MIN_SIZE", raising=False)
    monkeypatch.delenv("DATABASE_PREPARE_THRESHOLD", raising=False)

    settings = get_settings()
    assert settings.database_url is None
    assert settings.database_pool_size == DEFAULT_POOL_SIZE
    assert settings.database_pool_min_size == DEFAULT_POOL_MIN_SIZE
    assert settings.prepare_threshold is None
    assert settings.environment == DEFAULT_ENVIRONMENT
    assert settings.session_cookie == DEFAULT_SESSION_COOKIE
    assert settings.session_cookie_name == DEFAULT_SESSION_COOKIE
    assert settings.session_cookie_path == DEFAULT_SESSION_COOKIE_PATH
    assert settings.session_cookie_samesite == DEFAULT_SESSION_COOKIE_SAMESITE
    assert settings.public_origin == DEFAULT_PUBLIC_ORIGIN
    assert DEFAULT_PUBLIC_ORIGIN in settings.allowed_origins
    assert settings.login_max_attempts == DEFAULT_LOGIN_MAX_ATTEMPTS
    assert settings.history_retention_days == DEFAULT_HISTORY_RETENTION_DAYS
    assert settings.trust_proxy_headers is False
    assert settings.session_ttl_seconds == DEFAULT_SESSION_TTL_SECONDS
    assert settings.secure_cookies is False
    assert settings.name_min_length == NAME_MIN_LENGTH
    assert settings.password_min_length == PASSWORD_MIN_LENGTH
    assert settings.max_request_bytes == MAX_REQUEST_BYTES
    assert settings.history_page_size == HISTORY_PAGE_SIZE
    assert settings.export_max_reviews == EXPORT_MAX_REVIEWS
    assert settings.max_history_code_characters == MAX_HISTORY_CODE_CHARACTERS


def test_settings_read_environment_overrides(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://example")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_PUBLIC_ORIGIN", "https://review.example")
    monkeypatch.setenv("APP_ALLOWED_ORIGINS", "https://extra.example")
    monkeypatch.setenv("SESSION_COOKIE", "custom_session")
    monkeypatch.setenv("SESSION_TTL_SECONDS", "3600")
    monkeypatch.setenv("MAX_REQUEST_BYTES", "1024")
    monkeypatch.setenv("HISTORY_PAGE_SIZE", "25")
    monkeypatch.setenv("EXPORT_MAX_REVIEWS", "50")
    monkeypatch.setenv("HISTORY_MAX_CODE_CHARACTERS", "1000")
    monkeypatch.setenv("DATABASE_POOL_SIZE", "12")
    monkeypatch.setenv("DATABASE_POOL_MIN_SIZE", "2")
    monkeypatch.setenv("DATABASE_PREPARE_THRESHOLD", "5")

    settings = get_settings()
    assert settings.database_url == "postgresql://example"
    assert settings.database_pool_size == 12
    assert settings.database_pool_min_size == 2
    assert settings.prepare_threshold == 5
    assert settings.environment == "production"
    assert settings.session_cookie == "custom_session"
    assert settings.session_cookie_name == "__Host-custom_session"
    assert settings.public_origin == "https://review.example"
    assert settings.allowed_origins == frozenset(
        {"https://review.example", "https://extra.example"}
    )
    assert settings.trust_proxy_headers is True
    assert settings.session_ttl_seconds == 3600
    assert settings.secure_cookies is True
    assert settings.max_request_bytes == 1024
    assert settings.history_page_size == 25
    assert settings.export_max_reviews == 50
    assert settings.max_history_code_characters == 1000


def test_settings_ignore_invalid_and_non_positive_integers(monkeypatch):
    monkeypatch.setenv("SESSION_COOKIE", "")
    monkeypatch.setenv("SESSION_TTL_SECONDS", "0")
    monkeypatch.setenv("DATABASE_POOL_SIZE", "0")
    monkeypatch.setenv("DATABASE_POOL_MIN_SIZE", "-1")
    monkeypatch.setenv("DATABASE_PREPARE_THRESHOLD", "nope")
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setenv("NODE_ENV", "test")

    settings = get_settings()
    assert settings.database_pool_size == DEFAULT_POOL_SIZE
    assert settings.database_pool_min_size == DEFAULT_POOL_MIN_SIZE
    assert settings.prepare_threshold is None
    assert settings.session_cookie == DEFAULT_SESSION_COOKIE
    assert settings.session_ttl_seconds == DEFAULT_SESSION_TTL_SECONDS
    assert settings.environment == DEFAULT_ENVIRONMENT
    assert settings.secure_cookies is False


def test_pool_min_size_cannot_exceed_max_size(monkeypatch):
    monkeypatch.setenv("DATABASE_POOL_SIZE", "4")
    monkeypatch.setenv("DATABASE_POOL_MIN_SIZE", "10")
    monkeypatch.setenv("DATABASE_PREPARE_THRESHOLD", "")
    settings = get_settings()
    assert settings.database_pool_size == 4
    assert settings.database_pool_min_size == 4
    assert settings.prepare_threshold is None


def test_bool_env_reads_explicit_flags(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "yes")
    settings = get_settings()
    assert settings.trust_proxy_headers is True

    monkeypatch.setenv("TRUST_PROXY_HEADERS", "off")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.trust_proxy_headers is False


def test_session_path_samesite_and_auth_limits_from_env(monkeypatch):
    monkeypatch.setenv("SESSION_COOKIE_PATH", "/api")
    monkeypatch.setenv("SESSION_COOKIE_SAMESITE", "strict")
    monkeypatch.setenv("AUTH_PASSWORD_MIN_LENGTH", "12")
    settings = get_settings()
    assert settings.session_cookie_path == "/api"
    assert settings.session_cookie_samesite == "strict"
    assert settings.password_min_length == 12


def test_invalid_session_path_and_samesite_use_defaults(monkeypatch):
    monkeypatch.setenv("SESSION_COOKIE_PATH", "relative")
    monkeypatch.setenv("SESSION_COOKIE_SAMESITE", "weird")
    settings = get_settings()
    assert settings.session_cookie_path == DEFAULT_SESSION_COOKIE_PATH
    assert settings.session_cookie_samesite == DEFAULT_SESSION_COOKIE_SAMESITE


def test_production_config_warnings_for_localhost(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_PUBLIC_ORIGIN", "http://localhost:8048")
    settings = get_settings()
    warnings = settings.production_config_warnings()
    assert any("APP_PUBLIC_ORIGIN" in item for item in warnings)


def test_production_config_warnings_empty_when_ready(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_PUBLIC_ORIGIN", "https://review.example")
    settings = get_settings()
    assert settings.production_config_warnings() == []


def test_production_config_warnings_skipped_outside_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("APP_PUBLIC_ORIGIN", "http://localhost:8048")
    assert get_settings().production_config_warnings() == []
