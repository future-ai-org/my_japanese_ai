import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

CloudProvider = Literal["modal", "huggingface", "custom"]

LANGUAGES = frozenset({"python", "javascript", "typescript", "go", "rust", "cpp"})
CLOUD_PROVIDER_IDS: tuple[CloudProvider, ...] = ("modal", "huggingface", "custom")
CLOUD_PROVIDERS = frozenset(CLOUD_PROVIDER_IDS)
FINDING_SEVERITIES = frozenset({"critical", "warning", "suggestion"})
RETRYABLE_PROVIDER_STATUSES = frozenset({502, 503})
REDACTED_HEADERS = frozenset(
    {
        "authorization",
        "cookie",
        "proxy-authorization",
        "set-cookie",
        "x-api-key",
    }
)
LOG_ERROR_KEYS = ("error", "message", "detail", "msg", "type", "code")
JSON_ERROR_OBJECT_KEYS = ("message", "type", "code")
JSON_ERROR_VALUE_KEYS = ("message", "detail", "msg")

DEFAULT_MODEL_ID = "SakanaAI/TinySwallow-1.5B-Instruct"
DEFAULT_SESSION_COOKIE = "ai_session"
DEFAULT_SESSION_COOKIE_PATH = "/"
DEFAULT_SESSION_COOKIE_SAMESITE = "lax"
HOST_COOKIE_PREFIX = "__Host-"
DEFAULT_ENVIRONMENT = "development"
PRODUCTION_ENVIRONMENT = "production"
DEFAULT_PUBLIC_ORIGIN = "http://localhost:8022"
DEFAULT_DETAILED_MIN_TOKENS = 384
REVIEW_JSON_SCHEMA_NAME = "code_review"
API_PREFIX = "/api"
API_AUTH_PREFIX = "/api/auth"
API_REVIEW_PREFIX = "/api/review"
API_HISTORY_PREFIX = "/api/history"
HEALTH_PATHS = ("/", "/healthz")
APP_TITLE = "AI Code Review API"
SESSION_SAMESITE_VALUES = frozenset({"lax", "strict", "none"})
MODAL_DEFAULT_LABEL = "Modal GPU Cloud"
MODAL_DEFAULT_DESCRIPTION = (
    "Runs on a dedicated Modal GPU. Submitted code is sent to this configured "
    "cloud service."
)
HUGGINGFACE_DEFAULT_LABEL = "Hugging Face Cloud"
HUGGINGFACE_DEFAULT_DESCRIPTION = (
    "Runs through Hugging Face Inference Providers. Submitted code "
    "is sent to this configured cloud service."
)
HUGGINGFACE_DEFAULT_URL = (
    "https://router.huggingface.co/featherless-ai/v1/chat/completions"
)
CUSTOM_DEFAULT_LABEL = "Cloud endpoint"
CUSTOM_DEFAULT_DESCRIPTION = "Submitted code is sent to this configured cloud service."

DEFAULT_POOL_SIZE = 8
DEFAULT_POOL_MIN_SIZE = 0
DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
DEFAULT_MAX_CODE_CHARACTERS = 4_000
DEFAULT_MAX_TOKENS = 1024
DEFAULT_MAX_FINDINGS = 3
DEFAULT_TIMEOUT_MS = 55_000
DEFAULT_REQUESTS_PER_WINDOW = 100
DEFAULT_RATE_LIMIT_WINDOW_MINUTES = 60
DEFAULT_LOGIN_MAX_ATTEMPTS = 5
DEFAULT_LOGIN_WINDOW_MINUTES = 15
DEFAULT_REGISTER_MAX_ATTEMPTS = 5
DEFAULT_CLEANUP_INTERVAL_SECONDS = 15 * 60
DEFAULT_HISTORY_RETENTION_DAYS = 90
DEFAULT_INFERENCE_REQUESTS_RETENTION_DAYS = 30
DEFAULT_AUTH_ATTEMPTS_RETENTION_DAYS = 14
DEFAULT_TEMPERATURE = 0.2
UNSAFE_HTTP_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
API_CONTENT_SECURITY_POLICY = (
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)
HSTS_VALUE = "max-age=63072000; includeSubDomains; preload"
REFERRER_POLICY = "no-referrer"
X_FRAME_OPTIONS = "DENY"
X_CONTENT_TYPE_OPTIONS = "nosniff"
PERMISSIONS_POLICY = (
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
)
MAX_CLIENT_IP_CHARS = 45
FINDING_WARNING_SCORE = 75
MIN_TEMPERATURE = 0.0
MAX_TEMPERATURE = 1.0
MAX_REQUEST_BYTES = 256 * 1024
MAX_HISTORY_CODE_CHARACTERS = 200_000
HISTORY_PAGE_SIZE = 100
MAX_METRICS = 3
MIN_SCORE = 0
MAX_SCORE = 100
MAX_STARTUP_ATTEMPTS = 8
MAX_ERROR_DETAIL_CHARS = 280
MAX_LOG_TEXT_CHARS = 280
LOG_BODY_KEY_LIMIT = 8
JSON_ERROR_LIST_LIMIT = 3
RETRY_MIN_SECONDS = 0.5
RETRY_MAX_SECONDS = 5.0
RETRY_REMAINING_SECONDS = 2.0
RETRY_SLEEP_DIVISOR = 4
HTTP_TIMEOUT_SECONDS = 60.0
HTTP_MAX_CONNECTIONS = 20
HTTP_MAX_KEEPALIVE_CONNECTIONS = 10
SCRYPT_N = 16_384
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 64
SCRYPT_SALT_BYTES = 16
SESSION_TOKEN_BYTES = 32
NAME_MIN_LENGTH = 2
NAME_MAX_LENGTH = 80
EMAIL_MAX_LENGTH = 254
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _int_at_least(name: str, fallback: int, minimum: int) -> int:
    try:
        value = int(os.getenv(name, ""))
    except ValueError:
        return fallback
    return value if value >= minimum else fallback


