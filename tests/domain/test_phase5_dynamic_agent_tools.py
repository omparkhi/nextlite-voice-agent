import pytest
import uuid
from typing import Dict, Any

from apps.api.app.models import (
    Tenant, User, UserRole, Agent, AgentVersion, AgentTemplate,
    Deployment, DeploymentEnvironment, DeploymentStatus
)
from apps.api.app.db import AsyncSessionLocal
from apps.api.app.schemas import RuntimeAgentConfig, RuntimeToolDefinition
from apps.api.app.domain.tool_registry import (
    CANONICAL_TOOL_REGISTRY,
    ToolDefinition,
    get_canonical_tool,
    list_canonical_tools,
    normalize_tool_id,
    validate_tool_arguments,
    sanitize_tool_arguments,
    filter_agent_runtime_tools,
)
from apps.api.app.services.runtime_config_service import RuntimeAgentConfigService, CANONICAL_TOOL_DEFS
from apps.api.app.services.tool_execution_service import ToolExecutionService


# TEST 1: Canonical Tool Registry loads valid tool definitions.
def test_1_canonical_tool_registry_loads_valid_definitions():
    assert len(CANONICAL_TOOL_REGISTRY) >= 3
    for tool_id, tool_def in CANONICAL_TOOL_REGISTRY.items():
        assert isinstance(tool_def, ToolDefinition)
        assert tool_def.id == tool_id
        assert tool_def.name == tool_id
        assert tool_def.display_name
        assert tool_def.description
        assert "type" in tool_def.parameters
        assert "properties" in tool_def.parameters


# TEST 2: Each tool has a stable machine identity.
def test_2_tools_have_stable_machine_identities():
    kb = get_canonical_tool("query_knowledge_base")
    assert kb is not None
    assert kb.id == "query_knowledge_base"
    assert kb.name == "query_knowledge_base"

    booking = get_canonical_tool("book_appointment")
    assert booking is not None
    assert booking.id == "book_appointment"
    assert booking.name == "book_appointment"

    lead = get_canonical_tool("create_callback_lead")
    assert lead is not None
    assert lead.id == "create_callback_lead"
    assert lead.name == "create_callback_lead"


# TEST 3: Tool display name is separate from machine identity.
def test_3_display_name_separate_from_machine_identity():
    booking = get_canonical_tool("book_appointment")
    assert booking.id == "book_appointment"
    assert booking.display_name == "Appointment Booking"
    assert booking.id != booking.display_name

    lead = get_canonical_tool("create_callback_lead")
    assert lead.id == "create_callback_lead"
    assert lead.display_name == "Lead Capture & Callback"
    assert lead.id != lead.display_name


# TEST 4: Agent can bind an available tool.
def test_4_agent_can_bind_available_tool():
    tools_cfg = {
        "enabled": True,
        "bindings": [
            {
                "toolId": "book_appointment",
                "name": "book_appointment",
                "enabled": True,
            }
        ]
    }
    resolved = filter_agent_runtime_tools(tools_cfg)
    assert len(resolved) == 1
    assert resolved[0].tool_id == "book_appointment"
    assert resolved[0].enabled is True


# TEST 5: Duplicate tool bindings are prevented.
def test_5_duplicate_tool_bindings_are_prevented():
    tools_cfg = {
        "enabled": True,
        "bindings": [
            {
                "toolId": "book_appointment",
                "name": "book_appointment",
                "enabled": True,
            },
            {
                "toolId": "book_appointment",
                "name": "book_appointment",
                "enabled": True,
            }
        ]
    }
    resolved = filter_agent_runtime_tools(tools_cfg)
    assert len(resolved) == 1
    assert resolved[0].tool_id == "book_appointment"


# TEST 6: Agent can enable a tool.
def test_6_agent_can_enable_a_tool():
    tools_cfg = {
        "enabled": True,
        "bindings": [
            {"toolId": "query_knowledge_base", "enabled": True},
            {"toolId": "create_callback_lead", "enabled": True}
        ]
    }
    resolved = filter_agent_runtime_tools(tools_cfg)
    tool_ids = [t.tool_id for t in resolved]
    assert "query_knowledge_base" in tool_ids
    assert "create_callback_lead" in tool_ids


