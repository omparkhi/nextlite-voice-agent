import pytest
import uuid
from apps.api.app.services.template_service import TemplateService, SYSTEM_TEMPLATES
from apps.api.app.services.prompt_compiler_service import prompt_compiler
from apps.api.app.services.agent_service import AgentService
from apps.api.app.models import AgentStatus

HEALTHCARE_RESTRICTED_KEYWORDS = [
    "doctor", "patient", "clinic", "consultation", "hospital", "opd"
]

@pytest.mark.asyncio
async def test_01_template_load():
    """TEST 1: Valid Receptionist template loads successfully."""
    tmpl = TemplateService.find_system_template("receptionist")
    assert tmpl is not None
    assert tmpl["name"] == "Receptionist"
    assert tmpl["industry"] == "General"
    assert "base_prompt" in tmpl and len(tmpl["base_prompt"]) > 50
    assert "default_configuration" in tmpl

@pytest.mark.asyncio
async def test_02_template_prompt_included_in_runtime_compilation():
    """TEST 2: The template prompt is included in the compiled runtime prompt."""
    tmpl = TemplateService.find_system_template("receptionist")
    assert tmpl is not None

    custom_config = {
        "identity": {
            "agentName": "Maya",
            "businessName": "Zenith Salon & Spa"
        },
        "businessInformation": {
            "businessName": "Zenith Salon & Spa",
            "businessType": "Salon & Wellness Spa",
            "hours": "Tue-Sun 10:00 AM - 8:00 PM"
        }
    }

    compiled = prompt_compiler.compile_system_prompt(
        configuration=custom_config,
        template_base_prompt=tmpl["base_prompt"]
    )

    assert "=== ROLE BASELINE & CONVERSATIONAL PRINCIPLES ===" in compiled
    assert "You are a professional front-desk and phone representative" in compiled
    assert "Zenith Salon & Spa" in compiled
    assert "Maya" in compiled

@pytest.mark.asyncio
async def test_03_no_client_data_in_generic_template():
    """TEST 3: Template content contains no specific client business data."""
    tmpl = TemplateService.find_system_template("receptionist")
    assert tmpl is not None

    cfg = tmpl["default_configuration"]
    # Verify businessName is blank or a placeholder in generic template
    assert cfg["businessInformation"]["businessName"] == ""
    assert cfg["businessInformation"]["location"] == ""
    assert cfg["businessInformation"]["customFacts"] == {}

@pytest.mark.asyncio
async def test_04_no_healthcare_leakage_in_generic_template():
    """TEST 4: The generic Receptionist template does not inject healthcare keywords."""
    tmpl = TemplateService.find_system_template("receptionist")
    assert tmpl is not None

    prompt_text = (tmpl["base_prompt"] + " " + str(tmpl["default_configuration"])).lower()
    for kw in HEALTHCARE_RESTRICTED_KEYWORDS:
        assert kw not in prompt_text, f"Healthcare keyword '{kw}' leaked into generic Receptionist template"

