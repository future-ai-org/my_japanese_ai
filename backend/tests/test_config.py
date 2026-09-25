from app.config import (
    CUSTOM_DEFAULT_DESCRIPTION,
    CUSTOM_DEFAULT_LABEL,
    DEFAULT_DETAILED_MIN_TOKENS,
    DEFAULT_ENVIRONMENT,
    DEFAULT_HISTORY_RETENTION_DAYS,
    DEFAULT_LOGIN_MAX_ATTEMPTS,
    DEFAULT_MAX_CODE_CHARACTERS,
    DEFAULT_MAX_FINDINGS,
    DEFAULT_MAX_TOKENS,
    DEFAULT_MODEL_ID,
    DEFAULT_POOL_MIN_SIZE,
    DEFAULT_POOL_SIZE,
    DEFAULT_PUBLIC_ORIGIN,
    DEFAULT_RATE_LIMIT_WINDOW_MINUTES,
    DEFAULT_REQUESTS_PER_WINDOW,
    DEFAULT_SESSION_COOKIE,
    DEFAULT_SESSION_COOKIE_PATH,
    DEFAULT_SESSION_COOKIE_SAMESITE,
    DEFAULT_SESSION_TTL_SECONDS,
    DEFAULT_TEMPERATURE,
    DEFAULT_TIMEOUT_MS,
    FINDING_WARNING_SCORE,
    HISTORY_PAGE_SIZE,
    HTTP_MAX_CONNECTIONS,
    HTTP_MAX_KEEPALIVE_CONNECTIONS,
    HTTP_TIMEOUT_SECONDS,
    HUGGINGFACE_DEFAULT_DESCRIPTION,
    HUGGINGFACE_DEFAULT_LABEL,
    HUGGINGFACE_DEFAULT_URL,
    MAX_HISTORY_CODE_CHARACTERS,
    MAX_METRICS,
    MAX_REQUEST_BYTES,
    MAX_STARTUP_ATTEMPTS,
    MAX_TEMPERATURE,
    MIN_TEMPERATURE,
    MODAL_DEFAULT_DESCRIPTION,
    MODAL_DEFAULT_LABEL,
    NAME_MIN_LENGTH,
    PASSWORD_MIN_LENGTH,
    RETRY_MIN_SECONDS,
    REVIEW_JSON_SCHEMA_NAME,
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
    monkeypatch.delenv("INFERENCE_DETAILED_MIN_TOKENS", raising=False)
    monkeypatch.delenv("INFERENCE_FINDING_WARNING_SCORE", raising=False)
    monkeypatch.delenv("INFERENCE_MAX_METRICS", raising=False)
    monkeypatch.delenv("INFERENCE_RETRY_MIN_SECONDS", raising=False)
    monkeypatch.delenv("INFERENCE_REVIEW_JSON_SCHEMA_NAME", raising=False)
    monkeypatch.delenv("INFERENCE_MAX_CODE_CHARACTERS", raising=False)
    monkeypatch.delenv("INFERENCE_MAX_TOKENS", raising=False)
    monkeypatch.delenv("INFERENCE_MAX_FINDINGS", raising=False)
    monkeypatch.delenv("INFERENCE_TIMEOUT_MS", raising=False)
    monkeypatch.delenv("INFERENCE_RATE_LIMIT_REQUESTS", raising=False)
    monkeypatch.delenv("INFERENCE_RATE_LIMIT_WINDOW_MINUTES", raising=False)
    monkeypatch.delenv("INFERENCE_TEMPERATURE", raising=False)
    monkeypatch.delenv("INFERENCE_MAX_STARTUP_ATTEMPTS", raising=False)
    monkeypatch.delenv("MAX_REQUEST_BYTES", raising=False)
    monkeypatch.delenv("HISTORY_PAGE_SIZE", raising=False)
    monkeypatch.delenv("HISTORY_MAX_CODE_CHARACTERS", raising=False)
    monkeypatch.delenv("DATABASE_POOL_SIZE", raising=False)
    monkeypatch.delenv("DATABASE_POOL_MIN_SIZE", raising=False)
    monkeypatch.delenv("DATABASE_PREPARE_THRESHOLD", raising=False)
    monkeypatch.delenv("MODAL_URL", raising=False)
    monkeypatch.delenv("MODAL_API_KEY", raising=False)
    monkeypatch.delenv("HUGGINGFACE_URL", raising=False)
    monkeypatch.delenv("HUGGINGFACE_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_URL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("HTTP_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("HTTP_MAX_CONNECTIONS", raising=False)
    monkeypatch.delenv("HTTP_MAX_KEEPALIVE_CONNECTIONS", raising=False)

    settings = get_settings()
    assert settings.database_url is None
    assert settings.database_pool_size == DEFAULT_POOL_SIZE
    assert settings.database_pool_min_size == DEFAULT_POOL_MIN_SIZE
    assert settings.prepare_threshold is None
    assert settings.modal_provider is None
    assert settings.huggingface_provider is None
    assert settings.custom_provider is None
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
    assert settings.max_code_characters == DEFAULT_MAX_CODE_CHARACTERS
    assert settings.max_tokens == DEFAULT_MAX_TOKENS
    assert settings.max_findings == DEFAULT_MAX_FINDINGS
    assert settings.detailed_min_tokens == DEFAULT_DETAILED_MIN_TOKENS
    assert settings.timeout_ms == DEFAULT_TIMEOUT_MS
    assert settings.requests_per_window == DEFAULT_REQUESTS_PER_WINDOW
    assert settings.rate_limit_window_minutes == DEFAULT_RATE_LIMIT_WINDOW_MINUTES
    assert settings.temperature == DEFAULT_TEMPERATURE
    assert settings.finding_warning_score == FINDING_WARNING_SCORE
    assert settings.max_metrics == MAX_METRICS
    assert settings.retry_min_seconds == RETRY_MIN_SECONDS
    assert settings.review_json_schema_name == REVIEW_JSON_SCHEMA_NAME
    assert settings.max_request_bytes == MAX_REQUEST_BYTES
    assert settings.history_page_size == HISTORY_PAGE_SIZE
    assert settings.max_history_code_characters == MAX_HISTORY_CODE_CHARACTERS
    assert settings.max_startup_attempts == MAX_STARTUP_ATTEMPTS
    assert settings.http_timeout_seconds == HTTP_TIMEOUT_SECONDS
    assert settings.http_max_connections == HTTP_MAX_CONNECTIONS
    assert settings.http_max_keepalive_connections == HTTP_MAX_KEEPALIVE_CONNECTIONS


def test_settings_read_environment_overrides(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://example")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_PUBLIC_ORIGIN", "https://review.example")
    monkeypatch.setenv("APP_ALLOWED_ORIGINS", "https://extra.example")
    monkeypatch.setenv("SESSION_COOKIE", "custom_session")
    monkeypatch.setenv("SESSION_TTL_SECONDS", "3600")
    monkeypatch.setenv("INFERENCE_MAX_CODE_CHARACTERS", "2000")
    monkeypatch.setenv("INFERENCE_MAX_TOKENS", "256")
    monkeypatch.setenv("INFERENCE_MAX_FINDINGS", "1")
    monkeypatch.setenv("INFERENCE_TIMEOUT_MS", "12000")
    monkeypatch.setenv("INFERENCE_RATE_LIMIT_REQUESTS", "3")
    monkeypatch.setenv("INFERENCE_RATE_LIMIT_WINDOW_MINUTES", "15")
    monkeypatch.setenv("INFERENCE_TEMPERATURE", "0.8")
    monkeypatch.setenv("INFERENCE_MAX_STARTUP_ATTEMPTS", "4")
    monkeypatch.setenv("MAX_REQUEST_BYTES", "1024")
    monkeypatch.setenv("HISTORY_PAGE_SIZE", "25")
    monkeypatch.setenv("HISTORY_MAX_CODE_CHARACTERS", "1000")
    monkeypatch.setenv("DATABASE_POOL_SIZE", "12")
    monkeypatch.setenv("DATABASE_POOL_MIN_SIZE", "2")
    monkeypatch.setenv("DATABASE_PREPARE_THRESHOLD", "5")
    monkeypatch.setenv("HTTP_TIMEOUT_SECONDS", "12.5")
    monkeypatch.setenv("HTTP_MAX_CONNECTIONS", "7")
    monkeypatch.setenv("HTTP_MAX_KEEPALIVE_CONNECTIONS", "3")
    monkeypatch.setenv("MODAL_URL", "https://example.modal.run/v1/chat/completions")
    monkeypatch.setenv("MODAL_API_KEY", "secret")
    monkeypatch.delenv("MODAL_MODEL_ID", raising=False)
    monkeypatch.delenv("MODAL_LABEL", raising=False)
    monkeypatch.delenv("HUGGINGFACE_URL", raising=False)
    monkeypatch.delenv("HUGGINGFACE_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_URL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_API_KEY", raising=False)

    settings = get_settings()
    assert settings.database_url == "postgresql://example"
    assert settings.database_pool_size == 12
    assert settings.database_pool_min_size == 2
    assert settings.prepare_threshold == 5
    assert settings.provider("modal") is not None
    assert settings.provider("huggingface") is None
    assert settings.provider("custom") is None
    assert settings.provider("browser") is None
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
    assert settings.max_code_characters == 2000
    assert settings.max_tokens == 256
    assert settings.max_findings == 1
    assert settings.timeout_ms == 12_000
    assert settings.requests_per_window == 3
    assert settings.rate_limit_window_minutes == 15
    assert settings.temperature == 0.8
    assert settings.max_request_bytes == 1024
    assert settings.history_page_size == 25
    assert settings.max_history_code_characters == 1000
    assert settings.max_startup_attempts == 4
    assert settings.http_timeout_seconds == 12.5
    assert settings.http_max_connections == 7
    assert settings.http_max_keepalive_connections == 3
    assert settings.provider("modal").label == MODAL_DEFAULT_LABEL
    assert settings.provider("modal").description == MODAL_DEFAULT_DESCRIPTION
    assert settings.provider("modal").model_id == DEFAULT_MODEL_ID


def test_settings_ignore_invalid_and_non_positive_integers(monkeypatch):
    monkeypatch.setenv("INFERENCE_MAX_TOKENS", "nope")
    monkeypatch.setenv("INFERENCE_MAX_FINDINGS", "0")
    monkeypatch.setenv("INFERENCE_TIMEOUT_MS", "-5")
    monkeypatch.setenv("INFERENCE_TEMPERATURE", "nope")
    monkeypatch.setenv("HTTP_TIMEOUT_SECONDS", "0")
    monkeypatch.setenv("HTTP_MAX_CONNECTIONS", "-1")
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
    assert settings.max_tokens == DEFAULT_MAX_TOKENS
    assert settings.max_findings == DEFAULT_MAX_FINDINGS
    assert settings.timeout_ms == DEFAULT_TIMEOUT_MS
    assert settings.temperature == DEFAULT_TEMPERATURE
    assert settings.http_timeout_seconds == HTTP_TIMEOUT_SECONDS
    assert settings.http_max_connections == HTTP_MAX_CONNECTIONS
    assert settings.environment == DEFAULT_ENVIRONMENT
    assert settings.secure_cookies is False
    assert MIN_TEMPERATURE <= settings.temperature <= MAX_TEMPERATURE


def test_temperature_out_of_range_uses_default(monkeypatch):
    monkeypatch.setenv("INFERENCE_TEMPERATURE", "9")
    assert get_settings().temperature == DEFAULT_TEMPERATURE
    monkeypatch.setenv("INFERENCE_TEMPERATURE", "1.1")
    get_settings.cache_clear()
    assert get_settings().temperature == DEFAULT_TEMPERATURE
    monkeypatch.setenv("INFERENCE_TEMPERATURE", "-0.1")
    get_settings.cache_clear()
    assert get_settings().temperature == DEFAULT_TEMPERATURE
    monkeypatch.setenv("HTTP_TIMEOUT_SECONDS", "nope")
    get_settings.cache_clear()
    assert get_settings().http_timeout_seconds == HTTP_TIMEOUT_SECONDS


def test_pool_min_size_cannot_exceed_max_size(monkeypatch):
    monkeypatch.setenv("DATABASE_POOL_SIZE", "4")
    monkeypatch.setenv("DATABASE_POOL_MIN_SIZE", "10")
    monkeypatch.setenv("DATABASE_PREPARE_THRESHOLD", "")
    settings = get_settings()
    assert settings.database_pool_size == 4
    assert settings.database_pool_min_size == 4
    assert settings.prepare_threshold is None


def test_custom_provider_defaults(monkeypatch):
    monkeypatch.delenv("MODAL_URL", raising=False)
    monkeypatch.delenv("MODAL_API_KEY", raising=False)
    monkeypatch.setenv(
        "CUSTOM_INFERENCE_URL", "https://example.test/v1/chat/completions"
    )
    monkeypatch.setenv("CUSTOM_INFERENCE_API_KEY", "custom-secret")
    monkeypatch.delenv("CUSTOM_INFERENCE_LABEL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_DESCRIPTION", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_MODEL_ID", raising=False)

    provider = get_settings().custom_provider
    assert provider is not None
    assert provider.label == CUSTOM_DEFAULT_LABEL
    assert provider.description == CUSTOM_DEFAULT_DESCRIPTION
    assert provider.model_id == DEFAULT_MODEL_ID


def test_bool_env_reads_explicit_flags(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "yes")
    settings = get_settings()
    assert settings.trust_proxy_headers is True

    monkeypatch.setenv("TRUST_PROXY_HEADERS", "off")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.trust_proxy_headers is False


def test_huggingface_provider_uses_default_url(monkeypatch):
    monkeypatch.delenv("MODAL_URL", raising=False)
    monkeypatch.delenv("MODAL_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_URL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("HUGGINGFACE_URL", raising=False)
    monkeypatch.setenv("HUGGINGFACE_API_KEY", "hf_secret")
    monkeypatch.delenv("HUGGINGFACE_LABEL", raising=False)
    monkeypatch.delenv("HUGGINGFACE_DESCRIPTION", raising=False)
    monkeypatch.delenv("HUGGINGFACE_MODEL_ID", raising=False)

    provider = get_settings().huggingface_provider
    assert provider is not None
    assert provider.id == "huggingface"
    assert provider.url == HUGGINGFACE_DEFAULT_URL
    assert provider.label == HUGGINGFACE_DEFAULT_LABEL
    assert provider.description == HUGGINGFACE_DEFAULT_DESCRIPTION
    assert provider.model_id == DEFAULT_MODEL_ID
    assert provider.json_schema is False
    assert get_settings().provider("huggingface") is provider


def test_session_path_samesite_and_auth_limits_from_env(monkeypatch):
    monkeypatch.setenv("SESSION_COOKIE_PATH", "/api")
    monkeypatch.setenv("SESSION_COOKIE_SAMESITE", "strict")
    monkeypatch.setenv("AUTH_PASSWORD_MIN_LENGTH", "12")
    monkeypatch.setenv("INFERENCE_DETAILED_MIN_TOKENS", "400")
    monkeypatch.setenv("INFERENCE_REVIEW_JSON_SCHEMA_NAME", "review_schema")
    settings = get_settings()
    assert settings.session_cookie_path == "/api"
    assert settings.session_cookie_samesite == "strict"
    assert settings.password_min_length == 12
    assert settings.detailed_min_tokens == 400
    assert settings.review_json_schema_name == "review_schema"


def test_invalid_session_path_and_samesite_use_defaults(monkeypatch):
    monkeypatch.setenv("SESSION_COOKIE_PATH", "relative")
    monkeypatch.setenv("SESSION_COOKIE_SAMESITE", "weird")
    settings = get_settings()
    assert settings.session_cookie_path == DEFAULT_SESSION_COOKIE_PATH
    assert settings.session_cookie_samesite == DEFAULT_SESSION_COOKIE_SAMESITE


def test_production_config_warnings_for_localhost(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_PUBLIC_ORIGIN", "http://localhost:8022")
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
    monkeypatch.setenv("APP_PUBLIC_ORIGIN", "http://localhost:8022")
    assert get_settings().production_config_warnings() == []
