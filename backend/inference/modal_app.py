"""Modal deployment."""

from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

import modal

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from inference.config import CONFIG  # noqa: E402
from inference.runtime import (  # noqa: E402
    configure_logging,
    download_model,
    require_api_key,
    start_vllm,
    stop_process,
    wait_until_ready,
)

logger = logging.getLogger(__name__)

image = (
    modal.Image.debian_slim(python_version=CONFIG.python_version)
    .uv_pip_install(*CONFIG.image_packages)
    .run_function(download_model)
    .add_local_python_source("inference")
)

app = modal.App(CONFIG.app_name)


@app.server(
    image=image,
    gpu=CONFIG.gpu,
    port=CONFIG.port,
    secrets=[modal.Secret.from_name(CONFIG.secret_name)],
    startup_timeout=CONFIG.startup_timeout_seconds,
    scaledown_window=CONFIG.scaledown_window_seconds,
    min_containers=CONFIG.min_containers,
    target_concurrency=CONFIG.target_concurrency,
    unauthenticated=CONFIG.unauthenticated,
)
class TinySwallowServer:
    """Start vLLM with authentication and a bounded context window."""

    process: subprocess.Popen[str] | None = None

    @modal.enter()
    def start(self) -> None:
        configure_logging()
        api_key = require_api_key()
        self.process = start_vllm(api_key)
        try:
            wait_until_ready(self.process)
        except BaseException:
            logger.exception("vLLM failed to become ready; stopping process")
            try:
                stop_process(self.process)
            except Exception:
                logger.exception("Failed to stop vLLM after startup failure")
            self.process = None
            raise

    @modal.exit()
    def stop(self) -> None:
        if self.process is None:
            return
        try:
            stop_process(self.process)
        except Exception:
            logger.exception("Failed to stop vLLM cleanly")
            raise
        finally:
            self.process = None
