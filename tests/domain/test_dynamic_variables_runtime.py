import uuid
import pytest
from apps.api.app.db import AsyncSessionLocal
from apps.api.app.models import (
    Tenant, User, UserRole, Agent, AgentVersion, Deployment, AgentTemplate,
    AgentStatus, VersionStatus, DeploymentStatus, DeploymentEnvironment
)
from apps.api.app.services.template_service import SYSTEM_TEMPLATES
from apps.api.app.services.runtime_config_service import RuntimeAgentConfigService
from apps.api.app.services.prompt_compiler_service import prompt_compiler
from apps.api.app.domain.variable_resolver import resolve_prompt_variables, build_effective_variable_map


async def get_or_create_default_template(session) -> uuid.UUID:
    default_tmpl = SYSTEM_TEMPLATES[0]
    tmpl = await session.get(AgentTemplate, default_tmpl["id"])
    if not tmpl:
        tmpl = AgentTemplate(
            id=default_tmpl["id"],
            name=default_tmpl["name"],
            description=default_tmpl["description"],
            industry=default_tmpl["industry"],
            defaultConfiguration=default_tmpl["default_configuration"],
            isSystem=True
        )
        session.add(tmpl)
        await session.flush()
    return tmpl.id


@pytest.mark.asyncio
async def test_1_current_agent_variable_reaches_runtime():
    """
    1. test_current_agent_variable_reaches_runtime
    Verify: agentName = 'Rakesh' is present in effective RuntimeAgentConfig and system prompt.
    """
    async with AsyncSessionLocal() as session:
        template_id = await get_or_create_default_template(session)

        tenant_id = uuid.uuid4()
        tenant = Tenant(id=tenant_id, name="Test Tenant 1", slug=f"tenant-{uuid.uuid4().hex[:8]}")
        session.add(tenant)
        await session.flush()

        user = User(
            id=uuid.uuid4(),
            tenantId=tenant.id,
            email=f"user_{uuid.uuid4().hex[:6]}@example.com",
            passwordHash="hash",
            role=UserRole.CLIENT_OWNER
        )
        session.add(user)
        await session.flush()

        agent_id = uuid.uuid4()
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=template_id, name="Support Agent", status=AgentStatus.LIVE)
        session.add(agent)
        await session.flush()

        config = {
            "identity": {"name": "AI Assistant"},
            "instructions": "Mera naam {agentName} hai. Always identify yourself as {agentName}.",
            "variables": {
                "input": [
                    {"key": "agentName", "label": "Agent Name", "defaultValue": "Rakesh", "type": "text"}
                ]
            }
        }

        version = AgentVersion(
            id=uuid.uuid4(),
            agentId=agent_id,
            versionNumber=1,
            status=VersionStatus.PUBLISHED,
            configuration=config,
            createdBy=user.id
        )
        session.add(version)
        await session.flush()

        deployment = Deployment(
            id=uuid.uuid4(),
            tenantId=tenant_id,
            agentId=agent_id,
            versionId=version.id,
            environment=DeploymentEnvironment.PRODUCTION,
            status=DeploymentStatus.ACTIVE,
            createdBy=user.id
        )
        session.add(deployment)
        await session.commit()

        service = RuntimeAgentConfigService(session)
        runtime_config = await service.resolve_runtime_config(deployment_id=deployment.id)

        assert runtime_config is not None
        # Verify variable is in RuntimeAgentConfig input_variables
        input_vars = {v.key: v.default_value for v in runtime_config.variables.input_variables}
        assert input_vars.get("agentName") == "Rakesh"

        # Verify compiled system prompt contains Rakesh and NOT generic Assistant fallback in identity
        assert "You are Rakesh" in runtime_config.prompt.compiled_system_prompt
        assert "Mera naam Rakesh hai" in runtime_config.prompt.compiled_system_prompt
        assert "You are Assistant" not in runtime_config.prompt.compiled_system_prompt


def test_2_variable_reference_resolves_current_value():
    """
    2. test_variable_reference_resolves_current_value
    Verify: 'Hello {agentName}' becomes 'Hello Rakesh'.
    """
    text = "Hello {agentName}, welcome to {businessName}!"
    variables = [
        {"key": "agentName", "defaultValue": "Rakesh"},
        {"key": "businessName", "defaultValue": "Apex Health"}
    ]
    resolved = resolve_prompt_variables(text, variables=variables)
    assert resolved == "Hello Rakesh, welcome to Apex Health!"


