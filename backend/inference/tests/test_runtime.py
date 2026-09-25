from __future__ import annotations

import signal
import subprocess
from email.message import EmailMessage
from urllib.error import HTTPError, URLError

import pytest

from inference.config import (
    API_KEY_ENV,
    APP_NAME,
    CONFIG,
    FLASHINFER_SAMPLER,
    GPU,
    IMAGE_PACKAGES,
    MAX_MODEL_LEN,
    MAX_NUM_SEQS,
    MODEL_ID,
    PORT,
    SECRET_NAME,
    TARGET_CONCURRENCY,
    InferenceConfig,
)
from inference.runtime import (
    download_model,
    redact_command,
    require_api_key,
    start_vllm,
    stop_process,
    wait_until_ready,
)


def test_default_config_matches_documented_service() -> None:
    config = InferenceConfig.from_environ({})
    assert config.app_name == APP_NAME
    assert config.secret_name == SECRET_NAME
    assert config.api_key_env == API_KEY_ENV
    assert config.model_id == MODEL_ID
    assert config.gpu == GPU
    assert config.port == PORT
    assert config.max_model_len == MAX_MODEL_LEN
    assert config.max_num_seqs == MAX_NUM_SEQS
    assert config.target_concurrency == TARGET_CONCURRENCY
    assert config.flashinfer_sampler == FLASHINFER_SAMPLER
    assert config.image_packages == IMAGE_PACKAGES
    assert config.ready_url == f"http://127.0.0.1:{PORT}/health"
    assert config.unauthenticated is True


def test_from_environ_reads_overrides_and_ignores_invalid_values() -> None:
    config = InferenceConfig.from_environ(
        {
            "INFERENCE_APP_NAME": "custom-app",
            "INFERENCE_GPU": "A100",
            "INFERENCE_PORT": "9000",
            "INFERENCE_MAX_MODEL_LEN": "2048",
            "INFERENCE_UNAUTHENTICATED": "false",
            "INFERENCE_READY_POLL_INTERVAL_SECONDS": "0.5",
            "INFERENCE_IMAGE_PACKAGES": "pkg-a>=1;pkg-b>=2,<3",
            "INFERENCE_MAX_NUM_SEQS": "nope",
            "INFERENCE_GPU_MEMORY_UTILIZATION": "abc",
            "INFERENCE_SECRET_NAME": "  ",
        }
    )
    assert config.app_name == "custom-app"
    assert config.gpu == "A100"
    assert config.port == 9000
    assert config.max_model_len == 2048
    assert config.unauthenticated is False
    assert config.image_packages == ("pkg-a>=1", "pkg-b>=2,<3")
    assert (
        InferenceConfig.from_environ(
            {"INFERENCE_UNAUTHENTICATED": "yes"}
        ).unauthenticated
        is True
    )
    assert config.ready_poll_interval_seconds == 0.5
    assert config.max_num_seqs == MAX_NUM_SEQS
    assert config.gpu_memory_utilization == 0.9
    assert config.secret_name == SECRET_NAME


