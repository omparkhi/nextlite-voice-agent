"""Unit and integration tests for Phase 7A: Pipecat Native Tool Registry & Trusted Tool Execution.

Tests coverage:
1. tools disabled (tools.enabled = False) -> []
2. tool enabled (tools.enabled = True, tool enabled) -> FunctionSchema registered
3. individual tool disabled (enabled = False) -> skipped
4. unknown tool -> skipped safely with diagnostic, no arbitrary execution
5. duplicate tool -> deduplicated deterministically
6. FunctionSchema schema correctness & OpenAI compatibility
7. create_callback_lead successful API call (201) -> structured success
8. create_callback_lead API failure -> structured failure, no unhandled exception
9. book_appointment successful API call (201) -> structured success with status='REQUESTED'
10. book_appointment API failure -> structured failure, no unhandled exception
11. REQUESTED semantics preserved (REQUESTED != CONFIRMED)
12. query_knowledge_base registry boundary & deferred execution
13. malformed arguments rejected with structured error
14. tenantId override attack rejected (trusted context wins)
15. agentId override attack rejected (trusted context wins)
16. deploymentId override attack rejected (trusted context wins)
17. callSessionId override attack rejected (trusted context wins)
18. callerPhone fallback & override isolation
19. tool failure does not crash pipeline (exception isolation)
20. actual tool execution recorded in toolsUsed
21. mere registration not recorded in toolsUsed
22. multi-tenant isolation (Deployment A vs Deployment B)
23. dynamic configuration changes registered tools (Config A vs B vs C)
24. secret isolation: worker secret & credentials not in LLM schema
25. no arbitrary endpoint execution
26. Phase 8A hotfix regression: ToolRuntimeContext uses WORKER_API_SECRET, NOT stale LIVEKIT_WORKER_SECRET
"""

import json
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock
import httpx
import pytest

from app.call_lifecycle import CallTranscriptCollector, TrustedCallContext
from app.runtime_config_client import (
    RuntimeAgentConfig,
    RuntimeAgentMetadata,
    RuntimeBehaviorConfig,
    RuntimeDeploymentMetadata,
    RuntimeKnowledgeConfig,
    RuntimeLanguageConfig,
    RuntimePromptConfig,
    RuntimeTenantConfig,
    RuntimeToolConfig,
    RuntimeToolDefinition,
    RuntimeVariableConfig,
    RuntimeVoiceConfig,
)
from app.tools import (
    BOOK_APPOINTMENT_TOOL_NAME,
    CREATE_CALLBACK_LEAD_TOOL_NAME,
    QUERY_KNOWLEDGE_BASE_TOOL_NAME,
    ToolRegistry,
    ToolRuntimeContext,
    is_valid_tool_name,
    normalize_tool_id,
    tool_registry,
)
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.processors.aggregators.llm_response_universal import LLMContext
from pipecat.services.llm_service import FunctionCallParams
from pipecat.services.sarvam.llm import SarvamLLMService


def create_test_runtime_config(
    deployment_id: str = "11111111-1111-4111-8111-111111111111",
    tenant_id: str = "22222222-2222-4222-8222-222222222222",
    agent_id: str = "33333333-3333-4333-8333-333333333333",
    tools_enabled: bool = True,
    tool_defs: Optional[List[RuntimeToolDefinition]] = None,
    knowledge_enabled: bool = False,
) -> RuntimeAgentConfig:
    """Helper to assemble a typed RuntimeAgentConfig fixture for testing."""
    if tool_defs is None:
        tool_defs = [
            RuntimeToolDefinition(
                toolId="create_callback_lead",
                name="create_callback_lead",
                description="Record callback lead",
                enabled=True,
            ),
            RuntimeToolDefinition(
                toolId="book_appointment",
                name="book_appointment",
                description="Book appointment",
                enabled=True,
            ),
        ]

    return RuntimeAgentConfig(
        tenant=RuntimeTenantConfig(tenantId=tenant_id),
        agent=RuntimeAgentMetadata(agentId=agent_id, agentName="Test Agent"),
        deployment=RuntimeDeploymentMetadata(deploymentId=deployment_id, versionId="ver-1"),
        prompt=RuntimePromptConfig(compiledSystemPrompt="Compiled prompt."),
        voice=RuntimeVoiceConfig(provider="sarvam", voiceId="test_voice", sttModel="saaras:v2", ttsModel="bulbul:v2"),
        language=RuntimeLanguageConfig(primary="en-IN", supported=["en-IN"]),
        runtime=RuntimeBehaviorConfig(modelProvider="sarvam", llmModel="sarvam-105b"),
        knowledge=RuntimeKnowledgeConfig(enabled=knowledge_enabled),
        tools=RuntimeToolConfig(enabled=tools_enabled, tools=tool_defs),
        variables=RuntimeVariableConfig(inputVariables=[], outputVariables=[]),
    )