@pytest.mark.asyncio
async def test_3_variable_change_without_republish():
    """
    3. test_variable_change_without_republish
    Initial: agentName = Rakesh
    Change DB/config value: agentName = Amit (in latest agent version without creating a new deployment)
    Build/load runtime again WITHOUT updating deployment.versionId.
    Verify: runtime value = Amit.
    """
    async with AsyncSessionLocal() as session:
        template_id = await get_or_create_default_template(session)

        tenant_id = uuid.uuid4()
        tenant = Tenant(id=tenant_id, name="Tenant Mutability Test", slug=f"tenant-{uuid.uuid4().hex[:8]}")
        session.add(tenant)
        await session.flush()

        user = User(
            id=uuid.uuid4(),
            tenantId=tenant.id,
            email=f"user_{uuid.uuid4().hex[:6]}@example.com",
            passwordHash="hash",
            role=UserRole.CLIENT_OWNER
        )
        session.add(user)
        await session.flush()

        agent_id = uuid.uuid4()
        agent = Agent(id=agent_id, tenantId=tenant_id, templateId=template_id, name="Test Mutability Agent", status=AgentStatus.LIVE)
        session.add(agent)
        await session.flush()

        # Initial Published Version (v1)
        config_v1 = {
            "instructions": "Mera naam {agentName} hai.",
            "variables": {
                "input": [{"key": "agentName", "defaultValue": "Rakesh"}]
            }
        }
        version_1 = AgentVersion(
            id=uuid.uuid4(),
            agentId=agent_id,
            versionNumber=1,
            status=VersionStatus.PUBLISHED,
            configuration=config_v1,
            createdBy=user.id
        )
        session.add(version_1)
        await session.flush()

        # Deployed to version 1
        deployment = Deployment(
            id=uuid.uuid4(),
            tenantId=tenant_id,
            agentId=agent_id,
            versionId=version_1.id,  # Points to version 1 snapshot
            environment=DeploymentEnvironment.PRODUCTION,
            status=DeploymentStatus.ACTIVE,
            createdBy=user.id
        )
        session.add(deployment)
        await session.commit()

        service = RuntimeAgentConfigService(session)
        rt_1 = await service.resolve_runtime_config(deployment_id=deployment.id)
        assert "Mera naam Rakesh hai" in rt_1.prompt.compiled_system_prompt
        assert "You are Rakesh" in rt_1.prompt.compiled_system_prompt

        # Admin changes variable value in new draft/version v2, but DOES NOT REDEPLOY (deployment.versionId remains version_1.id)
        config_v2 = {
            "instructions": "Mera naam {agentName} hai.",
            "variables": {
                "input": [{"key": "agentName", "defaultValue": "Amit"}]
            }
        }
        version_2 = AgentVersion(
            id=uuid.uuid4(),
            agentId=agent_id,
            versionNumber=2,
            status=VersionStatus.DRAFT,
            configuration=config_v2,
            createdBy=user.id
        )
        session.add(version_2)
        await session.commit()

        # Resolve runtime config again for the same deployment
        rt_2 = await service.resolve_runtime_config(deployment_id=deployment.id)
        assert "Mera naam Amit hai" in rt_2.prompt.compiled_system_prompt
        assert "You are Amit" in rt_2.prompt.compiled_system_prompt
        assert "Rakesh" not in rt_2.prompt.compiled_system_prompt


def test_4_business_hours_current_value():
    """
    4. test_business_hours_current_value
    Verify: businessHours reaches runtime correctly in instructions, variables, and business info.
    """
    config = {
        "instructions": "Our operating hours are {businessHours}.",
        "variables": {
            "input": [
                {"key": "businessHours", "defaultValue": "Monday-Saturday, 10 AM - 10 PM"}
            ]
        }
    }
    compiled = prompt_compiler.compile_system_prompt(configuration=config)
    assert "Our operating hours are Monday-Saturday, 10 AM - 10 PM." in compiled
    assert "Working Hours: Monday-Saturday, 10 AM - 10 PM" in compiled
    assert "- businessHours: Monday-Saturday, 10 AM - 10 PM" in compiled