def test_vllm_command_and_env_include_secret_without_leaking_it() -> None:
    command = CONFIG.vllm_command("super-secret")
    assert command[:3] == ["vllm", "serve", MODEL_ID]
    assert "--api-key" in command
    assert command[command.index("--api-key") + 1] == "super-secret"
    assert redact_command(command)[command.index("--api-key") + 1] == "***"
    env = CONFIG.vllm_env({"PATH": "/usr/bin", "VLLM_USE_FLASHINFER_SAMPLER": "1"})
    assert env["VLLM_USE_FLASHINFER_SAMPLER"] == FLASHINFER_SAMPLER
    assert env["PATH"] == "/usr/bin"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"port": 0},
        {"port": 70000},
        {"max_model_len": 0},
        {"max_num_seqs": 0},
        {"gpu_memory_utilization": 0},
        {"gpu_memory_utilization": 1.1},
        {"flashinfer_sampler": "yes"},
        {"min_containers": -1},
        {"ready_path": "health"},
        {"download_attempts": 0},
        {"model_id": " "},
        {"image_packages": ()},
    ],
)
def test_invalid_config_is_rejected(kwargs: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        InferenceConfig(**kwargs)  # type: ignore[arg-type]


def test_vllm_command_rejects_blank_api_key() -> None:
    with pytest.raises(ValueError, match="api_key"):
        CONFIG.vllm_command("  ")


def test_require_api_key_reads_secret_and_strips_whitespace() -> None:
    assert require_api_key({API_KEY_ENV: "  token  "}) == "token"


def test_require_api_key_fails_when_missing() -> None:
    with pytest.raises(RuntimeError, match=SECRET_NAME):
        require_api_key({})


class _FakeProcess:
    def __init__(self, *, returncode: int | None = None, pid: int = 42) -> None:
        self.returncode = returncode
        self.pid = pid
        self.wait_timeouts = 0
        self.wait_calls = 0

    def poll(self) -> int | None:
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        self.wait_calls += 1
        if self.wait_timeouts > 0:
            self.wait_timeouts -= 1
            raise subprocess.TimeoutExpired(cmd="vllm", timeout=timeout or 0)
        self.returncode = self.returncode if self.returncode is not None else 0
        return self.returncode


def test_wait_until_ready_returns_when_health_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = _FakeProcess()
    monkeypatch.setattr(
        "inference.runtime.urlopen", lambda *_args, **_kwargs: _FakeResponse(200)
    )
    monkeypatch.setattr("inference.runtime.time.sleep", lambda _seconds: None)
    wait_until_ready(process)  # type: ignore[arg-type]


def test_wait_until_ready_treats_auth_http_errors_as_up(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = _FakeProcess()

    def fail(*_args: object, **_kwargs: object) -> None:
        raise HTTPError(CONFIG.ready_url, 401, "auth", EmailMessage(), None)

    monkeypatch.setattr("inference.runtime.urlopen", fail)
    wait_until_ready(process)  # type: ignore[arg-type]


def test_wait_until_ready_fails_if_process_exits() -> None:
    process = _FakeProcess(returncode=1)
    with pytest.raises(RuntimeError, match="exit code 1"):
        wait_until_ready(process)  # type: ignore[arg-type]


def test_wait_until_ready_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    process = _FakeProcess()
    config = InferenceConfig(
        startup_timeout_seconds=61,
        ready_poll_interval_seconds=0.01,
        ready_http_timeout_seconds=0.01,
    )
    monotonic_values = iter([0.0, 0.0, 31.0])
    monkeypatch.setattr(
        "inference.runtime.time.monotonic", lambda: next(monotonic_values)
    )
    monkeypatch.setattr("inference.runtime.time.sleep", lambda _seconds: None)

    def fail(*_args: object, **_kwargs: object) -> None:
        raise URLError("connection refused")

    monkeypatch.setattr("inference.runtime.urlopen", fail)
    with pytest.raises(TimeoutError, match="connection refused"):
        wait_until_ready(process, config=config)  # type: ignore[arg-type]


def test_start_vllm_maps_missing_binary(monkeypatch: pytest.MonkeyPatch) -> None:
    def raise_missing(*_args: object, **_kwargs: object) -> None:
        raise FileNotFoundError("vllm")

    monkeypatch.setattr("inference.runtime.subprocess.Popen", raise_missing)
    with pytest.raises(RuntimeError, match="not found"):
        start_vllm("token")


def test_start_vllm_passes_redacted_safe_command(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_popen(command: list[str], **kwargs: object) -> _FakeProcess:
        captured["command"] = command
        captured["kwargs"] = kwargs
        return _FakeProcess()

    monkeypatch.setattr("inference.runtime.subprocess.Popen", fake_popen)
    process = start_vllm("token", environ={"PATH": "/usr/bin"})
    assert isinstance(process, _FakeProcess)
    command = captured["command"]
    assert isinstance(command, list)
    assert command[command.index("--api-key") + 1] == "token"
    kwargs = captured["kwargs"]
    assert isinstance(kwargs, dict)
    assert kwargs["start_new_session"] is True
    env = kwargs["env"]
    assert isinstance(env, dict)
    assert env["VLLM_USE_FLASHINFER_SAMPLER"] == FLASHINFER_SAMPLER


def test_stop_process_sends_sigterm(monkeypatch: pytest.MonkeyPatch) -> None:
    process = _FakeProcess()
    signals: list[int] = []
    monkeypatch.setattr(
        "inference.runtime.os.killpg", lambda pid, sig: signals.append(sig)
    )
    stop_process(process)  # type: ignore[arg-type]
    assert signals == [signal.SIGTERM]
    assert process.wait_calls == 1


def test_stop_process_escalates_to_sigkill(monkeypatch: pytest.MonkeyPatch) -> None:
    process = _FakeProcess()
    process.wait_timeouts = 1
    signals: list[int] = []
    monkeypatch.setattr(
        "inference.runtime.os.killpg", lambda pid, sig: signals.append(sig)
    )
    stop_process(process)  # type: ignore[arg-type]
    assert signals == [signal.SIGTERM, signal.SIGKILL]
    assert process.wait_calls == 2


def test_stop_process_raises_if_sigkill_is_ignored(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = _FakeProcess()
    process.wait_timeouts = 2
    monkeypatch.setattr("inference.runtime.os.killpg", lambda pid, sig: None)
    with pytest.raises(RuntimeError, match="SIGKILL"):
        stop_process(process)  # type: ignore[arg-type]


def test_download_model_retries_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts = {"count": 0}

    def fake_download(_model_id: str) -> None:
        attempts["count"] += 1
        if attempts["count"] < 2:
            raise OSError("network")

    monkeypatch.setitem(
        __import__("sys").modules,
        "huggingface_hub",
        type("hub", (), {"snapshot_download": staticmethod(fake_download)}),
    )
    monkeypatch.setattr("inference.runtime.time.sleep", lambda _seconds: None)
    download_model("demo-model", config=InferenceConfig(download_retry_seconds=0))
    assert attempts["count"] == 2


def test_download_model_raises_after_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_download(_model_id: str) -> None:
        raise OSError("network")

    monkeypatch.setitem(
        __import__("sys").modules,
        "huggingface_hub",
        type("hub", (), {"snapshot_download": staticmethod(fake_download)}),
    )
    monkeypatch.setattr("inference.runtime.time.sleep", lambda _seconds: None)
    with pytest.raises(RuntimeError, match="after 3 attempts"):
        download_model("demo-model", config=InferenceConfig(download_retry_seconds=0))


class _FakeResponse:
    def __init__(self, status: int) -> None:
        self.status = status

    def __enter__(self) -> _FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None
