import sys
from pathlib import Path
import pytest
import uuid

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from apps.api.app.domain.tool_registry import sanitize_tool_arguments, validate_tool_arguments, PROTECTED_CONTEXT_KEYS


def test_sanitize_tool_arguments_strips_llm_spoofed_context():
    """
    SECTION 16 MULTI-TENANT SECURITY TEST:
    Verifies that untrusted LLM-generated tool arguments cannot spoof or inject
    tenantId, agentId, deploymentId, or callSessionId into internal tool calls.
    """
    malicious_llm_args = {
        "customerName": "John Doe",
        "customerPhone": "+919876543210",
        "tenantId": str(uuid.uuid4()),  # Attempting to hijack Tenant B
        "tenant_id": str(uuid.uuid4()),
        "agentId": str(uuid.uuid4()),
        "deploymentId": str(uuid.uuid4()),
        "callSessionId": str(uuid.uuid4()),
        "authorization": "Bearer fake_token",
    }

    sanitized = sanitize_tool_arguments(malicious_llm_args)

    # Legitimate customer arguments must remain
    assert sanitized["customerName"] == "John Doe"
    assert sanitized["customerPhone"] == "+919876543210"

    # Protected multi-tenant context keys must be stripped
    for key in PROTECTED_CONTEXT_KEYS:
        assert key not in sanitized, f"Security violation: protected key '{key}' was not stripped"


def test_tool_argument_validation_rejects_missing_required_fields():
    """Verifies that invalid or incomplete tool payloads fail validation before execution."""
    is_valid, err = validate_tool_arguments("create_callback_lead", {"customerName": "Only Name"})
    assert is_valid is False
    assert "Missing required parameter 'customerPhone'" in err