@pytest.mark.asyncio
async def test_05_multiple_agents_same_template():
    """TEST 5: Two agents (Restaurant vs Coaching) reference the same template with independent configurations."""
    tmpl = TemplateService.find_system_template("receptionist")
    assert tmpl is not None
    base_prompt = tmpl["base_prompt"]

    # Agent A: Spice Garden Restaurant
    config_a = {
        "identity": {"agentName": "Kavita", "businessName": "Spice Garden Restaurant"},
        "businessInformation": {
            "businessName": "Spice Garden Restaurant",
            "businessType": "Fine Dining Restaurant",
            "hours": "Daily 12:00 PM - 11:00 PM",
            "customFacts": {"Cuisine": "North Indian & Mughlai", "Valet_Parking": "Available"}
        }
    }
    prompt_a = prompt_compiler.compile_system_prompt(configuration=config_a, template_base_prompt=base_prompt)

    # Agent B: Pinnacle Coaching Institute
    config_b = {
        "identity": {"agentName": "Rohan", "businessName": "Pinnacle IAS Academy"},
        "businessInformation": {
            "businessName": "Pinnacle IAS Academy",
            "businessType": "Civil Services Coaching",
            "hours": "Mon-Sat 8:00 AM - 7:00 PM",
            "customFacts": {"Target_Exam": "UPSC CSE 2027", "Batch_Size": "35 students"}
        }
    }
    prompt_b = prompt_compiler.compile_system_prompt(configuration=config_b, template_base_prompt=base_prompt)

    # Verify both share the template role baseline
    assert "=== ROLE BASELINE & CONVERSATIONAL PRINCIPLES ===" in prompt_a
    assert "=== ROLE BASELINE & CONVERSATIONAL PRINCIPLES ===" in prompt_b

    # Verify Agent A has restaurant data and not coaching data
    assert "Spice Garden Restaurant" in prompt_a
    assert "North Indian & Mughlai" in prompt_a
    assert "Pinnacle IAS Academy" not in prompt_a

    # Verify Agent B has coaching data and not restaurant data
    assert "Pinnacle IAS Academy" in prompt_b
    assert "UPSC CSE 2027" in prompt_b
    assert "Spice Garden Restaurant" not in prompt_b

    # Verify neither contains healthcare leakage
    for kw in HEALTHCARE_RESTRICTED_KEYWORDS:
        assert kw not in prompt_a.lower()
        assert kw not in prompt_b.lower()

@pytest.mark.asyncio
async def test_06_template_isolation():
    """TEST 6: Modifying an agent configuration does not mutate the template or other agents."""
    tmpl = TemplateService.find_system_template("receptionist")
    assert tmpl is not None

    original_template_name = tmpl["name"]
    original_base_prompt = tmpl["base_prompt"]

    # Client modifies agent config
    client_config = tmpl["default_configuration"]
    client_config["identity"]["agentName"] = "Custom Agent"
    client_config["businessInformation"]["businessName"] = "Custom Enterprises"

    # Verify fresh template lookup remains unmutated
    fresh_tmpl = TemplateService.find_system_template("receptionist")
    assert fresh_tmpl["name"] == original_template_name
    assert fresh_tmpl["base_prompt"] == original_base_prompt
    assert fresh_tmpl["default_configuration"]["identity"]["agentName"] == "Riya"
    assert fresh_tmpl["default_configuration"]["businessInformation"]["businessName"] == ""

@pytest.mark.asyncio
async def test_07_first_client_healthcare_compatibility():
    """TEST 7: Existing healthcare first-client behavior continues to compile and work accurately."""
    clinic_tmpl = TemplateService.find_system_template("clinic_receptionist")
    assert clinic_tmpl is not None
    assert clinic_tmpl["industry"] == "Healthcare"

    clinic_config = {
        "identity": {
            "agentName": "Priya",
            "businessName": "Arogya Medical Clinic",
            "greeting": "Hello, thank you for calling Arogya Medical Clinic. How can I help you today?"
        },
        "persona": {
            "role": "Medical Clinic Receptionist",
            "personality": "Empathetic and professional",
            "tone": "warm and reassuring"
        },
        "businessInformation": {
            "businessName": "Arogya Medical Clinic",
            "businessType": "Healthcare Clinic",
            "hours": "Mon-Sat 9:00 AM - 6:00 PM"
        },
        "guardrails": {
            "prohibitedTopics": ["emergency medical diagnosis"],
            "escalationRules": ["Severe chest pain -> advise emergency room immediately"]
        }
    }

    compiled = prompt_compiler.compile_system_prompt(
        configuration=clinic_config,
        template_base_prompt=clinic_tmpl["base_prompt"]
    )

    assert "Arogya Medical Clinic" in compiled
    assert "Medical Clinic Receptionist" in compiled
    assert "CLINICAL ROLE PRINCIPLES" in compiled
    assert "Severe chest pain -> advise emergency room immediately" in compiled
    assert "=== NEXTLITE CORE RUNTIME SAFETY BOUNDARY ===" in compiled

