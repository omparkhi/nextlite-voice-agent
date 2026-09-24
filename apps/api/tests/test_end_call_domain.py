from unittest.mock import AsyncMock
import pytest
from app.domain.tool_registry import (
    CANONICAL_PLATFORM_TOOLS,
    CANONICAL_TOOL_LABEL_MAP,
    CANONICAL_TOOL_REGISTRY,
    get_canonical_tool,
    normalize_tool_id,
)
from app.services.tool_execution_service import ToolExecutionService


def test_end_call_in_canonical_platform_tools():
    assert "end_call" in CANONICAL_PLATFORM_TOOLS


def test_end_call_in_canonical_registry():
    tool = CANONICAL_TOOL_REGISTRY.get("end_call")
    assert tool is not None
    assert tool.name == "end_call"
    assert tool.display_name == "End Call"
    assert tool.category == "Telephony"
    assert tool.parameters.get("type") == "object"
    assert "reason" in tool.parameters.get("properties", {})


def test_normalize_end_call_variants():
    assert normalize_tool_id("end_call") == "end_call"
    assert normalize_tool_id("end call") == "end_call"
    assert normalize_tool_id("hangup") == "end_call"
    assert normalize_tool_id("hang up") == "end_call"
    assert normalize_tool_id("terminate_call") == "end_call"
    assert normalize_tool_id("disconnect_call") == "end_call"


@pytest.mark.asyncio
async def test_tool_execution_service_end_call():
    import uuid
    service = ToolExecutionService(session=AsyncMock())
    result = await service.execute_tool(
        tool_name="end_call",
        arguments={"reason": "Customer finished booking and said goodbye"},
        trusted_tenant_id=uuid.uuid4(),
    )
    assert result["success"] is True
    assert result["action"] == "HANGUP"
    assert result["reason"] == "Customer finished booking and said goodbye"