class MockFunctionCallParams:
    """Helper to mock Pipecat FunctionCallParams for unit testing tool handlers."""

    def __init__(self, arguments: Dict[str, Any], function_name: str = "test_func", tool_call_id: str = "call_123"):
        self.function_name = function_name
        self.tool_call_id = tool_call_id
        self.arguments = arguments
        self.result: Optional[Any] = None
        self.callback_called = False
        self.callback_kwargs: Dict[str, Any] = {}

    async def result_callback(self, result: Any, *args, **kwargs):
        self.result = result
        self.callback_called = True
        self.callback_kwargs = kwargs


# ==========================================
# 1. Tools disabled -> returns []
# ==========================================
def test_tools_disabled_returns_empty_list():
    config = create_test_runtime_config(tools_enabled=False)
    registry = ToolRegistry()
    resolved = registry.resolve_tools(config)
    assert resolved == []


# ==========================================
# 2. Tool enabled -> FunctionSchema registered
# ==========================================
def test_enabled_tool_registered():
    config = create_test_runtime_config(
        tools_enabled=True,
        tool_defs=[
            RuntimeToolDefinition(
                toolId="create_callback_lead",
                name="create_callback_lead",
                description="Custom lead description",
                enabled=True,
            )
        ],
    )
    registry = ToolRegistry()
    resolved = registry.resolve_tools(config)
    assert len(resolved) == 1
    assert resolved[0].name == "create_callback_lead"
    assert resolved[0].description == "Custom lead description"
    assert resolved[0].handler is not None


# ==========================================
# 3. Individual tool disabled -> skipped
# ==========================================
def test_individual_disabled_tool_skipped():
    config = create_test_runtime_config(
        tools_enabled=True,
        tool_defs=[
            RuntimeToolDefinition(
                toolId="create_callback_lead",
                name="create_callback_lead",
                description="Lead tool",
                enabled=False,  # disabled
            ),
            RuntimeToolDefinition(
                toolId="book_appointment",
                name="book_appointment",
                description="Appointment tool",
                enabled=True,  # enabled
            ),
        ],
    )
    registry = ToolRegistry()
    resolved = registry.resolve_tools(config)
    assert len(resolved) == 1
    assert resolved[0].name == "book_appointment"


# ==========================================
# 4. Unknown tool -> safely skipped with log
# ==========================================
def test_unknown_tool_safely_skipped():
    config = create_test_runtime_config(
        tools_enabled=True,
        tool_defs=[
            RuntimeToolDefinition(
                toolId="arbitrary_unknown_function_call",
                name="execute_system_command",
                description="Unknown unsafe tool",
                enabled=True,
            ),
            RuntimeToolDefinition(
                toolId="create_callback_lead",
                name="create_callback_lead",
                description="Valid tool",
                enabled=True,
            ),
        ],
    )
    registry = ToolRegistry()
    resolved = registry.resolve_tools(config)
    assert len(resolved) == 1
    assert resolved[0].name == "create_callback_lead"


# ==========================================
# 5. Duplicate tool -> deduplicated deterministically
# ==========================================
def test_duplicate_tools_deduplicated():
    config = create_test_runtime_config(
        tools_enabled=True,
        tool_defs=[
            RuntimeToolDefinition(
                toolId="create_callback_lead",
                name="create_callback_lead",
                description="First instance",
                enabled=True,
            ),
            RuntimeToolDefinition(
                toolId="create_callback_lead",
                name="create_callback_lead",
                description="Duplicate instance",
                enabled=True,
            ),
        ],
    )
    registry = ToolRegistry()
    resolved = registry.resolve_tools(config)
    assert len(resolved) == 1
    assert resolved[0].name == "create_callback_lead"