@pytest.mark.asyncio
async def test_08_missing_template_safe_fallback():
    """TEST 8: Missing template ID falls back safely to neutral AI Voice Assistant without healthcare bias."""
    fallback_prompt = prompt_compiler.compile_system_prompt(
        configuration={"identity": {"agentName": "Echo"}},
        template_base_prompt=None
    )

    assert "=== NEXTLITE CORE RUNTIME SAFETY BOUNDARY ===" in fallback_prompt
    assert "You are Echo" in fallback_prompt
    # Must not contain healthcare words
    for kw in HEALTHCARE_RESTRICTED_KEYWORDS:
        assert kw not in fallback_prompt.lower()

@pytest.mark.asyncio
async def test_09_tenant_isolation():
    """TEST 9: Tenant A cannot access or modify Tenant B's agent configuration."""
    from apps.api.app.models import Tenant, User, UserRole
    from apps.api.app.db import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        tenant_a_id = uuid.uuid4()
        tenant_b_id = uuid.uuid4()
        user_a_id = uuid.uuid4()

        tenant_a = Tenant(id=tenant_a_id, name="Tenant A", slug=f"tenant-a-{uuid.uuid4().hex[:6]}")
        tenant_b = Tenant(id=tenant_b_id, name="Tenant B", slug=f"tenant-b-{uuid.uuid4().hex[:6]}")
        user_a = User(id=user_a_id, tenantId=tenant_a_id, email=f"a_{uuid.uuid4().hex[:6]}@tenanta.com", passwordHash="hash", role=UserRole.CLIENT_OWNER)
        
        session.add(tenant_a)
        session.add(tenant_b)
        session.add(user_a)
        await session.flush()

        service = AgentService(session)
        agent_a = await service.create_agent(tenant_id=tenant_a_id, name="Agent Alpha", created_by=user_a_id)

        # Tenant B attempts to get Agent A
        agent_for_b = await service.get_agent(agent_id=uuid.UUID(agent_a["id"]), tenant_id=tenant_b_id)
        assert agent_for_b is None

@pytest.mark.asyncio
async def test_10_prompt_layering_order():
    """TEST 10: Verify platform rules -> template prompt -> identity -> business info are composed in order."""
    tmpl = TemplateService.find_system_template("receptionist")
    assert tmpl is not None

    cfg = {
        "identity": {"agentName": "Tara", "businessName": "Tara Consulting"},
        "businessInformation": {"businessName": "Tara Consulting", "hours": "9-5"},
        "systemInstructions": "Be extra cheerful."
    }

    compiled = prompt_compiler.compile_system_prompt(
        configuration=cfg,
        template_base_prompt=tmpl["base_prompt"]
    )

    idx_safety = compiled.find("=== NEXTLITE CORE RUNTIME SAFETY BOUNDARY ===")
    idx_temporal = compiled.find("=== TEMPORAL CONTEXT ===")
    idx_template = compiled.find("=== ROLE BASELINE & CONVERSATIONAL PRINCIPLES ===")
    idx_identity = compiled.find("=== IDENTITY & PERSONA ===")
    idx_custom = compiled.find("=== CUSTOM INSTRUCTIONS ===")

    assert idx_safety != -1
    assert idx_temporal != -1
    assert idx_template != -1
    assert idx_identity != -1
    assert idx_custom != -1

    assert idx_safety < idx_temporal < idx_template < idx_identity < idx_custom

@pytest.mark.asyncio
async def test_11_template_tool_neutrality():
    """TEST 11: Generic templates describe capabilities neutrally without healthcare constraints."""
    tmpl = TemplateService.find_system_template("receptionist")
    tools = tmpl["default_configuration"]["tools"]["bindings"]
    tool_ids = [t["toolId"] for t in tools]

    assert "query_knowledge_base" in tool_ids
    assert "book_appointment" in tool_ids
    assert "create_callback_lead" in tool_ids

    for t in tools:
        assert "doctor" not in t.get("description", "").lower()
        assert "patient" not in t.get("description", "").lower()

@pytest.mark.asyncio
async def test_12_template_knowledge_empty():
    """TEST 12: Business-specific knowledge is not embedded in the generic template."""
    tmpl = TemplateService.find_system_template("receptionist")
    cfg = tmpl["default_configuration"]
    
    # Generic template must have empty custom facts
    assert cfg.get("businessInformation", {}).get("customFacts", {}) == {}