def test_5_arbitrary_custom_variable():
    """
    5. test_arbitrary_custom_variable
    Verify: arbitrary custom variables work without special-case code.
    """
    config = {
        "instructions": "Special notice: {customPromo}. Consultation fee is {consultationFee}.",
        "variables": {
            "input": [
                {"key": "customPromo", "defaultValue": "20% off all checkups this week"},
                {"key": "consultationFee", "defaultValue": "500 INR"},
                {"key": "arbitraryBusinessTag", "defaultValue": "Premium Care"}
            ]
        }
    }
    compiled = prompt_compiler.compile_system_prompt(configuration=config)
    assert "Special notice: 20% off all checkups this week." in compiled
    assert "Consultation fee is 500 INR." in compiled
    assert "=== CONFIGURED BUSINESS VARIABLES ===" in compiled
    assert "- arbitraryBusinessTag: Premium Care" in compiled
    assert "- customPromo: 20% off all checkups this week" in compiled
    assert "- consultationFee: 500 INR" in compiled


def test_6_missing_variable_safe_behavior():
    """
    6. test_missing_variable_safe_behavior
    Verify missing variable does not crash runtime and preserves safe fallback.
    """
    config = {
        "instructions": "Welcome to {nonExistentVar}. We are open {businessHours}.",
        "variables": {
            "input": []
        }
    }
    compiled = prompt_compiler.compile_system_prompt(configuration=config)
    # Placeholder {nonExistentVar} should not crash and should remain or be safely handled
    assert "Welcome to {nonExistentVar}" in compiled
    assert "=== NEXTLITE CORE RUNTIME SAFETY BOUNDARY ===" in compiled


