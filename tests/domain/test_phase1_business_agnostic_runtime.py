import sys
from pathlib import Path
import re
import uuid
import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "apps" / "pipecat-worker"))

from apps.api.app.services.prompt_compiler_service import prompt_compiler
from apps.api.app.services.runtime_config_service import CANONICAL_TOOL_DEFS
from apps.api.app.models import Appointment, AppointmentStatus
from app.language_manager import (
    ConversationLanguageManager,
    build_language_instruction,
    detect_explicit_language_request,
    match_supported_language,
)
from app.tools.appointment_tool import (
    APPOINTMENT_TOOL_PROPERTIES,
)
from app.tools.knowledge_tool import (
    KNOWLEDGE_TOOL_PROPERTIES,
)


HEALTHCARE_KEYWORDS = [
    r"\bclinic\b",
    r"\bhospital\b",
    r"\bdoctor\b",
    r"\bpatient\b",
    r"\bconsultation\b",
    r"\bopd\b",
]

COMPILED_HEALTHCARE_PATTERNS = [re.compile(kw, re.IGNORECASE) for kw in HEALTHCARE_KEYWORDS]


def test_1_generic_agent_configuration_loads_without_healthcare():
    """TEST 1: Generic agent configuration can be loaded without healthcare assumptions."""
    generic_cfg = {
        "identity": {
            "agentName": "Tara",
            "businessName": "Apex Coaching Institute"
        },
        "persona": {
            "role": "Admissions Counselor",
            "tone": "encouraging and informative"
        },
        "businessInformation": {
            "businessType": "Education / Coaching",
            "description": "Premier coaching for competitive exams.",
            "location": "Pune, Maharashtra",
            "hours": "9:00 AM to 7:00 PM"
        },
        "objective": {
            "primaryObjective": "Assist students and parents with course details and demo lecture bookings."
        },
        "language": {
            "primary": "hi-IN",
            "supportedLanguages": ["en-IN", "hi-IN", "mr-IN"]
        }
    }

    compiled = prompt_compiler.compile_system_prompt(
        configuration=generic_cfg,
        timezone="Asia/Kolkata",
        primary_lang="hi-IN"
    )

    for pattern in COMPILED_HEALTHCARE_PATTERNS:
        matches = pattern.findall(compiled)
        assert len(matches) == 0, f"Found unexpected healthcare keyword match: {matches} in generic prompt"

    assert "Tara" in compiled
    assert "Apex Coaching Institute" in compiled
    assert "Admissions Counselor" in compiled
    assert "Pune, Maharashtra" in compiled


def test_2_restaurant_configuration_runtime_prompt_no_healthcare():
    """TEST 2: Non-healthcare example configuration (ABC Restaurant) compiles cleanly without healthcare assumptions."""
    restaurant_cfg = {
        "identity": {
            "agentName": "Riya",
            "businessName": "ABC Restaurant"
        },
        "persona": {
            "role": "Table Host & Order Assistant",
            "personality": "warm, welcoming, and concise",
            "tone": "friendly and polite"
        },
        "businessInformation": {
            "businessType": "Restaurant",
            "description": "Authentic North Indian and Mughlai dining.",
            "location": "Bandra West, Mumbai",
            "hours": "12:00 PM to 11:30 PM",
            "customFacts": {
                "Dine-in": "Available with indoor AC and outdoor patio seating",
                "Takeaway": "Available with 15-minute preparation time",
                "Specialties": "Biryani, Paneer Tikka, Butter Chicken"
            }
        },
        "objective": {
            "primaryObjective": "Answer customer questions about menu, table reservations, and takeaway timings."
        },
        "language": {
            "primary": "hi-IN",
            "supportedLanguages": ["en-IN", "hi-IN", "mr-IN"]
        }
    }

    compiled = prompt_compiler.compile_system_prompt(
        configuration=restaurant_cfg,
        timezone="Asia/Kolkata",
        primary_lang="hi-IN",
        supported_langs=["en-IN", "hi-IN", "mr-IN"]
    )

    # Must not contain any healthcare keywords
    for pattern in COMPILED_HEALTHCARE_PATTERNS:
        matches = pattern.findall(compiled)
        assert len(matches) == 0, f"Found healthcare keyword '{pattern.pattern}' in restaurant prompt: {matches}"

    # Verify restaurant details are present
    assert "Riya" in compiled
    assert "ABC Restaurant" in compiled
    assert "Table Host & Order Assistant" in compiled
    assert "Bandra West, Mumbai" in compiled
    assert "Dine-in" in compiled
    assert "Takeaway" in compiled
    assert "Biryani, Paneer Tikka, Butter Chicken" in compiled


def test_3_healthcare_configuration_still_works_for_first_client():
    """TEST 3: Healthcare/appointment configuration still compiles properly with medical context preserved."""
    healthcare_cfg = {
        "identity": {
            "agentName": "Maya",
            "businessName": "City Health Clinic"
        },
        "persona": {
            "role": "Clinic Receptionist",
            "tone": "compassionate and professional"
        },
        "businessInformation": {
            "businessType": "Healthcare Clinic",
            "description": "Multi-specialty outpatient healthcare clinic.",
            "location": "Andheri East, Mumbai",
            "hours": "8:00 AM to 8:00 PM",
            "customFacts": {
                "Doctor": "Dr. Rajesh Sharma (General Medicine)",
                "Consultation Fee": "₹500 for first visit",
                "OPD Timings": "9:00 AM - 1:00 PM and 5:00 PM - 8:00 PM"
            }
        },
        "objective": {
            "primaryObjective": "Assist patients with doctor appointment scheduling and clinic information."
        },
        "systemInstructions": "When a patient asks for Dr. Sharma, check available morning and evening OPD slots."
    }

    compiled = prompt_compiler.compile_system_prompt(
        configuration=healthcare_cfg,
        timezone="Asia/Kolkata",
        primary_lang="hi-IN"
    )

    # Should faithfully include customer-configured medical instructions
    assert "Maya" in compiled
    assert "City Health Clinic" in compiled
    assert "Dr. Rajesh Sharma" in compiled
    assert "Consultation Fee" in compiled
    assert "OPD Timings" in compiled
    assert "When a patient asks for Dr. Sharma" in compiled


