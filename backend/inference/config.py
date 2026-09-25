"""Deploy-time and runtime settings."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

APP_NAME = "ai-tinyswallow-inference"
SECRET_NAME = "ai-inference"
API_KEY_ENV = "INFERENCE_API_KEY"

MODEL_ID = "SakanaAI/TinySwallow-1.5B-Instruct"
PYTHON_VERSION = "3.12"
IMAGE_PACKAGES = ("vllm>=0.11,<1", "huggingface-hub>=0.34,<2")

GPU = "L4"
HOST = "0.0.0.0"
PORT = 8000
DTYPE = "auto"
MAX_MODEL_LEN = 4096
MAX_NUM_SEQS = 8
GPU_MEMORY_UTILIZATION = 0.9
# Modal's slim GPU runtime has CUDA libraries but no nvcc. FlashInfer tries to
# JIT its sampler at startup and fails without a compiler.
FLASHINFER_SAMPLER = "0"

STARTUP_TIMEOUT_SECONDS = 15 * 60
SCALEDOWN_WINDOW_SECONDS = 5 * 60
MIN_CONTAINERS = 1
TARGET_CONCURRENCY = 8
# vLLM authenticates with the bearer token from INFERENCE_API_KEY.
UNAUTHENTICATED = True

READY_PATH = "/health"
READY_POLL_INTERVAL_SECONDS = 2.0
READY_HTTP_TIMEOUT_SECONDS = 2.0
READY_TIMEOUT_FLOOR_SECONDS = 30.0
READY_TIMEOUT_STARTUP_MARGIN_SECONDS = 60
SHUTDOWN_TIMEOUT_SECONDS = 30
KILL_TIMEOUT_SECONDS = 10
DOWNLOAD_ATTEMPTS = 3
DOWNLOAD_RETRY_SECONDS = 5.0
LOG_LEVEL = "INFO"
MIN_PORT = 1
MAX_PORT = 65_535

_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})


def _env_str(environ: Mapping[str, str], name: str, fallback: str) -> str:
    raw = environ.get(name, "")
    return raw.strip() if raw.strip() else fallback


def _env_int(environ: Mapping[str, str], name: str, fallback: int) -> int:
    raw = environ.get(name, "").strip()
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def _env_float(environ: Mapping[str, str], name: str, fallback: float) -> float:
    raw = environ.get(name, "").strip()
    if not raw:
        return fallback
    try:
        return float(raw)
    except ValueError:
        return fallback


def _env_bool(environ: Mapping[str, str], name: str, fallback: bool) -> bool:
    raw = environ.get(name)
    if raw is None or not str(raw).strip():
        return fallback
    return str(raw).strip().lower() in _TRUE_VALUES


def _env_packages(
    environ: Mapping[str, str], name: str, fallback: tuple[str, ...]
) -> tuple[str, ...]:
    raw = environ.get(name, "").strip()
    if not raw:
        return fallback
    packages = tuple(part.strip() for part in raw.split(";") if part.strip())
    return packages or fallback


@dataclass(frozen=True)
class InferenceConfig:
    app_name: str = APP_NAME
    secret_name: str = SECRET_NAME
    api_key_env: str = API_KEY_ENV
    model_id: str = MODEL_ID
    python_version: str = PYTHON_VERSION
    image_packages: tuple[str, ...] = IMAGE_PACKAGES
    gpu: str = GPU
    host: str = HOST
    port: int = PORT
    dtype: str = DTYPE
    max_model_len: int = MAX_MODEL_LEN
    max_num_seqs: int = MAX_NUM_SEQS
    gpu_memory_utilization: float = GPU_MEMORY_UTILIZATION
    flashinfer_sampler: str = FLASHINFER_SAMPLER
    startup_timeout_seconds: int = STARTUP_TIMEOUT_SECONDS
    scaledown_window_seconds: int = SCALEDOWN_WINDOW_SECONDS
    min_containers: int = MIN_CONTAINERS
    target_concurrency: int = TARGET_CONCURRENCY
    unauthenticated: bool = UNAUTHENTICATED
    ready_path: str = READY_PATH
    ready_poll_interval_seconds: float = READY_POLL_INTERVAL_SECONDS
    ready_http_timeout_seconds: float = READY_HTTP_TIMEOUT_SECONDS
    ready_timeout_floor_seconds: float = READY_TIMEOUT_FLOOR_SECONDS
    ready_timeout_startup_margin_seconds: int = READY_TIMEOUT_STARTUP_MARGIN_SECONDS
    shutdown_timeout_seconds: int = SHUTDOWN_TIMEOUT_SECONDS
    kill_timeout_seconds: int = KILL_TIMEOUT_SECONDS
    download_attempts: int = DOWNLOAD_ATTEMPTS
    download_retry_seconds: float = DOWNLOAD_RETRY_SECONDS
    log_level: str = LOG_LEVEL

    def __post_init__(self) -> None:
        if not self.app_name.strip():
            raise ValueError("app_name must be non-empty.")
        if not self.secret_name.strip():
            raise ValueError("secret_name must be non-empty.")
        if not self.api_key_env.strip():
            raise ValueError("api_key_env must be non-empty.")
        if not self.model_id.strip():
            raise ValueError("model_id must be non-empty.")
        if not self.gpu.strip():
            raise ValueError("gpu must be non-empty.")
        if not self.host.strip():
            raise ValueError("host must be non-empty.")
        if not MIN_PORT <= self.port <= MAX_PORT:
            raise ValueError(
                f"port must be in {MIN_PORT}..{MAX_PORT}, got {self.port}."
            )
        if self.max_model_len < 1:
            raise ValueError("max_model_len must be >= 1.")
        if self.max_num_seqs < 1:
            raise ValueError("max_num_seqs must be >= 1.")
        if not 0 < self.gpu_memory_utilization <= 1:
            raise ValueError(
                "gpu_memory_utilization must be in (0, 1], got "
                f"{self.gpu_memory_utilization}."
            )
        if self.flashinfer_sampler not in {"0", "1"}:
            raise ValueError("flashinfer_sampler must be '0' or '1'.")
        if self.startup_timeout_seconds < 1:
            raise ValueError("startup_timeout_seconds must be >= 1.")
        if self.scaledown_window_seconds < 1:
            raise ValueError("scaledown_window_seconds must be >= 1.")
        if self.min_containers < 0:
            raise ValueError("min_containers must be >= 0.")
        if self.target_concurrency < 1:
            raise ValueError("target_concurrency must be >= 1.")
        if not self.ready_path.startswith("/"):
            raise ValueError("ready_path must start with '/'.")
        if self.ready_poll_interval_seconds <= 0:
            raise ValueError("ready_poll_interval_seconds must be > 0.")
        if self.ready_http_timeout_seconds <= 0:
            raise ValueError("ready_http_timeout_seconds must be > 0.")
        if self.ready_timeout_floor_seconds <= 0:
            raise ValueError("ready_timeout_floor_seconds must be > 0.")
        if self.ready_timeout_startup_margin_seconds < 0:
            raise ValueError("ready_timeout_startup_margin_seconds must be >= 0.")
        if self.shutdown_timeout_seconds < 1:
            raise ValueError("shutdown_timeout_seconds must be >= 1.")
        if self.kill_timeout_seconds < 1:
            raise ValueError("kill_timeout_seconds must be >= 1.")
        if self.download_attempts < 1:
            raise ValueError("download_attempts must be >= 1.")
        if self.download_retry_seconds < 0:
            raise ValueError("download_retry_seconds must be >= 0.")
        if not self.image_packages:
            raise ValueError("image_packages must be non-empty.")

    @property
    def ready_url(self) -> str:
        return f"http://127.0.0.1:{self.port}{self.ready_path}"

    @property
    def ready_timeout_seconds(self) -> float:
        return max(
            self.ready_timeout_floor_seconds,
            float(
                self.startup_timeout_seconds - self.ready_timeout_startup_margin_seconds
            ),
        )

    @classmethod
    def from_environ(cls, environ: Mapping[str, str] | None = None) -> InferenceConfig:
        env = os.environ if environ is None else environ
        return cls(
            app_name=_env_str(env, "INFERENCE_APP_NAME", APP_NAME),
            secret_name=_env_str(env, "INFERENCE_SECRET_NAME", SECRET_NAME),
            api_key_env=_env_str(env, "INFERENCE_API_KEY_ENV", API_KEY_ENV),
            model_id=_env_str(env, "INFERENCE_MODEL_ID", MODEL_ID),
            python_version=_env_str(env, "INFERENCE_PYTHON_VERSION", PYTHON_VERSION),
            image_packages=_env_packages(
                env, "INFERENCE_IMAGE_PACKAGES", IMAGE_PACKAGES
            ),
            gpu=_env_str(env, "INFERENCE_GPU", GPU),
            host=_env_str(env, "INFERENCE_HOST", HOST),
            port=_env_int(env, "INFERENCE_PORT", PORT),
            dtype=_env_str(env, "INFERENCE_DTYPE", DTYPE),
            max_model_len=_env_int(env, "INFERENCE_MAX_MODEL_LEN", MAX_MODEL_LEN),
            max_num_seqs=_env_int(env, "INFERENCE_MAX_NUM_SEQS", MAX_NUM_SEQS),
            gpu_memory_utilization=_env_float(
                env, "INFERENCE_GPU_MEMORY_UTILIZATION", GPU_MEMORY_UTILIZATION
            ),
            flashinfer_sampler=_env_str(
                env, "INFERENCE_FLASHINFER_SAMPLER", FLASHINFER_SAMPLER
            ),
            startup_timeout_seconds=_env_int(
                env, "INFERENCE_STARTUP_TIMEOUT_SECONDS", STARTUP_TIMEOUT_SECONDS
            ),
            scaledown_window_seconds=_env_int(
                env, "INFERENCE_SCALEDOWN_WINDOW_SECONDS", SCALEDOWN_WINDOW_SECONDS
            ),
            min_containers=_env_int(env, "INFERENCE_MIN_CONTAINERS", MIN_CONTAINERS),
            target_concurrency=_env_int(
                env, "INFERENCE_TARGET_CONCURRENCY", TARGET_CONCURRENCY
            ),
            unauthenticated=_env_bool(
                env, "INFERENCE_UNAUTHENTICATED", UNAUTHENTICATED
            ),
            ready_path=_env_str(env, "INFERENCE_READY_PATH", READY_PATH),
            ready_poll_interval_seconds=_env_float(
                env,
                "INFERENCE_READY_POLL_INTERVAL_SECONDS",
                READY_POLL_INTERVAL_SECONDS,
            ),
            ready_http_timeout_seconds=_env_float(
                env,
                "INFERENCE_READY_HTTP_TIMEOUT_SECONDS",
                READY_HTTP_TIMEOUT_SECONDS,
            ),
            ready_timeout_floor_seconds=_env_float(
                env,
                "INFERENCE_READY_TIMEOUT_FLOOR_SECONDS",
                READY_TIMEOUT_FLOOR_SECONDS,
            ),
            ready_timeout_startup_margin_seconds=_env_int(
                env,
                "INFERENCE_READY_TIMEOUT_STARTUP_MARGIN_SECONDS",
                READY_TIMEOUT_STARTUP_MARGIN_SECONDS,
            ),
            shutdown_timeout_seconds=_env_int(
                env, "INFERENCE_SHUTDOWN_TIMEOUT_SECONDS", SHUTDOWN_TIMEOUT_SECONDS
            ),
            kill_timeout_seconds=_env_int(
                env, "INFERENCE_KILL_TIMEOUT_SECONDS", KILL_TIMEOUT_SECONDS
            ),
            download_attempts=_env_int(
                env, "INFERENCE_DOWNLOAD_ATTEMPTS", DOWNLOAD_ATTEMPTS
            ),
            download_retry_seconds=_env_float(
                env, "INFERENCE_DOWNLOAD_RETRY_SECONDS", DOWNLOAD_RETRY_SECONDS
            ),
            log_level=_env_str(env, "INFERENCE_LOG_LEVEL", LOG_LEVEL),
        )

    def vllm_command(self, api_key: str) -> list[str]:
        if not api_key.strip():
            raise ValueError("api_key must be non-empty.")
        return [
            "vllm",
            "serve",
            self.model_id,
            "--host",
            self.host,
            "--port",
            str(self.port),
            "--api-key",
            api_key,
            "--dtype",
            self.dtype,
            "--max-model-len",
            str(self.max_model_len),
            "--max-num-seqs",
            str(self.max_num_seqs),
            "--gpu-memory-utilization",
            str(self.gpu_memory_utilization),
        ]

    def vllm_env(self, environ: Mapping[str, str]) -> dict[str, str]:
        return {
            **dict(environ),
            "VLLM_USE_FLASHINFER_SAMPLER": self.flashinfer_sampler,
        }


CONFIG = InferenceConfig.from_environ()