@pytest.mark.asyncio
async def test_7_tenant_variable_isolation():
    """
    7. test_tenant_variable_isolation
    Tenant A variable values must never appear in Tenant B runtime.
    """
    async with AsyncSessionLocal() as session:
        template_id = await get_or_create_default_template(session)

        # Tenant A
        tenant_a = Tenant(id=uuid.uuid4(), name="Tenant A", slug=f"tenant-a-{uuid.uuid4().hex[:8]}")
        session.add(tenant_a)
        await session.flush()
        user_a = User(id=uuid.uuid4(), tenantId=tenant_a.id, email=f"user_{uuid.uuid4().hex[:6]}@example.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        session.add(user_a)
        await session.flush()
        agent_a = Agent(id=uuid.uuid4(), tenantId=tenant_a.id, templateId=template_id, name="Agent A", status=AgentStatus.LIVE)
        session.add(agent_a)
        await session.flush()
        config_a = {
            "variables": {
                "input": [{"key": "agentName", "defaultValue": "Alice"}, {"key": "secretCode", "defaultValue": "CODE_A"}]
            },
            "instructions": "I am {agentName}, secret={secretCode}"
        }
        version_a = AgentVersion(id=uuid.uuid4(), agentId=agent_a.id, versionNumber=1, configuration=config_a, createdBy=user_a.id)
        session.add(version_a)
        await session.flush()
        deployment_a = Deployment(id=uuid.uuid4(), tenantId=tenant_a.id, agentId=agent_a.id, versionId=version_a.id, environment=DeploymentEnvironment.PRODUCTION, status=DeploymentStatus.ACTIVE, createdBy=user_a.id)
        session.add(deployment_a)

        # Tenant B
        tenant_b = Tenant(id=uuid.uuid4(), name="Tenant B", slug=f"tenant-b-{uuid.uuid4().hex[:8]}")
        session.add(tenant_b)
        await session.flush()
        user_b = User(id=uuid.uuid4(), tenantId=tenant_b.id, email=f"user_{uuid.uuid4().hex[:6]}@example.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        session.add(user_b)
        await session.flush()
        agent_b = Agent(id=uuid.uuid4(), tenantId=tenant_b.id, templateId=template_id, name="Agent B", status=AgentStatus.LIVE)
        session.add(agent_b)
        await session.flush()
        config_b = {
            "variables": {
                "input": [{"key": "agentName", "defaultValue": "Bob"}, {"key": "secretCode", "defaultValue": "CODE_B"}]
            },
            "instructions": "I am {agentName}, secret={secretCode}"
        }
        version_b = AgentVersion(id=uuid.uuid4(), agentId=agent_b.id, versionNumber=1, configuration=config_b, createdBy=user_b.id)
        session.add(version_b)
        await session.flush()
        deployment_b = Deployment(id=uuid.uuid4(), tenantId=tenant_b.id, agentId=agent_b.id, versionId=version_b.id, environment=DeploymentEnvironment.PRODUCTION, status=DeploymentStatus.ACTIVE, createdBy=user_b.id)
        session.add(deployment_b)

        await session.commit()

        service = RuntimeAgentConfigService(session)
        rt_a = await service.resolve_runtime_config(deployment_id=deployment_a.id)
        rt_b = await service.resolve_runtime_config(deployment_id=deployment_b.id)

        assert "Alice" in rt_a.prompt.compiled_system_prompt
        assert "CODE_A" in rt_a.prompt.compiled_system_prompt
        assert "Bob" not in rt_a.prompt.compiled_system_prompt
        assert "CODE_B" not in rt_a.prompt.compiled_system_prompt

        assert "Bob" in rt_b.prompt.compiled_system_prompt
        assert "CODE_B" in rt_b.prompt.compiled_system_prompt
        assert "Alice" not in rt_b.prompt.compiled_system_prompt
        assert "CODE_A" not in rt_b.prompt.compiled_system_prompt


@pytest.mark.asyncio
async def test_8_agent_variable_isolation():
    """
    8. test_agent_variable_isolation
    Agent 1 values must never appear in Agent 2 runtime even within the same tenant.
    """
    async with AsyncSessionLocal() as session:
        template_id = await get_or_create_default_template(session)

        tenant = Tenant(id=uuid.uuid4(), name="Shared Tenant", slug=f"shared-{uuid.uuid4().hex[:8]}")
        session.add(tenant)
        await session.flush()

        user = User(id=uuid.uuid4(), tenantId=tenant.id, email=f"user_{uuid.uuid4().hex[:6]}@example.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        session.add(user)
        await session.flush()

        # Agent 1
        agent_1 = Agent(id=uuid.uuid4(), tenantId=tenant.id, templateId=template_id, name="Doctor Assistant", status=AgentStatus.LIVE)
        session.add(agent_1)
        await session.flush()
        config_1 = {
            "variables": {"input": [{"key": "agentName", "defaultValue": "DrAssistant"}]},
            "instructions": "Name: {agentName}"
        }
        version_1 = AgentVersion(id=uuid.uuid4(), agentId=agent_1.id, versionNumber=1, configuration=config_1, createdBy=user.id)
        session.add(version_1)
        await session.flush()
        deployment_1 = Deployment(id=uuid.uuid4(), tenantId=tenant.id, agentId=agent_1.id, versionId=version_1.id, environment=DeploymentEnvironment.PRODUCTION, status=DeploymentStatus.ACTIVE, createdBy=user.id)
        session.add(deployment_1)

        # Agent 2
        agent_2 = Agent(id=uuid.uuid4(), tenantId=tenant.id, templateId=template_id, name="Billing Assistant", status=AgentStatus.LIVE)
        session.add(agent_2)
        await session.flush()
        config_2 = {
            "variables": {"input": [{"key": "agentName", "defaultValue": "BillingBot"}]},
            "instructions": "Name: {agentName}"
        }
        version_2 = AgentVersion(id=uuid.uuid4(), agentId=agent_2.id, versionNumber=1, configuration=config_2, createdBy=user.id)
        session.add(version_2)
        await session.flush()
        deployment_2 = Deployment(id=uuid.uuid4(), tenantId=tenant.id, agentId=agent_2.id, versionId=version_2.id, environment=DeploymentEnvironment.PRODUCTION, status=DeploymentStatus.ACTIVE, createdBy=user.id)
        session.add(deployment_2)

        await session.commit()

        service = RuntimeAgentConfigService(session)
        rt_1 = await service.resolve_runtime_config(deployment_id=deployment_1.id)
        rt_2 = await service.resolve_runtime_config(deployment_id=deployment_2.id)

        assert "DrAssistant" in rt_1.prompt.compiled_system_prompt
        assert "BillingBot" not in rt_1.prompt.compiled_system_prompt

        assert "BillingBot" in rt_2.prompt.compiled_system_prompt
        assert "DrAssistant" not in rt_2.prompt.compiled_system_prompt


@pytest.mark.asyncio
async def test_9_no_stale_version_variable_value():
    """
    9. test_no_stale_version_variable_value
    If current variable value differs from an old AgentVersion snapshot, runtime must use
    the current authoritative mutable value according to the architectural contract.
    """
    async with AsyncSessionLocal() as session:
        template_id = await get_or_create_default_template(session)

        tenant = Tenant(id=uuid.uuid4(), name="Stale Test Tenant", slug=f"stale-{uuid.uuid4().hex[:8]}")
        session.add(tenant)
        await session.flush()

        user = User(id=uuid.uuid4(), tenantId=tenant.id, email=f"user_{uuid.uuid4().hex[:6]}@example.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        session.add(user)
        await session.flush()

        agent = Agent(id=uuid.uuid4(), tenantId=tenant.id, templateId=template_id, name="Stale Test Agent", status=AgentStatus.LIVE)
        session.add(agent)
        await session.flush()

        # Version 1 (snapshot deployed)
        v1_config = {
            "variables": {"input": [{"key": "businessHours", "defaultValue": "Old Hours 9 to 5"}]},
            "instructions": "Hours: {businessHours}"
        }
        v1 = AgentVersion(id=uuid.uuid4(), agentId=agent.id, versionNumber=1, configuration=v1_config, createdBy=user.id)
        session.add(v1)
        await session.flush()

        dep = Deployment(id=uuid.uuid4(), tenantId=tenant.id, agentId=agent.id, versionId=v1.id, environment=DeploymentEnvironment.PRODUCTION, status=DeploymentStatus.ACTIVE, createdBy=user.id)
        session.add(dep)
        await session.commit()

        # Version 2 (updated mutable variables)
        v2_config = {
            "variables": {"input": [{"key": "businessHours", "defaultValue": "New 24/7 Hours"}]},
            "instructions": "Hours: {businessHours}"
        }
        v2 = AgentVersion(id=uuid.uuid4(), agentId=agent.id, versionNumber=2, configuration=v2_config, createdBy=user.id)
        session.add(v2)
        await session.commit()

        service = RuntimeAgentConfigService(session)
        rt = await service.resolve_runtime_config(deployment_id=dep.id)

        assert "Hours: New 24/7 Hours" in rt.prompt.compiled_system_prompt
        assert "Old Hours 9 to 5" not in rt.prompt.compiled_system_prompt


@pytest.mark.asyncio
async def test_10_runtime_prompt_contains_effective_variable_and_resolved_greeting():
    """
    10. test_runtime_prompt_contains_effective_variable
    Verify the actual effective prompt and greeting passed to runtime contain the expected resolved values.
    """
    async with AsyncSessionLocal() as session:
        template_id = await get_or_create_default_template(session)

        tenant = Tenant(id=uuid.uuid4(), name="Greeting Test", slug=f"greeting-{uuid.uuid4().hex[:8]}")
        session.add(tenant)
        await session.flush()

        user = User(id=uuid.uuid4(), tenantId=tenant.id, email=f"user_{uuid.uuid4().hex[:6]}@example.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        session.add(user)
        await session.flush()

        agent = Agent(id=uuid.uuid4(), tenantId=tenant.id, templateId=template_id, name="Greeting Agent", status=AgentStatus.LIVE)
        session.add(agent)
        await session.flush()

        config = {
            "identity": {
                "greeting": "Namaste! Main {agentName} bol raha hoon {businessName} se."
            },
            "instructions": "Always identify as {agentName} from {businessName}.",
            "variables": {
                "input": [
                    {"key": "agentName", "defaultValue": "Rakesh"},
                    {"key": "businessName", "defaultValue": "City Dental"}
                ]
            }
        }
        v = AgentVersion(id=uuid.uuid4(), agentId=agent.id, versionNumber=1, configuration=config, createdBy=user.id)
        session.add(v)
        await session.flush()

        dep = Deployment(id=uuid.uuid4(), tenantId=tenant.id, agentId=agent.id, versionId=v.id, environment=DeploymentEnvironment.PRODUCTION, status=DeploymentStatus.ACTIVE, createdBy=user.id)
        session.add(dep)
        await session.commit()

        service = RuntimeAgentConfigService(session)
        rt = await service.resolve_runtime_config(deployment_id=dep.id)

        # Greeting must be fully resolved for telephony TTS
        assert rt.prompt.greeting == "Namaste! Main Rakesh bol raha hoon City Dental se."
        assert "You are Rakesh, representing City Dental." in rt.prompt.compiled_system_prompt
        assert "Always identify as Rakesh from City Dental." in rt.prompt.compiled_system_prompt
