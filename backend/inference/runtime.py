"""vLLM process lifecycle helpers."""

from __future__ import annotations

import logging
import os
import signal
import subprocess
import time
from collections.abc import Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from inference.config import CONFIG, InferenceConfig

logger = logging.getLogger(__name__)

_API_KEY_FLAGS = frozenset({"--api-key", "--api_key"})
_HTTP_UP_STATUSES = frozenset({401, 403, 404})


def configure_logging(level_name: str | None = None) -> None:
    level = getattr(logging, (level_name or CONFIG.log_level).upper(), logging.INFO)
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=level,
            format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        )
        return
    root.setLevel(level)


def require_api_key(
    environ: Mapping[str, str] | None = None,
    *,
    config: InferenceConfig = CONFIG,
) -> str:
    env = os.environ if environ is None else environ
    api_key = env.get(config.api_key_env, "").strip()
    if not api_key:
        raise RuntimeError(
            f"Modal secret {config.secret_name} must define {config.api_key_env}."
        )
    return api_key


def redact_command(command: Sequence[str]) -> list[str]:
    redacted: list[str] = []
    hide_next = False
    for part in command:
        if hide_next:
            redacted.append("***")
            hide_next = False
            continue
        redacted.append(part)
        if part in _API_KEY_FLAGS:
            hide_next = True
    return redacted


def download_model(
    model_id: str = CONFIG.model_id,
    *,
    config: InferenceConfig = CONFIG,
) -> None:
    from huggingface_hub import snapshot_download

    configure_logging(config.log_level)
    last_error: Exception | None = None
    for attempt in range(1, config.download_attempts + 1):
        try:
            logger.info(
                "Downloading %s (attempt %s/%s)",
                model_id,
                attempt,
                config.download_attempts,
            )
            snapshot_download(model_id)
            logger.info("Downloaded %s", model_id)
            return
        except Exception as exc:
            last_error = exc
            logger.warning("Download attempt %s failed: %s", attempt, exc)
            if attempt < config.download_attempts:
                time.sleep(config.download_retry_seconds)
    raise RuntimeError(
        f"Failed to download {model_id} after {config.download_attempts} attempts."
    ) from last_error


def start_vllm(
    api_key: str,
    *,
    config: InferenceConfig = CONFIG,
    environ: Mapping[str, str] | None = None,
) -> subprocess.Popen[str]:
    command = config.vllm_command(api_key)
    env = config.vllm_env(os.environ if environ is None else environ)
    logger.info("Starting vLLM: %s", " ".join(redact_command(command)))
    try:
        return subprocess.Popen(
            command,
            text=True,
            start_new_session=True,
            env=env,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("vLLM executable was not found on PATH.") from exc
    except OSError as exc:
        raise RuntimeError(f"Failed to start vLLM: {exc}") from exc


def wait_until_ready(
    process: subprocess.Popen[str],
    *,
    config: InferenceConfig = CONFIG,
) -> None:
    deadline = time.monotonic() + config.ready_timeout_seconds
    last_error = "server has not accepted connections yet"
    logger.info(
        "Waiting up to %.0fs for vLLM at %s",
        config.ready_timeout_seconds,
        config.ready_url,
    )
    while time.monotonic() < deadline:
        returncode = process.poll()
        if returncode is not None:
            raise RuntimeError(
                f"vLLM exited before becoming ready (exit code {returncode})."
            )
        ready, last_error = _http_ready(config)
        if ready:
            logger.info("vLLM is ready on port %s", config.port)
            return
        time.sleep(config.ready_poll_interval_seconds)
    raise TimeoutError(
        f"vLLM did not become ready within {config.ready_timeout_seconds:.0f}s: "
        f"{last_error}"
    )


def stop_process(
    process: subprocess.Popen[str],
    *,
    config: InferenceConfig = CONFIG,
) -> None:
    if process.poll() is not None:
        logger.info("vLLM already exited with code %s", process.returncode)
        return

    pid = process.pid
    logger.info("Stopping vLLM (pid %s)", pid)
    _signal_group(pid, signal.SIGTERM)
    try:
        process.wait(timeout=config.shutdown_timeout_seconds)
        logger.info("vLLM stopped with code %s", process.returncode)
        return
    except subprocess.TimeoutExpired:
        logger.warning(
            "vLLM did not stop within %ss; sending SIGKILL",
            config.shutdown_timeout_seconds,
        )

    _signal_group(pid, signal.SIGKILL)
    try:
        process.wait(timeout=config.kill_timeout_seconds)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"vLLM pid {pid} did not exit after SIGKILL.") from exc
    logger.info("vLLM killed with code %s", process.returncode)


def _http_ready(config: InferenceConfig) -> tuple[bool, str]:
    try:
        with urlopen(
            config.ready_url, timeout=config.ready_http_timeout_seconds
        ) as response:
            if 200 <= response.status < 300:
                return True, f"HTTP {response.status}"
            return False, f"HTTP {response.status}"
    except HTTPError as exc:
        if exc.code in _HTTP_UP_STATUSES:
            return True, f"HTTP {exc.code}"
        return False, f"HTTP {exc.code}"
    except URLError as exc:
        return False, str(exc.reason or exc)
    except TimeoutError:
        return False, "health check timed out"
    except OSError as exc:
        return False, str(exc)


def _signal_group(pid: int, sig: signal.Signals) -> None:
    try:
        os.killpg(pid, sig)
    except ProcessLookupError:
        return
    except (PermissionError, OSError):
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            return