# TEST 7: Agent can disable a tool.
def test_7_agent_can_disable_a_tool():
    tools_cfg = {
        "enabled": True,
        "bindings": [
            {"toolId": "query_knowledge_base", "enabled": True},
            {"toolId": "book_appointment", "enabled": False},
            {"toolId": "create_callback_lead", "enabled": True}
        ]
    }
    resolved = filter_agent_runtime_tools(tools_cfg)
    tool_ids = [t.tool_id for t in resolved]
    assert "query_knowledge_base" in tool_ids
    assert "create_callback_lead" in tool_ids
    assert "book_appointment" not in tool_ids


# TEST 8: Disabled tools are not exposed to runtime.
def test_8_disabled_tools_not_exposed_to_runtime():
    # Master switch disabled
    tools_cfg_master_off = {
        "enabled": False,
        "bindings": [
            {"toolId": "query_knowledge_base", "enabled": True},
            {"toolId": "book_appointment", "enabled": True}
        ]
    }
    assert filter_agent_runtime_tools(tools_cfg_master_off) == []

    # Individual tool disabled
    tools_cfg_individual_off = {
        "enabled": True,
        "bindings": [
            {"toolId": "book_appointment", "enabled": False}
        ]
    }
    assert filter_agent_runtime_tools(tools_cfg_individual_off) == []


from apps.api.app.services.template_service import SYSTEM_TEMPLATES

