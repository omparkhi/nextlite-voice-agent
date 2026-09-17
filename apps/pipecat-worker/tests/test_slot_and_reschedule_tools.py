"""Unit tests for check_available_slots, slot conflict resolution, and reschedule_appointment."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.runtime_config_client import (
    RuntimeAgentConfig,
    RuntimePromptConfig,
    RuntimeDeploymentMetadata,
    RuntimeTenantConfig,
    RuntimeAgentMetadata,
    RuntimeVoiceConfig,
    RuntimeLanguageConfig,
    RuntimeBehaviorConfig,
    RuntimeKnowledgeConfig,
    RuntimeVariableConfig,
    RuntimeToolConfig,
    RuntimeToolDefinition,
)
from app.tools.tool_registry import ToolRegistry, ToolRuntimeContext
from app.tools.slot_tool import CHECK_SLOTS_TOOL_NAME
from app.tools.appointment_tool import BOOK_APPOINTMENT_TOOL_NAME, RESCHEDULE_APPOINTMENT_TOOL_NAME
from pipecat.services.llm_service import FunctionCallParams


def create_slot_test_config() -> RuntimeAgentConfig:
    return RuntimeAgentConfig(
        deployment=RuntimeDeploymentMetadata(deploymentId="dep-slot-1", versionId="ver-1"),
        tenant=RuntimeTenantConfig(tenantId="tenant-slot-1"),
        agent=RuntimeAgentMetadata(agentId="agent-slot-1", agentName="Dental Assistant"),
        prompt=RuntimePromptConfig(compiledSystemPrompt="You are a dental receptionist"),
        voice=RuntimeVoiceConfig(ttsModel="bulbul:v3", voiceId="ananya"),
        language=RuntimeLanguageConfig(primary="mr-IN"),
        runtime=RuntimeBehaviorConfig(modelProvider="sarvam", llmModel="sarvam-105b"),
        knowledge=RuntimeKnowledgeConfig(enabled=False),
        variables=RuntimeVariableConfig(inputVariables=[], outputVariables=[]),
        tools=RuntimeToolConfig(
            enabled=True,
            tools=[
                RuntimeToolDefinition(toolId=CHECK_SLOTS_TOOL_NAME, name=CHECK_SLOTS_TOOL_NAME, description="Check slots", enabled=True),
                RuntimeToolDefinition(toolId=BOOK_APPOINTMENT_TOOL_NAME, name=BOOK_APPOINTMENT_TOOL_NAME, description="Book appointment", enabled=True),
                RuntimeToolDefinition(toolId=RESCHEDULE_APPOINTMENT_TOOL_NAME, name=RESCHEDULE_APPOINTMENT_TOOL_NAME, description="Reschedule appointment", enabled=True),
            ]
        )
    )


class MockFunctionCallParams:
    def __init__(self, arguments: Dict[str, Any], function_name: str = "test_func", tool_call_id: str = "call_123"):
        self.function_name = function_name
        self.tool_call_id = tool_call_id
        self.arguments = arguments
        self.result: Optional[Any] = None
        self.callback_called = False

    async def result_callback(self, result: Any, *args, **kwargs):
        self.result = result
        self.callback_called = True


@pytest.mark.asyncio
async def test_slot_check_available_slot():
    """Test slot tool returns open slots when preferred slot is free."""
    config = create_slot_test_config()
    registry = ToolRegistry()
    ctx = ToolRuntimeContext(
        deployment_id="dep-slot-1",
        tenant_id="tenant-slot-1",
        caller_phone="+919876543210",
        api_url="http://localhost:3001",
        worker_secret="test-secret",
    )
    tools = registry.resolve_tools(config, context=ctx)
    slot_tool = next(t for t in tools if t.name == CHECK_SLOTS_TOOL_NAME)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "bookingDate": "2026-09-16",
        "preferredTime": "06:00 PM",
        "slotAvailable": True,
        "bookedSlots": ["12:00 PM"],
        "availableSlots": ["10:00 AM", "06:00 PM", "07:00 PM"],
        "totalAvailable": 3,
        "hasExistingBooking": False,
        "existingBooking": None,
    }

    params = MockFunctionCallParams(
        function_name=CHECK_SLOTS_TOOL_NAME,
        tool_call_id="call-1",
        arguments={"bookingDate": "2026-09-16", "preferredTime": "06:00 PM"},
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        await slot_tool.handler(params)

    assert params.callback_called is True
    assert params.result.get("success") is True
    assert params.result.get("slotAvailable") is True
    assert "06:00 PM" in params.result.get("availableSlots")


@pytest.mark.asyncio
async def test_slot_check_busy_slot_offers_alternatives():
    """Test slot tool detects busy slot and offers available alternatives."""
    config = create_slot_test_config()
    registry = ToolRegistry()
    ctx = ToolRuntimeContext(
        deployment_id="dep-slot-1",
        tenant_id="tenant-slot-1",
        caller_phone="+919876543210",
        api_url="http://localhost:3001",
        worker_secret="test-secret",
    )
    tools = registry.resolve_tools(config, context=ctx)
    slot_tool = next(t for t in tools if t.name == CHECK_SLOTS_TOOL_NAME)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "bookingDate": "2026-09-16",
        "preferredTime": "12:00 PM",
        "slotAvailable": False,
        "bookedSlots": ["12:00 PM"],
        "availableSlots": ["01:00 PM", "02:30 PM", "05:00 PM"],
        "totalAvailable": 3,
        "hasExistingBooking": False,
        "existingBooking": None,
    }

    params = MockFunctionCallParams(
        function_name=CHECK_SLOTS_TOOL_NAME,
        tool_call_id="call-2",
        arguments={"bookingDate": "2026-09-16", "preferredTime": "12:00 PM"},
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        await slot_tool.handler(params)

    assert params.callback_called is True
    assert params.result.get("success") is True
    assert params.result.get("slotAvailable") is False
    assert "01:00 PM" in params.result.get("availableSlots")
    assert "12:00 PM is already booked" in params.result.get("guidance", "")


@pytest.mark.asyncio
async def test_reschedule_appointment_tool():
    """Test reschedule_appointment tool calls internal API and returns success."""
    config = create_slot_test_config()
    registry = ToolRegistry()
    ctx = ToolRuntimeContext(
        deployment_id="dep-slot-1",
        tenant_id="tenant-slot-1",
        caller_phone="+919876543210",
        api_url="http://localhost:3001",
        worker_secret="test-secret",
    )
    tools = registry.resolve_tools(config, context=ctx)
    reschedule_tool = next(t for t in tools if t.name == RESCHEDULE_APPOINTMENT_TOOL_NAME)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "success": True,
        "appointment": {
            "id": "apt-123",
            "bookingDate": "2026-09-17",
            "bookingTime": "04:00 PM",
        },
        "message": "Appointment rescheduled to 2026-09-17 at 04:00 PM",
    }

    params = MockFunctionCallParams(
        function_name=RESCHEDULE_APPOINTMENT_TOOL_NAME,
        tool_call_id="call-3",
        arguments={"newBookingDate": "2026-09-17", "newBookingTime": "04:00 PM", "reason": "Patient requested evening slot"},
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        await reschedule_tool.handler(params)

    assert params.callback_called is True
    assert params.result.get("success") is True
    assert params.result.get("newTime") == "04:00 PM"