def test_4_tool_definitions_are_business_agnostic():
    """TEST 4: Tool definitions are not globally described using healthcare language."""
    # Canonical tool definitions in runtime_config_service
    kb_desc = CANONICAL_TOOL_DEFS["query_knowledge_base"].description
    assert "clinic" not in kb_desc.lower()
    assert "hospital" not in kb_desc.lower()
    assert "doctor" not in kb_desc.lower()
    assert "business details" in kb_desc or "business knowledge base" in kb_desc

    appt_resource_desc = CANONICAL_TOOL_DEFS["book_appointment"].parameters["properties"]["resourceName"]["description"]
    assert "doctor" not in appt_resource_desc.lower()
    assert "staff member, host, specialist, or service provider" in appt_resource_desc

    # Pipecat worker tool properties
    worker_resource_desc = APPOINTMENT_TOOL_PROPERTIES["resourceName"]["description"]
    assert "doctor" not in worker_resource_desc.lower()

    worker_kb_query_desc = KNOWLEDGE_TOOL_PROPERTIES["query"]["description"]
    assert "clinic" not in worker_kb_query_desc.lower()


def test_5_missing_business_configuration_does_not_invent_healthcare():
    """TEST 5: Missing business configuration compiles into neutral defaults without healthcare inventions."""
    minimal_cfg = {}

    compiled = prompt_compiler.compile_system_prompt(
        configuration=minimal_cfg,
        timezone="Asia/Kolkata"
    )

    for pattern in COMPILED_HEALTHCARE_PATTERNS:
        matches = pattern.findall(compiled)
        assert len(matches) == 0, f"Found unexpected healthcare keyword '{pattern.pattern}' in default prompt: {matches}"

    assert "You are Assistant." in compiled
    assert "NEXTLITE CORE RUNTIME SAFETY BOUNDARY" in compiled


def test_6_language_manager_does_not_require_hardcoded_healthcare():
    """TEST 6: Language manager operates independently of business/healthcare vocabulary."""
    lang_mgr = ConversationLanguageManager(primary="hi-IN", supported_languages=["en-IN", "hi-IN", "mr-IN"])

    # Explicit request detection
    assert detect_explicit_language_request("Please speak in English") == "en-IN"
    assert detect_explicit_language_request("हिंदी में बात करो") == "hi-IN"
    assert detect_explicit_language_request("मराठीत बोला") == "mr-IN"

    # Instruction generation is language-focused, not industry-coupled
    hi_inst = build_language_instruction("hi-IN")
    for pattern in COMPILED_HEALTHCARE_PATTERNS:
        assert not pattern.search(hi_inst), f"Found healthcare keyword in Hindi language instruction: {pattern.pattern}"

    mr_inst = build_language_instruction("mr-IN")
    for pattern in COMPILED_HEALTHCARE_PATTERNS:
        assert not pattern.search(mr_inst), f"Found healthcare keyword in Marathi language instruction: {pattern.pattern}"


def test_7_database_appointment_default_is_business_neutral():
    """TEST 7: Database model default for Appointment title is business-neutral."""
    assert Appointment.title.default.arg == "Appointment"
    assert Appointment.status.default.arg == AppointmentStatus.REQUESTED


def test_8_multi_tenant_isolation_and_runtime_config_contract():
    """TEST 8: RuntimeAgentConfig schema adheres to strict tenant isolation without business bias."""
    from apps.api.app.schemas import (
        RuntimeAgentConfig, RuntimeTenantConfig, RuntimeAgentMetadata,
        RuntimeDeploymentMetadata, RuntimePromptConfig, RuntimeVoiceConfig,
        RuntimeLanguageConfig, RuntimeBehaviorConfig, RuntimeKnowledgeConfig,
        RuntimeToolConfig, RuntimeVariableConfig
    )

    tenant_id_a = str(uuid.uuid4())
    tenant_id_b = str(uuid.uuid4())
    assert tenant_id_a != tenant_id_b

    config_a = RuntimeAgentConfig(
        tenant=RuntimeTenantConfig(tenant_id=tenant_id_a),
        agent=RuntimeAgentMetadata(agent_id=str(uuid.uuid4()), agent_name="Salon Assistant", status="LIVE"),
        deployment=RuntimeDeploymentMetadata(deployment_id=str(uuid.uuid4()), version_id=str(uuid.uuid4()), version_number=1),
        prompt=RuntimePromptConfig(compiled_system_prompt="You are a salon assistant.", greeting="Welcome to Aura Salon", timezone="Asia/Kolkata"),
        voice=RuntimeVoiceConfig(provider="sarvam", voice_id="shubh"),
        language=RuntimeLanguageConfig(primary="hi-IN", supported_languages=["en-IN", "hi-IN"]),
        runtime=RuntimeBehaviorConfig(),
        knowledge=RuntimeKnowledgeConfig(enabled=True),
        tools=RuntimeToolConfig(enabled=True, tools=[]),
        variables=RuntimeVariableConfig(input_variables=[], output_variables=[])
    )

    assert config_a.tenant.tenant_id == tenant_id_a
    assert config_a.tenant.tenant_id != tenant_id_b
    assert config_a.agent.agent_name == "Salon Assistant"