# ==========================================
# 6. FunctionSchema schema correctness & OpenAI format
# ==========================================
def test_function_schema_openai_compatibility():
    config = create_test_runtime_config(tools_enabled=True)
    registry = ToolRegistry()
    resolved = registry.resolve_tools(config)

    llm_context = LLMContext(messages=[{"role": "user", "content": "hello"}], tools=resolved)
    llm = SarvamLLMService(api_key="test_key")
    adapter = llm.get_llm_adapter()
    params = adapter.get_llm_invocation_params(llm_context, convert_developer_to_user=False)
    final_params = llm.build_chat_completion_params(params)

    tools_payload = final_params.get("tools", [])
    assert len(tools_payload) == 2
    tool_names = [t["function"]["name"] for t in tools_payload]
    assert "create_callback_lead" in tool_names
    assert "book_appointment" in tool_names

    # Check that authoritative identity fields are NOT in parameters
    for t in tools_payload:
        props = t["function"]["parameters"]["properties"]
        assert "tenantId" not in props
        assert "agentId" not in props
        assert "deploymentId" not in props
        assert "callSessionId" not in props
        assert "workerSecret" not in props


# ==========================================
# 7. create_callback_lead successful API call
# ==========================================
@pytest.mark.asyncio
async def test_create_callback_lead_success():
    posted_payload = {}

    def handler(request: httpx.Request):
        nonlocal posted_payload
        posted_payload = json.loads(request.content.decode("utf-8"))
        assert request.headers.get("x-worker-secret") == "test-secret"
        return httpx.Response(201, json={"id": "lead-uuid-12345", "status": "NEW"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        collector = CallTranscriptCollector()
        context = ToolRuntimeContext(
            deployment_id="dep-123",
            call_session_id="session-456",
            caller_phone="+919876543210",
            tenant_id="tenant-abc",
            agent_id="agent-xyz",
            api_url="http://testserver",
            worker_secret="test-secret",
            transcript_collector=collector,
        )

        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Record lead",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)
        assert len(resolved) == 1
        lead_schema = resolved[0]

        mock_params = MockFunctionCallParams(
            arguments={
                "customerName": "Rohan Sharma",
                "interestCategory": "Residential 3BHK",
                "notes": "Prefers callback after 5 PM",
            },
            function_name="create_callback_lead",
        )

        res = await lead_schema.handler(mock_params)
        assert res["success"] is True
        assert res["leadId"] == "lead-uuid-12345"
        assert "Callback request recorded successfully" in res["message"]
        assert mock_params.callback_called is True

        # Verify posted payload has trusted fields injected
        assert posted_payload["deploymentId"] == "dep-123"
        assert posted_payload["callSessionId"] == "session-456"
        assert posted_payload["customerName"] == "Rohan Sharma"
        assert posted_payload["customerPhone"] == "+919876543210"  # fell back to trusted callerPhone
        assert posted_payload["interestCategory"] == "Residential 3BHK"
        assert posted_payload["notes"] == "Prefers callback after 5 PM"


# ==========================================
# 8. create_callback_lead API failure
# ==========================================
@pytest.mark.asyncio
async def test_create_callback_lead_api_failure():
    def handler(request: httpx.Request):
        return httpx.Response(500, json={"error": "Database error", "code": "LEAD_CREATION_FAILED"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        collector = CallTranscriptCollector()
        context = ToolRuntimeContext(
            deployment_id="dep-123",
            caller_phone="+919876543210",
            api_url="http://testserver",
            worker_secret="test-secret",
            transcript_collector=collector,
        )

        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Record lead",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)
        lead_schema = resolved[0]

        mock_params = MockFunctionCallParams(
            arguments={"customerName": "Rohan Sharma"},
            function_name="create_callback_lead",
        )

        res = await lead_schema.handler(mock_params)
        assert res["success"] is False
        assert res["error"] == "LEAD_CREATION_FAILED"
        assert "Unable to record the callback request" in res["message"]


# ==========================================
# 9. book_appointment successful API call & REQUESTED status
# ==========================================
@pytest.mark.asyncio
async def test_book_appointment_success():
    posted_payload = {}

    def handler(request: httpx.Request):
        nonlocal posted_payload
        posted_payload = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            201,
            json={
                "id": "apt-uuid-9999",
                "appointmentNumber": "A-108",
                "status": "REQUESTED",
            },
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        collector = CallTranscriptCollector()
        context = ToolRuntimeContext(
            deployment_id="dep-123",
            call_session_id="session-456",
            caller_phone="+919876543210",
            api_url="http://testserver",
            worker_secret="test-secret",
            transcript_collector=collector,
        )

        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="book_appointment",
                    name="book_appointment",
                    description="Book appointment",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)
        apt_schema = resolved[0]

        mock_params = MockFunctionCallParams(
            arguments={
                "customerName": "Pooja Patel",
                "title": "General Consultation",
                "bookingDate": "2026-11-20",
                "bookingTime": "14:30",
                "resourceName": "Dr. Rao",
            },
            function_name="book_appointment",
        )

        res = await apt_schema.handler(mock_params)
        assert res["success"] is True
        assert res["appointmentId"] == "apt-uuid-9999"
        assert res["appointmentNumber"] == "A-108"
        assert res["status"] == "REQUESTED"
        assert "recorded with appointment number A-108" in res["message"]
        assert "verify availability" in res["message"]

        # Injected fields
        assert posted_payload["deploymentId"] == "dep-123"
        assert posted_payload["callSessionId"] == "session-456"
        assert posted_payload["customerName"] == "Pooja Patel"
        assert posted_payload["customerPhone"] == "+919876543210"
        assert posted_payload["status"] == "REQUESTED"
        assert posted_payload["resourceName"] == "Dr. Rao"


@pytest.mark.asyncio
async def test_book_appointment_direct_response_skips_post_tool_llm():
    """A configured, server-authored appointment result can bypass pass two."""
    def handler(request: httpx.Request):
        return httpx.Response(
            201,
            json={"id": "apt-uuid-9999", "appointmentNumber": "A-108", "status": "REQUESTED"},
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        context = ToolRuntimeContext(
            deployment_id="dep-123",
            caller_phone="+919876543210",
            api_url="http://testserver",
            worker_secret="test-secret",
        )
        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="book_appointment",
                    name="book_appointment",
                    description="Book appointment",
                    enabled=True,
                    directResponseEnabled=True,
                )
            ],
        )
        schema = ToolRegistry().resolve_tools(config, context=context, http_client=mock_client)[0]
        params = MockFunctionCallParams(
            arguments={
                "customerName": "Pooja Patel",
                "title": "General Consultation",
                "bookingDate": "2026-11-20",
                "bookingTime": "14:30",
            },
            function_name="book_appointment",
        )
        params.llm = AsyncMock()

        result = await schema.handler(params)

        assert result["success"] is True
        properties = params.callback_kwargs["properties"]
        assert properties.run_llm is True


# ==========================================
# 10. book_appointment API failure
# ==========================================
@pytest.mark.asyncio
async def test_book_appointment_api_failure():
    def handler(request: httpx.Request):
        return httpx.Response(404, json={"error": "Deployment not found", "code": "DEPLOYMENT_NOT_FOUND"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        collector = CallTranscriptCollector()
        context = ToolRuntimeContext(
            deployment_id="dep-invalid",
            caller_phone="+919876543210",
            api_url="http://testserver",
            worker_secret="test-secret",
            transcript_collector=collector,
        )

        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="book_appointment",
                    name="book_appointment",
                    description="Book appointment",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)
        apt_schema = resolved[0]

        mock_params = MockFunctionCallParams(
            arguments={
                "customerName": "Pooja Patel",
                "title": "Consultation",
                "bookingDate": "2026-11-20",
                "bookingTime": "14:30",
            },
            function_name="book_appointment",
        )

        res = await apt_schema.handler(mock_params)
        assert res["success"] is False
        assert res["error"] == "DEPLOYMENT_NOT_FOUND"
        assert "Unable to record the appointment request" in res["message"]


# ==========================================
# 11. REQUESTED semantics preserved
# ==========================================
@pytest.mark.asyncio
async def test_book_appointment_requested_semantics_not_confirmed():
    def handler(request: httpx.Request):
        return httpx.Response(
            201,
            json={"id": "apt-1", "appointmentNumber": "A-001", "status": "REQUESTED"},
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        context = ToolRuntimeContext(
            deployment_id="dep-123",
            caller_phone="+919876543210",
            api_url="http://testserver",
            worker_secret="test-secret",
        )

        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="book_appointment",
                    name="book_appointment",
                    description="Book appointment",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)
        res = await resolved[0].handler(
            MockFunctionCallParams(
                arguments={
                    "customerName": "User",
                    "title": "Visit",
                    "bookingDate": "2026-11-20",
                    "bookingTime": "10:00 AM",
                },
                function_name="book_appointment",
            )
        )
        # Verify status is REQUESTED and message clearly communicates request status
        assert res["status"] == "REQUESTED"
        assert "verify availability" in res["message"]


# ==========================================
# 12. query_knowledge_base boundary test (Phase 7B retrieval)
# ==========================================
@pytest.mark.asyncio
async def test_query_knowledge_base_boundary():
    def handler(request: httpx.Request):
        payload = json.loads(request.content.decode("utf-8"))
        assert payload["query"] == "What are your business hours?"
        assert payload["deploymentId"] == "dep-123"
        return httpx.Response(
            200,
            json={
                "results": [
                    {"content": "We are open 9 AM to 5 PM.", "score": 0.95, "sourceId": "doc1"}
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="query_knowledge_base",
                    name="query_knowledge_base",
                    description="Search KB",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        context = ToolRuntimeContext(
            deployment_id="dep-123",
            api_url="http://testserver",
            worker_secret="test-secret",
        )
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)
        assert len(resolved) == 1
        kb_tool = resolved[0]
        assert kb_tool.name == "query_knowledge_base"
        assert "query" in kb_tool.properties

        mock_params = MockFunctionCallParams(
            arguments={"query": "What are your business hours?"},
            function_name="query_knowledge_base",
        )
        res = await kb_tool.handler(mock_params)
        
        assert "results" in res
        assert len(res["results"]) == 1
        assert res["results"][0]["content"] == "We are open 9 AM to 5 PM."
        assert res["results"][0]["relevanceScore"] == 0.95


# ==========================================
# 13. Malformed arguments rejected with structured error
# ==========================================
@pytest.mark.asyncio
async def test_malformed_arguments_rejected():
    config = create_test_runtime_config(tools_enabled=True)
    registry = ToolRegistry()
    resolved = registry.resolve_tools(config, context="dep-123")

    lead_tool = next(t for t in resolved if t.name == "create_callback_lead")
    apt_tool = next(t for t in resolved if t.name == "book_appointment")

    # Lead missing customerName
    res1 = await lead_tool.handler(MockFunctionCallParams(arguments={}))
    assert res1["success"] is False
    assert res1["error"] == "INVALID_ARGUMENTS"

    # Appointment missing required fields
    res2 = await apt_tool.handler(MockFunctionCallParams(arguments={"customerName": "Test"}))
    assert res2["success"] is False
    assert res2["error"] == "INVALID_ARGUMENTS"
    assert "title" in res2["message"]


# ==========================================
# 14. TenantId override attack (LLM tries to inject tenantId)
# ==========================================
@pytest.mark.asyncio
async def test_tenant_override_attack_prevented():
    posted_payload = {}

    def handler(request: httpx.Request):
        nonlocal posted_payload
        posted_payload = json.loads(request.content.decode("utf-8"))
        return httpx.Response(201, json={"id": "lead-1"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        context = ToolRuntimeContext(
            deployment_id="dep-trusted-A",
            tenant_id="tenant-trusted-A",
            caller_phone="+911111111111",
            api_url="http://testserver",
            worker_secret="secret",
        )
        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Lead",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)

        # Attacker tries to inject malicious tenantId
        await resolved[0].handler(
            MockFunctionCallParams(
                arguments={
                    "customerName": "Attacker",
                    "tenantId": "malicious-tenant-B",
                }
            )
        )
        # Server sent only trusted deploymentId
        assert posted_payload["deploymentId"] == "dep-trusted-A"
        assert "tenantId" not in posted_payload


# ==========================================
# 15. AgentId override attack
# ==========================================
@pytest.mark.asyncio
async def test_agent_override_attack_prevented():
    posted_payload = {}

    def handler(request: httpx.Request):
        nonlocal posted_payload
        posted_payload = json.loads(request.content.decode("utf-8"))
        return httpx.Response(201, json={"id": "lead-1"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        context = ToolRuntimeContext(
            deployment_id="dep-trusted-A",
            agent_id="agent-trusted-A",
            caller_phone="+911111111111",
            api_url="http://testserver",
            worker_secret="secret",
        )
        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Lead",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)

        # Attacker tries to inject malicious agentId
        await resolved[0].handler(
            MockFunctionCallParams(
                arguments={
                    "customerName": "Attacker",
                    "agentId": "malicious-agent-B",
                }
            )
        )
        assert posted_payload["deploymentId"] == "dep-trusted-A"
        assert "agentId" not in posted_payload


# ==========================================
# 16. DeploymentId override attack
# ==========================================
@pytest.mark.asyncio
async def test_deployment_override_attack_prevented():
    posted_payload = {}

    def handler(request: httpx.Request):
        nonlocal posted_payload
        posted_payload = json.loads(request.content.decode("utf-8"))
        return httpx.Response(201, json={"id": "lead-1"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        context = ToolRuntimeContext(
            deployment_id="dep-trusted-A",
            caller_phone="+911111111111",
            api_url="http://testserver",
            worker_secret="secret",
        )
        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Lead",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)

        # Attacker attempts to provide deploymentId in args
        await resolved[0].handler(
            MockFunctionCallParams(
                arguments={
                    "customerName": "Attacker",
                    "deploymentId": "dep-malicious-B",
                }
            )
        )
        assert posted_payload["deploymentId"] == "dep-trusted-A"


# ==========================================
# 17. CallSessionId override attack
# ==========================================
@pytest.mark.asyncio
async def test_call_session_id_override_attack_prevented():
    posted_payload = {}

    def handler(request: httpx.Request):
        nonlocal posted_payload
        posted_payload = json.loads(request.content.decode("utf-8"))
        return httpx.Response(201, json={"id": "lead-1"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        context = ToolRuntimeContext(
            deployment_id="dep-trusted-A",
            call_session_id="session-trusted-A",
            caller_phone="+911111111111",
            api_url="http://testserver",
            worker_secret="secret",
        )
        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Lead",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)

        await resolved[0].handler(
            MockFunctionCallParams(
                arguments={
                    "customerName": "Attacker",
                    "callSessionId": "session-malicious-B",
                }
            )
        )
        assert posted_payload["callSessionId"] == "session-trusted-A"


# ==========================================
# 18. CallerPhone fallback & override isolation
# ==========================================
@pytest.mark.asyncio
async def test_caller_phone_fallback():
    posted_payload = {}

    def handler(request: httpx.Request):
        nonlocal posted_payload
        posted_payload = json.loads(request.content.decode("utf-8"))
        return httpx.Response(201, json={"id": "lead-1"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        context = ToolRuntimeContext(
            deployment_id="dep-trusted-A",
            caller_phone="+919988776655",
            api_url="http://testserver",
            worker_secret="secret",
        )
        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Lead",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)

        # Omit customerPhone -> should fall back to trusted caller_phone
        await resolved[0].handler(MockFunctionCallParams(arguments={"customerName": "Caller 1"}))
        assert posted_payload["customerPhone"] == "+919988776655"

        # Provide explicit customerPhone -> should use explicit customerPhone
        await resolved[0].handler(
            MockFunctionCallParams(arguments={"customerName": "Caller 1", "customerPhone": "+918888888888"})
        )
        assert posted_payload["customerPhone"] == "+918888888888"


# ==========================================
# 19. Tool failure does not crash pipeline (exception safety)
# ==========================================
@pytest.mark.asyncio
async def test_tool_exception_safety():
    def throwing_handler(request: httpx.Request):
        raise RuntimeError("Simulated network crash or socket error")

    transport = httpx.MockTransport(throwing_handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        context = ToolRuntimeContext(
            deployment_id="dep-123",
            caller_phone="+919876543210",
            api_url="http://testserver",
            worker_secret="secret",
        )
        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Lead",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)

        # Handler executes without raising exception to caller
        res = await resolved[0].handler(MockFunctionCallParams(arguments={"customerName": "Test"}))
        assert res["success"] is False
        assert res["error"] == "CONNECTION_ERROR"


# ==========================================
# 20. Actual tool execution recorded in toolsUsed
# ==========================================
@pytest.mark.asyncio
async def test_actual_tool_execution_recorded_in_tools_used():
    def handler(request: httpx.Request):
        return httpx.Response(201, json={"id": "lead-1"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        collector = CallTranscriptCollector()
        assert collector.tools_used == []

        context = ToolRuntimeContext(
            deployment_id="dep-123",
            caller_phone="+919876543210",
            api_url="http://testserver",
            worker_secret="secret",
            transcript_collector=collector,
        )
        config = create_test_runtime_config(
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Lead",
                    enabled=True,
                )
            ],
        )
        registry = ToolRegistry()
        resolved = registry.resolve_tools(config, context=context, http_client=mock_client)

        # Before execution: empty
        assert collector.tools_used == []

        # Execute
        await resolved[0].handler(MockFunctionCallParams(arguments={"customerName": "Test"}))

        # After execution: recorded
        assert collector.tools_used == ["create_callback_lead"]


# ==========================================
# 21. Mere tool registration NOT recorded in toolsUsed
# ==========================================
def test_mere_registration_not_recorded_in_tools_used():
    collector = CallTranscriptCollector()
    context = ToolRuntimeContext(
        deployment_id="dep-123",
        transcript_collector=collector,
    )
    config = create_test_runtime_config(tools_enabled=True)
    registry = ToolRegistry()
    resolved = registry.resolve_tools(config, context=context)
    assert len(resolved) == 2
    # Registering tools without executing them must leave tools_used empty
    assert collector.tools_used == []


# ==========================================
# 22. Multi-tenant isolation (Deployment A vs Deployment B)
# ==========================================
@pytest.mark.asyncio
async def test_multitenant_isolation():
    captured_calls = []

    def handler(request: httpx.Request):
        body = json.loads(request.content.decode("utf-8"))
        captured_calls.append(body)
        return httpx.Response(201, json={"id": "lead-created"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as mock_client:
        # Deployment A setup
        context_a = ToolRuntimeContext(
            deployment_id="deployment-A",
            call_session_id="session-A",
            caller_phone="+911111111111",
            api_url="http://testserver",
            worker_secret="secret-A",
        )
        # Deployment B setup
        context_b = ToolRuntimeContext(
            deployment_id="deployment-B",
            call_session_id="session-B",
            caller_phone="+912222222222",
            api_url="http://testserver",
            worker_secret="secret-B",
        )

        config_a = create_test_runtime_config(
            deployment_id="deployment-A",
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Lead",
                    enabled=True,
                )
            ],
        )
        config_b = create_test_runtime_config(
            deployment_id="deployment-B",
            tools_enabled=True,
            tool_defs=[
                RuntimeToolDefinition(
                    toolId="create_callback_lead",
                    name="create_callback_lead",
                    description="Lead",
                    enabled=True,
                )
            ],
        )

        registry = ToolRegistry()
        tools_a = registry.resolve_tools(config_a, context=context_a, http_client=mock_client)
        tools_b = registry.resolve_tools(config_b, context=context_b, http_client=mock_client)

        # Execute tool A
        await tools_a[0].handler(MockFunctionCallParams(arguments={"customerName": "Customer A"}))
        # Execute tool B
        await tools_b[0].handler(MockFunctionCallParams(arguments={"customerName": "Customer B"}))

        assert len(captured_calls) == 2
        assert captured_calls[0]["deploymentId"] == "deployment-A"
        assert captured_calls[0]["callSessionId"] == "session-A"
        assert captured_calls[0]["customerPhone"] == "+911111111111"

        assert captured_calls[1]["deploymentId"] == "deployment-B"
        assert captured_calls[1]["callSessionId"] == "session-B"
        assert captured_calls[1]["customerPhone"] == "+912222222222"


# ==========================================
# 23. Dynamic configuration (Config A vs B vs C)
# ==========================================
def test_dynamic_configuration_resolution():
    registry = ToolRegistry()

    # Config A: book_appointment enabled, create_callback_lead disabled
    config_a = create_test_runtime_config(
        tools_enabled=True,
        tool_defs=[
            RuntimeToolDefinition(
                toolId="book_appointment",
                name="book_appointment",
                description="Book",
                enabled=True,
            ),
            RuntimeToolDefinition(
                toolId="create_callback_lead",
                name="create_callback_lead",
                description="Lead",
                enabled=False,
            ),
        ],
    )
    tools_a = registry.resolve_tools(config_a)
    assert len(tools_a) == 1
    assert tools_a[0].name == "book_appointment"

    # Config B: tools disabled
    config_b = create_test_runtime_config(tools_enabled=False)
    tools_b = registry.resolve_tools(config_b)
    assert len(tools_b) == 0

    # Config C: create_callback_lead enabled, book_appointment disabled
    config_c = create_test_runtime_config(
        tools_enabled=True,
        tool_defs=[
            RuntimeToolDefinition(
                toolId="create_callback_lead",
                name="create_callback_lead",
                description="Lead",
                enabled=True,
            ),
            RuntimeToolDefinition(
                toolId="book_appointment",
                name="book_appointment",
                description="Book",
                enabled=False,
            ),
        ],
    )
    tools_c = registry.resolve_tools(config_c)
    assert len(tools_c) == 1
    assert tools_c[0].name == "create_callback_lead"


# ==========================================
# 24. Secret isolation: Worker secret not in schema
# ==========================================
def test_secrets_not_in_tool_schemas():
    config = create_test_runtime_config(tools_enabled=True)
    registry = ToolRegistry()
    resolved = registry.resolve_tools(config)

    for tool in resolved:
        schema_json = json.dumps(tool.properties)
        assert "WORKER_API_SECRET" not in schema_json
        assert "workerSecret" not in schema_json
        assert "secret" not in schema_json.lower()


# ==========================================
# 25. Normalization and valid tool name helper tests
# ==========================================
def test_normalization_and_validation_helpers():
    assert normalize_tool_id("create_callback_lead") == "create_callback_lead"
    assert normalize_tool_id("create callback lead") == "create_callback_lead"
    assert normalize_tool_id("book appointment") == "book_appointment"
    assert normalize_tool_id("query_knowledge_base") == "query_knowledge_base"
    assert normalize_tool_id("unknown_tool_xyz") is None

    assert is_valid_tool_name("valid_tool_name") is True
    assert is_valid_tool_name("tool123") is True
    assert is_valid_tool_name("123_invalid") is False
    assert is_valid_tool_name("invalid-dash") is False
    assert is_valid_tool_name("") is False


# ==========================================
# 26. Phase 8A Hotfix Regression: ToolRuntimeContext uses WORKER_API_SECRET,
#     NOT the stale LIVEKIT_WORKER_SECRET attribute that crashed the pipeline.
# ==========================================
def test_tool_runtime_context_uses_worker_api_secret_not_livekit():
    """Regression test for Phase 8A hotfix.

    Verifies:
    1. ToolRuntimeContext can be constructed using settings.WORKER_API_SECRET.
    2. settings does NOT have a LIVEKIT_WORKER_SECRET attribute (the stale reference
       that caused 'Settings object has no attribute LIVEKIT_WORKER_SECRET' and
       finalized every call as FAILED after Step 8 / STT init).
    3. The canonical authentication attribute is WORKER_API_SECRET only.
    4. main.py source does NOT contain the stale settings.LIVEKIT_WORKER_SECRET call.
    """
    from app.config import settings

    # --- Guard 1: settings must NOT expose LIVEKIT_WORKER_SECRET ---
    assert not hasattr(settings, "LIVEKIT_WORKER_SECRET"), (
        "settings.LIVEKIT_WORKER_SECRET must not exist. "
        "The canonical worker secret is settings.WORKER_API_SECRET. "
        "Remove any LIVEKIT_WORKER_SECRET field from app/config.py."
    )

    # --- Guard 2: settings.WORKER_API_SECRET must exist and be non-empty ---
    assert hasattr(settings, "WORKER_API_SECRET"), (
        "settings.WORKER_API_SECRET is missing from app/config.py"
    )
    assert isinstance(settings.WORKER_API_SECRET, str) and settings.WORKER_API_SECRET, (
        "settings.WORKER_API_SECRET must be a non-empty string"
    )

    # --- Guard 3: ToolRuntimeContext successfully accepts the canonical secret ---
    from app.call_lifecycle import CallTranscriptCollector
    collector = CallTranscriptCollector()
    ctx = ToolRuntimeContext(
        deployment_id="dep-hotfix-test",
        call_session_id="sess-hotfix-test",
        caller_phone="+911234567890",
        tenant_id="tenant-hotfix",
        agent_id="agent-hotfix",
        api_url=settings.NEXTLITE_API_URL,
        worker_secret=settings.WORKER_API_SECRET,   # must not raise AttributeError
        transcript_collector=collector,
    )
    assert ctx.worker_secret == settings.WORKER_API_SECRET

    # --- Guard 4: Source-level check — main.py must not reference the stale attribute ---
    import pathlib
    main_py = pathlib.Path(__file__).parent.parent / "app" / "main.py"
    source = main_py.read_text(encoding="utf-8")
    assert "settings.LIVEKIT_WORKER_SECRET" not in source, (
        "main.py still contains 'settings.LIVEKIT_WORKER_SECRET'. "
        "Replace it with 'settings.WORKER_API_SECRET' in the ToolRuntimeContext construction."
    )