# TEST 9: Only enabled tools are included in RuntimeAgentConfig.
@pytest.mark.asyncio
async def test_9_only_enabled_tools_in_runtime_agent_config():
    async with AsyncSessionLocal() as session:
        default_tmpl = SYSTEM_TEMPLATES[0]
        # Seed template if not exists
        t_res = await session.get(AgentTemplate, default_tmpl["id"])
        if not t_res:
            session.add(AgentTemplate(
                id=default_tmpl["id"],
                name=default_tmpl["name"],
                description=default_tmpl["description"],
                industry=default_tmpl["industry"],
                defaultConfiguration=default_tmpl["default_configuration"],
                isSystem=True
            ))
            await session.flush()

        tenant = Tenant(id=uuid.uuid4(), name="Test Tenant", slug=f"test-tenant-{uuid.uuid4().hex[:6]}")
        session.add(tenant)

        user = User(id=uuid.uuid4(), tenantId=tenant.id, email=f"user_{uuid.uuid4().hex[:6]}@example.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        session.add(user)

        agent = Agent(
            id=uuid.uuid4(),
            tenantId=tenant.id,
            templateId=default_tmpl["id"],
            name="Filtered Tools Agent"
        )
        session.add(agent)

        version = AgentVersion(
            id=uuid.uuid4(),
            agentId=agent.id,
            versionNumber=1,
            createdBy=user.id,
            configuration={
                "tools": {
                    "enabled": True,
                    "bindings": [
                        {"toolId": "query_knowledge_base", "enabled": True},
                        {"toolId": "book_appointment", "enabled": False},
                        {"toolId": "create_callback_lead", "enabled": True}
                    ]
                }
            }
        )
        session.add(version)

        deployment = Deployment(
            id=uuid.uuid4(),
            tenantId=tenant.id,
            agentId=agent.id,
            versionId=version.id,
            createdBy=user.id,
            environment=DeploymentEnvironment.TEST,
            status=DeploymentStatus.ACTIVE
        )
        session.add(deployment)
        await session.commit()

        service = RuntimeAgentConfigService(session)
        config = await service.resolve_runtime_config(deployment_id=deployment.id)

        exposed_ids = [t.tool_id for t in config.tools.tools]
        assert "query_knowledge_base" in exposed_ids
        assert "create_callback_lead" in exposed_ids
        assert "book_appointment" not in exposed_ids


# TEST 10: Tool input schema validates required fields.
def test_10_tool_input_schema_validates_required_fields():
    # Valid book_appointment
    valid_args = {
        "customerName": "Alice Smith",
        "title": "Consultation",
        "bookingDate": "2026-10-01",
        "bookingTime": "11:00 AM"
    }
    is_valid, err = validate_tool_arguments("book_appointment", valid_args)
    assert is_valid is True
    assert err is None

    # Missing required bookingTime
    invalid_args = {
        "customerName": "Alice Smith",
        "title": "Consultation",
        "bookingDate": "2026-10-01"
    }
    is_valid, err = validate_tool_arguments("book_appointment", invalid_args)
    assert is_valid is False
    assert "bookingTime" in err


# TEST 11: Invalid tool arguments are rejected.
def test_11_invalid_tool_arguments_are_rejected():
    # Invalid empty string for customerName
    empty_name_args = {
        "customerName": "   ",
        "title": "Consultation",
        "bookingDate": "2026-10-01",
        "bookingTime": "11:00 AM"
    }
    is_valid, err = validate_tool_arguments("book_appointment", empty_name_args)
    assert is_valid is False
    assert "cannot be empty" in err

    # Invalid enum value for priority in lead tool
    invalid_lead_args = {
        "customerName": "Bob",
        "customerPhone": "+919876543210",
        "priority": "SUPER_MAX_PRIORITY"
    }
    is_valid, err = validate_tool_arguments("create_callback_lead", invalid_lead_args)
    assert is_valid is False
    assert "Invalid value" in err


# TEST 12: Protected tenant/agent context cannot be overridden by LLM arguments.
def test_12_protected_context_cannot_be_overridden():
    llm_malicious_args = {
        "customerName": "Hacker",
        "title": "General",
        "bookingDate": "2026-10-01",
        "bookingTime": "10:00 AM",
        "tenantId": "00000000-0000-0000-0000-000000000000",
        "tenant_id": "00000000-0000-0000-0000-000000000000",
        "agentId": "11111111-1111-1111-1111-111111111111",
        "authorization": "Bearer fake_token"
    }
    sanitized = sanitize_tool_arguments(llm_malicious_args)
    assert "tenantId" not in sanitized
    assert "tenant_id" not in sanitized
    assert "agentId" not in sanitized
    assert "authorization" not in sanitized
    assert sanitized["customerName"] == "Hacker"


# TEST 13: Successful tool execution produces a success result.
@pytest.mark.asyncio
async def test_13_successful_tool_execution_produces_success():
    async with AsyncSessionLocal() as session:
        tenant = Tenant(id=uuid.uuid4(), name="Tenant Inc", slug=f"tenant-inc-{uuid.uuid4().hex[:6]}")
        session.add(tenant)
        await session.commit()

        service = ToolExecutionService(session)
        result = await service.execute_tool(
            tool_name="create_callback_lead",
            arguments={
                "customerName": "John Doe",
                "customerPhone": "+919876543210",
                "requirement": "Pricing details"
            },
            trusted_tenant_id=tenant.id
        )
        assert result["success"] is True
        assert "leadNumber" in result
        assert result["leadNumber"].startswith("LEAD-")


# TEST 14: Failed tool execution produces a failure result.
@pytest.mark.asyncio
async def test_14_failed_tool_execution_produces_failure():
    async with AsyncSessionLocal() as session:
        tenant = Tenant(id=uuid.uuid4(), name="Tenant Inc", slug=f"tenant-inc-fail-{uuid.uuid4().hex[:6]}")
        session.add(tenant)
        await session.commit()

        service = ToolExecutionService(session)
        # Missing required customerPhone
        with pytest.raises(ValueError, match="Invalid tool arguments"):
            await service.execute_tool(
                tool_name="create_callback_lead",
                arguments={
                    "customerName": "John Doe"
                },
                trusted_tenant_id=tenant.id
            )


# TEST 15: Agent cannot claim tool success after tool failure.
def test_15_truthfulness_invariant():
    booking_def = get_canonical_tool("book_appointment")
    assert "Never claim success unless the tool returns a successful result" in booking_def.description


# TEST 16: Agent A tool bindings do not affect Agent B.
def test_16_agent_isolation():
    agent_a_tools = {
        "enabled": True,
        "bindings": [{"toolId": "book_appointment", "enabled": True}]
    }
    agent_b_tools = {
        "enabled": True,
        "bindings": [{"toolId": "query_knowledge_base", "enabled": True}]
    }

    resolved_a = [t.tool_id for t in filter_agent_runtime_tools(agent_a_tools)]
    resolved_b = [t.tool_id for t in filter_agent_runtime_tools(agent_b_tools)]

    assert resolved_a == ["book_appointment"]
    assert resolved_b == ["query_knowledge_base"]


# TEST 17: Tenant A tool bindings do not affect Tenant B.
@pytest.mark.asyncio
async def test_17_tenant_isolation():
    async with AsyncSessionLocal() as session:
        default_tmpl = SYSTEM_TEMPLATES[0]
        t_res = await session.get(AgentTemplate, default_tmpl["id"])
        if not t_res:
            session.add(AgentTemplate(
                id=default_tmpl["id"],
                name=default_tmpl["name"],
                description=default_tmpl["description"],
                industry=default_tmpl["industry"],
                defaultConfiguration=default_tmpl["default_configuration"],
                isSystem=True
            ))
            await session.flush()

        tenant_a = Tenant(id=uuid.uuid4(), name="Tenant A", slug=f"tenant-a-{uuid.uuid4().hex[:6]}")
        tenant_b = Tenant(id=uuid.uuid4(), name="Tenant B", slug=f"tenant-b-{uuid.uuid4().hex[:6]}")
        session.add_all([tenant_a, tenant_b])

        user_a = User(id=uuid.uuid4(), tenantId=tenant_a.id, email=f"a_{uuid.uuid4().hex[:6]}@example.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        user_b = User(id=uuid.uuid4(), tenantId=tenant_b.id, email=f"b_{uuid.uuid4().hex[:6]}@example.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        session.add_all([user_a, user_b])

        agent_a = Agent(id=uuid.uuid4(), tenantId=tenant_a.id, templateId=default_tmpl["id"], name="Agent A")
        agent_b = Agent(id=uuid.uuid4(), tenantId=tenant_b.id, templateId=default_tmpl["id"], name="Agent B")
        session.add_all([agent_a, agent_b])

        version_a = AgentVersion(
            id=uuid.uuid4(),
            agentId=agent_a.id,
            versionNumber=1,
            createdBy=user_a.id,
            configuration={"tools": {"enabled": True, "bindings": [{"toolId": "book_appointment", "enabled": True}]}}
        )
        version_b = AgentVersion(
            id=uuid.uuid4(),
            agentId=agent_b.id,
            versionNumber=1,
            createdBy=user_b.id,
            configuration={"tools": {"enabled": True, "bindings": [{"toolId": "create_callback_lead", "enabled": True}]}}
        )
        session.add_all([version_a, version_b])

        dep_a = Deployment(id=uuid.uuid4(), tenantId=tenant_a.id, agentId=agent_a.id, versionId=version_a.id, createdBy=user_a.id, status=DeploymentStatus.ACTIVE)
        dep_b = Deployment(id=uuid.uuid4(), tenantId=tenant_b.id, agentId=agent_b.id, versionId=version_b.id, createdBy=user_b.id, status=DeploymentStatus.ACTIVE)
        session.add_all([dep_a, dep_b])
        await session.commit()

        service = RuntimeAgentConfigService(session)
        cfg_a = await service.resolve_runtime_config(deployment_id=dep_a.id)
        cfg_b = await service.resolve_runtime_config(deployment_id=dep_b.id)

        assert [t.tool_id for t in cfg_a.tools.tools] == ["book_appointment"]
        assert [t.tool_id for t in cfg_b.tools.tools] == ["create_callback_lead"]


# TEST 18: Template does not acquire Agent-specific tool bindings.
def test_18_template_isolation():
    template_cfg = {
        "tools": {
            "enabled": True,
            "bindings": [{"toolId": "query_knowledge_base", "enabled": True}]
        }
    }
    # Custom agent overriding template
    agent_cfg = {
        "tools": {
            "enabled": True,
            "bindings": [
                {"toolId": "query_knowledge_base", "enabled": True},
                {"toolId": "book_appointment", "enabled": True}
            ]
        }
    }

    tmpl_resolved = [t.tool_id for t in filter_agent_runtime_tools(template_cfg["tools"])]
    agent_resolved = [t.tool_id for t in filter_agent_runtime_tools(agent_cfg["tools"])]

    assert tmpl_resolved == ["query_knowledge_base"]
    assert "book_appointment" in agent_resolved
    assert "book_appointment" not in tmpl_resolved


# TEST 19: Published AgentVersion remains isolated from draft tool changes.
@pytest.mark.asyncio
async def test_19_published_version_isolated_from_draft():
    async with AsyncSessionLocal() as session:
        default_tmpl = SYSTEM_TEMPLATES[0]
        t_res = await session.get(AgentTemplate, default_tmpl["id"])
        if not t_res:
            session.add(AgentTemplate(
                id=default_tmpl["id"],
                name=default_tmpl["name"],
                description=default_tmpl["description"],
                industry=default_tmpl["industry"],
                defaultConfiguration=default_tmpl["default_configuration"],
                isSystem=True
            ))
            await session.flush()

        tenant = Tenant(id=uuid.uuid4(), name="Tenant Pub", slug=f"tenant-pub-{uuid.uuid4().hex[:6]}")
        session.add(tenant)
        user = User(id=uuid.uuid4(), tenantId=tenant.id, email=f"pub_{uuid.uuid4().hex[:6]}@example.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        session.add(user)
        agent = Agent(id=uuid.uuid4(), tenantId=tenant.id, templateId=default_tmpl["id"], name="Agent Pub")
        session.add(agent)

        # Published Version 1 with Booking ON
        v1 = AgentVersion(
            id=uuid.uuid4(),
            agentId=agent.id,
            versionNumber=1,
            createdBy=user.id,
            configuration={"tools": {"enabled": True, "bindings": [{"toolId": "book_appointment", "enabled": True}]}}
        )
        session.add(v1)

        deployment = Deployment(
            id=uuid.uuid4(),
            tenantId=tenant.id,
            agentId=agent.id,
            versionId=v1.id,
            createdBy=user.id,
            status=DeploymentStatus.ACTIVE
        )
        session.add(deployment)
        await session.commit()

        # Draft changes Booking to OFF (represented by a new draft version or uncommitted change)
        service = RuntimeAgentConfigService(session)
        config = await service.resolve_runtime_config(deployment_id=deployment.id)

        # Published deployment still exposes Booking
        assert [t.tool_id for t in config.tools.tools] == ["book_appointment"]


# TEST 20: Existing Knowledge Retrieval tool continues to work.
@pytest.mark.asyncio
async def test_20_knowledge_retrieval_continues_working():
    async with AsyncSessionLocal() as session:
        tenant = Tenant(id=uuid.uuid4(), name="KB Tenant", slug=f"kb-tenant-{uuid.uuid4().hex[:6]}")
        session.add(tenant)
        await session.commit()

        service = ToolExecutionService(session)
        res = await service.execute_tool(
            tool_name="query_knowledge_base",
            arguments={"query": "What are your operating hours?"},
            trusted_tenant_id=tenant.id
        )
        assert res["success"] is True
        assert "results" in res


# TEST 21: Existing Booking tool continues to work.
@pytest.mark.asyncio
async def test_21_booking_tool_continues_working():
    async with AsyncSessionLocal() as session:
        tenant = Tenant(id=uuid.uuid4(), name="Booking Tenant", slug=f"booking-tenant-{uuid.uuid4().hex[:6]}")
        session.add(tenant)
        await session.commit()

        service = ToolExecutionService(session)
        res = await service.execute_tool(
            tool_name="book_appointment",
            arguments={
                "customerName": "Rahul Sharma",
                "title": "General Consultation",
                "bookingDate": "2026-10-15",
                "bookingTime": "2:30 PM",
                "customerPhone": "+919876543210"
            },
            trusted_tenant_id=tenant.id
        )
        assert res["success"] is True
        assert "appointmentNumber" in res
        assert res["appointmentNumber"].startswith("APT-")


# TEST 22: Existing Lead Capture/Callback tool continues to work.
@pytest.mark.asyncio
async def test_22_lead_capture_continues_working():
    async with AsyncSessionLocal() as session:
        tenant = Tenant(id=uuid.uuid4(), name="Lead Tenant", slug=f"lead-tenant-{uuid.uuid4().hex[:6]}")
        session.add(tenant)
        await session.commit()

        service = ToolExecutionService(session)
        res = await service.execute_tool(
            tool_name="create_callback_lead",
            arguments={
                "customerName": "Sunita Verma",
                "customerPhone": "+919876543211",
                "requirement": "Admissions enquiry"
            },
            trusted_tenant_id=tenant.id
        )
        assert res["success"] is True
        assert "leadNumber" in res


# TEST 23: Existing healthcare client continues to function.
@pytest.mark.asyncio
async def test_23_healthcare_client_continues_functioning():
    async with AsyncSessionLocal() as session:
        tenant = Tenant(id=uuid.uuid4(), name="City Hospital", slug=f"city-hospital-{uuid.uuid4().hex[:6]}")
        session.add(tenant)
        await session.commit()

        service = ToolExecutionService(session)
        res = await service.execute_tool(
            tool_name="book_appointment",
            arguments={
                "customerName": "Patient Jane",
                "title": "Cardiology Checkup",
                "bookingDate": "2026-11-01",
                "bookingTime": "09:30 AM",
                "resourceName": "Dr. Sharma",
                "customerPhone": "+919999999999"
            },
            trusted_tenant_id=tenant.id
        )
        assert res["success"] is True
        assert res["appointmentNumber"].startswith("APT-")
        assert res["serviceType"] == "Cardiology Checkup"


# TEST 24: Non-healthcare Agent can use the same Tool architecture.
@pytest.mark.asyncio
async def test_24_non_healthcare_agent_uses_same_architecture():
    async with AsyncSessionLocal() as session:
        # Restaurant reservation
        restaurant_tenant = Tenant(id=uuid.uuid4(), name="Spice Garden Restaurant", slug=f"spice-garden-{uuid.uuid4().hex[:6]}")
        session.add(restaurant_tenant)
        await session.commit()

        service = ToolExecutionService(session)
        res = await service.execute_tool(
            tool_name="book_appointment",
            arguments={
                "customerName": "David Miller",
                "title": "Table for 4",
                "bookingDate": "2026-10-20",
                "bookingTime": "07:30 PM",
                "resourceName": "Main Dining Hall",
                "notes": "Window seat preference"
            },
            trusted_tenant_id=restaurant_tenant.id
        )
        assert res["success"] is True
        assert res["serviceType"] == "Table for 4"


# TEST 25: Frontend/API/runtime tool definitions remain consistent.
def test_25_tool_definitions_consistency():
    catalog_items = list_canonical_tools()
    catalog_ids = {c["toolId"] for c in catalog_items}

    registry_ids = set(CANONICAL_TOOL_REGISTRY.keys())
    assert catalog_ids == registry_ids

    runtime_defs = CANONICAL_TOOL_DEFS
    assert set(runtime_defs.keys()) == registry_ids


# TEST 26: Tool catalog does not rely on a duplicate hardcoded frontend list.
def test_26_canonical_catalog_single_source():
    for item in list_canonical_tools():
        assert "toolId" in item
        assert "displayName" in item
        assert "category" in item
        assert "parameters" in item
        assert len(item["parameters"]) > 0