def _positive_int(name: str, fallback: int) -> int:
    return _int_at_least(name, fallback, 1)


def _optional_positive_int(name: str) -> int | None:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value > 0 else None


def _bool_env(name: str, fallback: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return fallback
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _origin(value: str) -> str:
    return value.strip().rstrip("/")


def _origin_set(*values: str) -> frozenset[str]:
    return frozenset(
        origin for origin in (_origin(value) for value in values) if origin
    )


def _float_at_least(name: str, fallback: float, minimum: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return fallback
    try:
        value = float(raw)
    except ValueError:
        return fallback
    return value if value >= minimum else fallback


def _float_in_range(
    name: str, fallback: float, minimum: float, maximum: float
) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return fallback
    try:
        value = float(raw)
    except ValueError:
        return fallback
    if value < minimum or value > maximum:
        return fallback
    return value


def _str_env(name: str, fallback: str) -> str:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return fallback
    return raw.strip()


def _samesite_env(name: str, fallback: str) -> str:
    value = _str_env(name, fallback).lower()
    return value if value in SESSION_SAMESITE_VALUES else fallback


def _path_env(name: str, fallback: str) -> str:
    value = _str_env(name, fallback)
    if not value.startswith("/"):
        return fallback
    return value.rstrip("/") or fallback


@dataclass(frozen=True)
class CloudProviderSettings:
    id: str
    label: str
    description: str
    model_id: str
    url: str
    api_key: str
    json_schema: bool = True


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    database_pool_size: int
    database_pool_min_size: int
    prepare_threshold: int | None
    environment: str
    public_origin: str
    allowed_origins: frozenset[str]
    session_cookie: str
    session_cookie_path: str
    session_cookie_samesite: str
    session_ttl_seconds: int
    trust_proxy_headers: bool
    http_timeout_seconds: float
    http_max_connections: int
    http_max_keepalive_connections: int
    login_max_attempts: int
    login_window_minutes: int
    register_max_attempts: int
    cleanup_interval_seconds: int
    history_retention_days: int
    inference_requests_retention_days: int
    auth_attempts_retention_days: int
    name_min_length: int
    name_max_length: int
    email_max_length: int
    password_min_length: int
    password_max_length: int
    max_code_characters: int
    max_tokens: int
    max_findings: int
    detailed_min_tokens: int
    timeout_ms: int
    requests_per_window: int
    rate_limit_window_minutes: int
    temperature: float
    finding_warning_score: int
    max_metrics: int
    min_score: int
    max_score: int
    retry_min_seconds: float
    retry_max_seconds: float
    retry_remaining_seconds: float
    retry_sleep_divisor: float
    review_json_schema_name: str
    max_request_bytes: int
    history_page_size: int
    max_history_code_characters: int
    max_startup_attempts: int
    modal_provider: CloudProviderSettings | None
    huggingface_provider: CloudProviderSettings | None
    custom_provider: CloudProviderSettings | None

    @property
    def secure_cookies(self) -> bool:
        return self.environment == PRODUCTION_ENVIRONMENT

    @property
    def session_cookie_name(self) -> str:
        name = self.session_cookie
        if self.secure_cookies and not name.startswith(HOST_COOKIE_PREFIX):
            return f"{HOST_COOKIE_PREFIX}{name}"
        return name

    def provider(self, provider_id: str) -> CloudProviderSettings | None:
        providers = {
            "modal": self.modal_provider,
            "huggingface": self.huggingface_provider,
            "custom": self.custom_provider,
        }
        return providers.get(provider_id)

    def production_config_warnings(self) -> list[str]:
        if self.environment != PRODUCTION_ENVIRONMENT:
            return []
        warnings: list[str] = []
        origin = self.public_origin.lower()
        if "localhost" in origin or "127.0.0.1" in origin:
            warnings.append(
                "APP_PUBLIC_ORIGIN is a localhost URL; cookie-authenticated "
                "browser requests from the public SPA will be rejected."
            )
        return warnings


def _cloud_provider(
    provider_id: str,
    prefix: str,
    default_label: str,
    default_description: str,
    default_url: str = "",
    json_schema: bool = True,
) -> CloudProviderSettings | None:
    url = os.getenv(f"{prefix}_URL", "").strip() or default_url
    api_key = os.getenv(f"{prefix}_API_KEY", "").strip()
    if not url or not api_key:
        return None
    return CloudProviderSettings(
        id=provider_id,
        label=os.getenv(f"{prefix}_LABEL", "").strip() or default_label,
        description=os.getenv(f"{prefix}_DESCRIPTION", "").strip()
        or default_description,
        model_id=os.getenv(f"{prefix}_MODEL_ID", "").strip() or DEFAULT_MODEL_ID,
        url=url,
        api_key=api_key,
        json_schema=json_schema,
    )


@lru_cache
def get_settings() -> Settings:
    pool_size = _positive_int("DATABASE_POOL_SIZE", DEFAULT_POOL_SIZE)
    pool_min_size = _int_at_least("DATABASE_POOL_MIN_SIZE", DEFAULT_POOL_MIN_SIZE, 0)
    environment = os.getenv("APP_ENV", DEFAULT_ENVIRONMENT)
    public_origin = _origin(os.getenv("APP_PUBLIC_ORIGIN", "") or DEFAULT_PUBLIC_ORIGIN)
    extra_origins = os.getenv("APP_ALLOWED_ORIGINS", "")
    return Settings(
        database_url=os.getenv("DATABASE_URL"),
        database_pool_size=pool_size,
        database_pool_min_size=min(pool_min_size, pool_size),
        prepare_threshold=_optional_positive_int("DATABASE_PREPARE_THRESHOLD"),
        environment=environment,
        public_origin=public_origin,
        allowed_origins=_origin_set(
            public_origin,
            *(item for item in extra_origins.split(",") if item.strip()),
        ),
        session_cookie=os.getenv("SESSION_COOKIE") or DEFAULT_SESSION_COOKIE,
        session_cookie_path=_path_env(
            "SESSION_COOKIE_PATH", DEFAULT_SESSION_COOKIE_PATH
        ),
        session_cookie_samesite=_samesite_env(
            "SESSION_COOKIE_SAMESITE", DEFAULT_SESSION_COOKIE_SAMESITE
        ),
        session_ttl_seconds=_positive_int(
            "SESSION_TTL_SECONDS", DEFAULT_SESSION_TTL_SECONDS
        ),
        trust_proxy_headers=_bool_env(
            "TRUST_PROXY_HEADERS", environment == PRODUCTION_ENVIRONMENT
        ),
        http_timeout_seconds=_float_at_least(
            "HTTP_TIMEOUT_SECONDS", HTTP_TIMEOUT_SECONDS, 0.1
        ),
        http_max_connections=_positive_int(
            "HTTP_MAX_CONNECTIONS", HTTP_MAX_CONNECTIONS
        ),
        http_max_keepalive_connections=_positive_int(
            "HTTP_MAX_KEEPALIVE_CONNECTIONS", HTTP_MAX_KEEPALIVE_CONNECTIONS
        ),
        login_max_attempts=_positive_int(
            "AUTH_LOGIN_MAX_ATTEMPTS", DEFAULT_LOGIN_MAX_ATTEMPTS
        ),
        login_window_minutes=_positive_int(
            "AUTH_LOGIN_WINDOW_MINUTES", DEFAULT_LOGIN_WINDOW_MINUTES
        ),
        register_max_attempts=_positive_int(
            "AUTH_REGISTER_MAX_ATTEMPTS", DEFAULT_REGISTER_MAX_ATTEMPTS
        ),
        cleanup_interval_seconds=_positive_int(
            "CLEANUP_INTERVAL_SECONDS", DEFAULT_CLEANUP_INTERVAL_SECONDS
        ),
        history_retention_days=_positive_int(
            "HISTORY_RETENTION_DAYS", DEFAULT_HISTORY_RETENTION_DAYS
        ),
        inference_requests_retention_days=_positive_int(
            "INFERENCE_REQUESTS_RETENTION_DAYS",
            DEFAULT_INFERENCE_REQUESTS_RETENTION_DAYS,
        ),
        auth_attempts_retention_days=_positive_int(
            "AUTH_ATTEMPTS_RETENTION_DAYS", DEFAULT_AUTH_ATTEMPTS_RETENTION_DAYS
        ),
        name_min_length=_positive_int("AUTH_NAME_MIN_LENGTH", NAME_MIN_LENGTH),
        name_max_length=_positive_int("AUTH_NAME_MAX_LENGTH", NAME_MAX_LENGTH),
        email_max_length=_positive_int("AUTH_EMAIL_MAX_LENGTH", EMAIL_MAX_LENGTH),
        password_min_length=_positive_int(
            "AUTH_PASSWORD_MIN_LENGTH", PASSWORD_MIN_LENGTH
        ),
        password_max_length=_positive_int(
            "AUTH_PASSWORD_MAX_LENGTH", PASSWORD_MAX_LENGTH
        ),
        max_code_characters=_positive_int(
            "INFERENCE_MAX_CODE_CHARACTERS", DEFAULT_MAX_CODE_CHARACTERS
        ),
        max_tokens=_positive_int("INFERENCE_MAX_TOKENS", DEFAULT_MAX_TOKENS),
        max_findings=_positive_int("INFERENCE_MAX_FINDINGS", DEFAULT_MAX_FINDINGS),
        detailed_min_tokens=_positive_int(
            "INFERENCE_DETAILED_MIN_TOKENS", DEFAULT_DETAILED_MIN_TOKENS
        ),
        timeout_ms=_positive_int("INFERENCE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
        requests_per_window=_positive_int(
            "INFERENCE_RATE_LIMIT_REQUESTS", DEFAULT_REQUESTS_PER_WINDOW
        ),
        rate_limit_window_minutes=_positive_int(
            "INFERENCE_RATE_LIMIT_WINDOW_MINUTES",
            DEFAULT_RATE_LIMIT_WINDOW_MINUTES,
        ),
        temperature=_float_in_range(
            "INFERENCE_TEMPERATURE",
            DEFAULT_TEMPERATURE,
            MIN_TEMPERATURE,
            MAX_TEMPERATURE,
        ),
        finding_warning_score=_int_at_least(
            "INFERENCE_FINDING_WARNING_SCORE", FINDING_WARNING_SCORE, MIN_SCORE
        ),
        max_metrics=_positive_int("INFERENCE_MAX_METRICS", MAX_METRICS),
        min_score=_int_at_least("INFERENCE_MIN_SCORE", MIN_SCORE, 0),
        max_score=_positive_int("INFERENCE_MAX_SCORE", MAX_SCORE),
        retry_min_seconds=_float_at_least(
            "INFERENCE_RETRY_MIN_SECONDS", RETRY_MIN_SECONDS, 0.0
        ),
        retry_max_seconds=_float_at_least(
            "INFERENCE_RETRY_MAX_SECONDS", RETRY_MAX_SECONDS, 0.0
        ),
        retry_remaining_seconds=_float_at_least(
            "INFERENCE_RETRY_REMAINING_SECONDS", RETRY_REMAINING_SECONDS, 0.0
        ),
        retry_sleep_divisor=_float_at_least(
            "INFERENCE_RETRY_SLEEP_DIVISOR", RETRY_SLEEP_DIVISOR, 0.1
        ),
        review_json_schema_name=_str_env(
            "INFERENCE_REVIEW_JSON_SCHEMA_NAME", REVIEW_JSON_SCHEMA_NAME
        ),
        max_request_bytes=_positive_int("MAX_REQUEST_BYTES", MAX_REQUEST_BYTES),
        history_page_size=_positive_int("HISTORY_PAGE_SIZE", HISTORY_PAGE_SIZE),
        max_history_code_characters=_positive_int(
            "HISTORY_MAX_CODE_CHARACTERS", MAX_HISTORY_CODE_CHARACTERS
        ),
        max_startup_attempts=_positive_int(
            "INFERENCE_MAX_STARTUP_ATTEMPTS", MAX_STARTUP_ATTEMPTS
        ),
        modal_provider=_cloud_provider(
            "modal",
            "MODAL",
            MODAL_DEFAULT_LABEL,
            MODAL_DEFAULT_DESCRIPTION,
        ),
        huggingface_provider=_cloud_provider(
            "huggingface",
            "HUGGINGFACE",
            HUGGINGFACE_DEFAULT_LABEL,
            HUGGINGFACE_DEFAULT_DESCRIPTION,
            HUGGINGFACE_DEFAULT_URL,
            json_schema=False,
        ),
        custom_provider=_cloud_provider(
            "custom",
            "CUSTOM_INFERENCE",
            CUSTOM_DEFAULT_LABEL,
            CUSTOM_DEFAULT_DESCRIPTION,
        ),
    )
