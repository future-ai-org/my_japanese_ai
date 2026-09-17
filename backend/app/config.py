import os
import re
from dataclasses import dataclass
from functools import lru_cache

LANGUAGES = frozenset({"casual", "polite", "formal"})

DEFAULT_SESSION_COOKIE = "japanese_session"
DEFAULT_SESSION_COOKIE_PATH = "/"
DEFAULT_SESSION_COOKIE_SAMESITE = "lax"
HOST_COOKIE_PREFIX = "__Host-"
DEFAULT_ENVIRONMENT = "development"
PRODUCTION_ENVIRONMENT = "production"
DEFAULT_PUBLIC_ORIGIN = "http://localhost:8048"
API_PREFIX = "/api"
API_AUTH_PREFIX = "/api/auth"
API_HISTORY_PREFIX = "/api/history"
HEALTH_PATHS = ("/", "/healthz")
APP_TITLE = "My Japanese AI"
SESSION_SAMESITE_VALUES = frozenset({"lax", "strict", "none"})

DEFAULT_POOL_SIZE = 8
DEFAULT_POOL_MIN_SIZE = 0
DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
DEFAULT_LOGIN_MAX_ATTEMPTS = 5
DEFAULT_LOGIN_WINDOW_MINUTES = 15
DEFAULT_REGISTER_MAX_ATTEMPTS = 5
DEFAULT_CLEANUP_INTERVAL_SECONDS = 15 * 60
DEFAULT_HISTORY_RETENTION_DAYS = 90
DEFAULT_AUTH_ATTEMPTS_RETENTION_DAYS = 14
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
MAX_REQUEST_BYTES = 256 * 1024
MAX_HISTORY_CODE_CHARACTERS = 200_000
HISTORY_PAGE_SIZE = 100
EXPORT_MAX_REVIEWS = 1_000
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
    login_max_attempts: int
    login_window_minutes: int
    register_max_attempts: int
    cleanup_interval_seconds: int
    history_retention_days: int
    auth_attempts_retention_days: int
    name_min_length: int
    name_max_length: int
    email_max_length: int
    password_min_length: int
    password_max_length: int
    max_request_bytes: int
    history_page_size: int
    export_max_reviews: int
    max_history_code_characters: int

    @property
    def secure_cookies(self) -> bool:
        return self.environment == PRODUCTION_ENVIRONMENT

    @property
    def session_cookie_name(self) -> str:
        name = self.session_cookie
        if self.secure_cookies and not name.startswith(HOST_COOKIE_PREFIX):
            return f"{HOST_COOKIE_PREFIX}{name}"
        return name

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
        max_request_bytes=_positive_int("MAX_REQUEST_BYTES", MAX_REQUEST_BYTES),
        history_page_size=_positive_int("HISTORY_PAGE_SIZE", HISTORY_PAGE_SIZE),
        export_max_reviews=_positive_int("EXPORT_MAX_REVIEWS", EXPORT_MAX_REVIEWS),
        max_history_code_characters=_positive_int(
            "HISTORY_MAX_CODE_CHARACTERS", MAX_HISTORY_CODE_CHARACTERS
        ),
    )
