"""Test Suite for Emergency Handling & Live Call Transfer Domain.

Tests:
1. transfer_call canonical tool definition & schema validation
2. Tool name normalization variants ('transfer_emergency_call', 'emergency_transfer', 'escalate_call')
3. Tool execution service handling of transfer_call
4. Dynamic lookup of emergency escalation phone numbers
"""

import uuid
import pytest
from app.domain.tool_registry import (
    CANONICAL_PLATFORM_TOOLS,
    CANONICAL_TOOL_REGISTRY,
    normalize_tool_id,
    validate_tool_arguments,
    sanitize_tool_arguments,
    get_canonical_tool,
)
from app.services.tool_execution_service import ToolExecutionService


def test_transfer_call_in_canonical_platform_tools():
    assert "transfer_call" in CANONICAL_PLATFORM_TOOLS


def test_transfer_call_in_canonical_registry():
    tool_def = CANONICAL_TOOL_REGISTRY.get("transfer_call")
    assert tool_def is not None
    assert tool_def.id == "transfer_call"
    assert tool_def.name == "transfer_call"
    assert tool_def.category == "Telephony"
    assert "reason" in tool_def.parameters["properties"]
    assert "reason" in tool_def.parameters["required"]


def test_normalize_transfer_call_variants():
    variants = [
        "transfer_call",
        "transfer call",
        "transfer_emergency_call",
        "transfer emergency call",
        "emergency_transfer",
        "emergency transfer",
        "emergency_escalation",
        "transfer_to_doctor",
        "escalate_call",
        "transfer",
    ]
    for v in variants:
        assert normalize_tool_id(v) == "transfer_call", f"Failed for variant: {v}"


def test_validate_transfer_call_arguments():
    # Valid arguments with reason
    valid_args = {
        "reason": "Severe acute bleeding post extraction",
        "patientName": "Rahul Verma",
        "severity": "CRITICAL"
    }
    is_valid, err = validate_tool_arguments("transfer_call", valid_args)
    assert is_valid is True
    assert err is None

    # Invalid arguments missing required reason
    invalid_args = {
        "patientName": "Rahul Verma"
    }
    is_valid, err = validate_tool_arguments("transfer_call", invalid_args)
    assert is_valid is False
    assert "reason" in str(err)


@pytest.mark.asyncio
async def test_tool_execution_service_transfer_call():
    class DummySession:
        async def execute(self, *args, **kwargs):
            class DummyResult:
                def scalar_one_or_none(self):
                    return None
            return DummyResult()

    svc = ToolExecutionService(session=DummySession())
    tenant_id = uuid.uuid4()

    result = await svc.execute_tool(
        tool_name="transfer_emergency_call",
        arguments={
            "reason": "Accidental facial trauma and broken tooth",
            "patientName": "Amit Patil",
            "severity": "CRITICAL"
        },
        trusted_tenant_id=tenant_id
    )

    assert result["success"] is True
    assert result["action"] == "TRANSFER"
    assert result["severity"] == "CRITICAL"
    assert "targetPhone" in result
    assert "Emergency call transfer initiated" in result["message"]


def test_filter_agent_runtime_tools_respects_emergency_transfer_disabled():
    from app.domain.tool_registry import filter_agent_runtime_tools

    # Default all tools enabled
    tools = filter_agent_runtime_tools(
        tools_cfg={"enabled": True},
        guardrails_cfg={"emergencyTransferEnabled": False}
    )
    assert not any(t.name in ("transfer_call", "transfer_emergency_call") for t in tools)
    assert any(t.name == "book_appointment" for t in tools)
    assert any(t.name == "end_call" for t in tools)

    # When emergency transfer is enabled
    tools_enabled = filter_agent_runtime_tools(
        tools_cfg={"enabled": True},
        guardrails_cfg={"emergencyTransferEnabled": True, "emergencyPhone": "+919876543210"}
    )
    assert any(t.name == "transfer_call" for t in tools_enabled)


def test_prompt_compiler_respects_emergency_transfer_disabled():
    from app.services.prompt_compiler_service import prompt_compiler

    compiled = prompt_compiler.compile_system_prompt(
        configuration={
            "guardrails": {
                "emergencyTransferEnabled": False,
            },
            "instructions": "In an emergency, tell caller to contact doctor on WhatsApp at +919876543210."
        }
    )

    assert "Live phone call transfer is DISABLED" in compiled
    assert "invoke the `transfer_call` tool" not in compiled
    assert "In an emergency, tell caller to contact doctor on WhatsApp" in compiled

