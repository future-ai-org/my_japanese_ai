import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.http import close_http_client
from app.main import app
from tests.helpers import MODAL_URL


@pytest.fixture(autouse=True)
def reset_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
async def reset_http_client():
    yield
    await close_http_client()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def modal_env(monkeypatch):
    monkeypatch.setenv("MODAL_URL", MODAL_URL)
    monkeypatch.setenv("MODAL_API_KEY", "secret")
    monkeypatch.setenv("MODAL_MODEL_ID", "test-model")
    monkeypatch.delenv("CUSTOM_INFERENCE_URL", raising=False)
    monkeypatch.delenv("CUSTOM_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("HUGGINGFACE_URL", raising=False)
    monkeypatch.delenv("HUGGINGFACE_API_KEY", raising=False)
    get_settings.cache_clear()
