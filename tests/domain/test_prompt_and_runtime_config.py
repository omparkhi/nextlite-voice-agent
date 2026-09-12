import pytest
import zoneinfo
from datetime import datetime
from starlette.testclient import TestClient
from apps.api.app.main import app
from apps.api.app.services.prompt_compiler_service import prompt_compiler
from apps.api.app.config import settings

@pytest.fixture
def client():
    return TestClient(app)

def test_prompt_compiler_temporal_and_safety():
    compiled = prompt_compiler.compile_system_prompt(
        base_prompt="You are a clinic receptionist.",
        timezone="Asia/Kolkata",
        primary_lang="hi-IN",
        supported_langs=["en-IN", "hi-IN", "mr-IN"]
    )
    assert "# UNIVERSAL TELEPHONE RUNTIME RULES" in compiled
    assert "ANTI-HALLUCINATION" in compiled
    assert "UUID SUPPRESSION" in compiled
    assert "Current Timezone: Asia/Kolkata" in compiled
    assert "Primary Language: hi-IN" in compiled
    assert "You are a clinic receptionist." in compiled

def test_prompt_compiler_different_timezones():
    ny_context = prompt_compiler.compile_temporal_context("America/New_York")
    assert "Current Timezone: America/New_York" in ny_context

    ist_context = prompt_compiler.compile_temporal_context("Asia/Kolkata")
    assert "Current Timezone: Asia/Kolkata" in ist_context

def test_internal_config_unauthorized_rejection(client):
    res = client.get("/api/internal/runtime-agent-config?deploymentId=11111111-1111-1111-1111-111111111111")
    assert res.status_code == 401
    assert "Worker authentication required" in res.json()["detail"]

def test_internal_config_invalid_secret_rejection(client):
    res = client.get(
        "/api/internal/runtime-agent-config?deploymentId=11111111-1111-1111-1111-111111111111",
        headers={"Authorization": "Bearer invalid-worker-secret"}
    )
    assert res.status_code == 401
    assert "Invalid worker secret" in res.json()["detail"]
