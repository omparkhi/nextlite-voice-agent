import sys
from pathlib import Path
import pytest
import uuid

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from apps.api.app.services.prompt_compiler_service import prompt_compiler
from apps.api.app.services.template_service import TemplateService, SYSTEM_TEMPLATES
from apps.api.app.services.agent_service import AgentService
from apps.api.app.domain.variable_resolver import resolve_prompt_variables, build_effective_variable_map


def test_01_agent_identity_and_business_name_compiled():
    """TEST 1: Agent identity and businessName reach the compiled prompt accurately."""
    config = {
        "identity": {
            "agentName": "Rakesh",
            "businessName": "Medicare Multi-Specialty Clinic"
        },
        "businessInformation": {
            "businessName": "Medicare Multi-Specialty Clinic",
            "location": "Civil Lines, Jaipur"
        }
    }

    compiled = prompt_compiler.compile_system_prompt(configuration=config)

    assert "=== IDENTITY & PERSONA ===" in compiled
    assert "You are Rakesh, representing Medicare Multi-Specialty Clinic." in compiled
    assert "Business Name: Medicare Multi-Specialty Clinic" in compiled
    assert "Civil Lines, Jaipur" in compiled


def test_02_generic_identity_origin_guidance_in_safety_boundary():
    """TEST 2: Compiled prompt contains the semantic caller identity and origin guidance."""
    compiled = prompt_compiler.compile_system_prompt(
        configuration={"identity": {"agentName": "TestAgent"}}
    )

    assert "CALLER IDENTITY & ORIGIN GROUNDING" in compiled
    assert "Aapka naam kya hai?" in compiled
    assert "Aap kaha se baat kar rahe hain?" in compiled
    assert "Use configured agentName" in compiled
    assert "Use configured businessName" in compiled
    assert "Do NOT substitute technical descriptors" in compiled
    assert "digital assistant" in compiled


def test_03_ai_disclosure_scope_explicit():
    """TEST 3: AI disclosure is explicitly scoped only to explicit AI/automation inquiries."""
    compiled = prompt_compiler.compile_system_prompt(
        configuration={
            "identity": {"agentName": "Tara", "businessName": "Apex Institute"},
            "persona": {
                "aiIdentityBehavior": "If explicitly asked if you are an AI, robot, or automated system, acknowledge honestly that you are an AI phone representative for Apex Institute."
            }
        }
    )

    assert "Explicit AI disclosure applies ONLY when the caller explicitly asks whether you are an AI" in compiled
    assert "Explicit AI Inquiry Policy: If explicitly asked if you are an AI" in compiled


def test_04_no_redundant_default_ai_identity_in_templates():
    """TEST 4: Default templates and fallback configs do not redundantly inject AI persona descriptors."""
    for tmpl in SYSTEM_TEMPLATES:
        base_prompt = tmpl.get("base_prompt", "")
        # base_prompt should not start with redundant "You are a professional AI..."
        assert "You are a professional AI" not in base_prompt, f"Redundant AI declaration found in template: {tmpl['slug']}"
        assert "AI Voice Assistant" not in base_prompt, f"AI Voice Assistant found in template: {tmpl['slug']}"

    receptionist = TemplateService.find_system_template("receptionist")
    assert receptionist is not None
    assert "You are a professional front-desk and phone representative" in receptionist["base_prompt"]


def test_05_business_agnostic_non_healthcare_cafe():
    """TEST 5: Non-healthcare business (Sunrise Cafe) compiles cleanly without healthcare leakage."""
    cafe_config = {
        "identity": {
            "agentName": "Aarav",
            "businessName": "Sunrise Cafe"
        },
        "persona": {
            "role": "Cafe Host & Reservation Assistant",
            "personality": "Warm, welcoming, and polite",
            "tone": "friendly and professional"
        },
        "businessInformation": {
            "businessName": "Sunrise Cafe",
            "businessType": "Cafe & Bakery",
            "location": "Indiranagar, Bangalore",
            "hours": "8:00 AM to 11:00 PM"
        },
        "variables": {
            "input": [
                {"name": "agentName", "value": "Aarav"},
                {"name": "businessName", "value": "Sunrise Cafe"},
                {"name": "businessAddress", "value": "Indiranagar, Bangalore"}
            ]
        }
    }

    compiled = prompt_compiler.compile_system_prompt(configuration=cafe_config)

    assert "You are Aarav, representing Sunrise Cafe." in compiled
    assert "Role: Cafe Host & Reservation Assistant." in compiled
    assert "Location: Indiranagar, Bangalore" in compiled
    assert "Indiranagar, Bangalore" in compiled

    # Must NOT have healthcare leakage
    for forbidden in ["clinic", "hospital", "doctor", "opd", "patient", "medical"]:
        assert forbidden not in compiled.lower()


def test_06_custom_role_preservation():
    """TEST 6: Custom arbitrary roles are preserved intact."""
    custom_config = {
        "identity": {"agentName": "Neha", "businessName": "FinTech Advisors"},
        "persona": {
            "role": "Senior Wealth Advisor",
            "tone": "formal and analytical"
        }
    }

    compiled = prompt_compiler.compile_system_prompt(configuration=custom_config)

    assert "Role: Senior Wealth Advisor." in compiled
    assert "Tone: formal and analytical." in compiled


def test_07_address_and_location_grounding():
    """TEST 7: Physical location / address remains present and grounded."""
    config = {
        "identity": {"agentName": "Vikram", "businessName": "Skyline Heights"},
        "businessInformation": {
            "businessName": "Skyline Heights",
            "location": "Plot 42, Golf Course Road, Gurugram",
            "hours": "10:00 AM - 7:00 PM"
        },
        "variables": {
            "input": [
                {"name": "businessAddress", "value": "Plot 42, Golf Course Road, Gurugram"}
            ]
        }
    }

    compiled = prompt_compiler.compile_system_prompt(configuration=config)

    assert "Plot 42, Golf Course Road, Gurugram" in compiled
    assert "Location: Plot 42, Golf Course Road, Gurugram" in compiled


def test_08_dynamic_variables_resolve_correctly():
    """TEST 8: Dynamic variables resolve accurately through existing variable system."""
    config = {
        "identity": {"agentName": "{{agentName}}", "greeting": "Namaste from {{businessName}}! I am {{agentName}}."},
        "businessInformation": {"businessName": "{{businessName}}"},
        "variables": {
            "input": [
                {"name": "agentName", "value": "Rakesh"},
                {"name": "businessName", "value": "Medicare Clinic"}
            ]
        }
    }

    compiled = prompt_compiler.compile_system_prompt(configuration=config)

    assert "You are Rakesh, representing Medicare Clinic." in compiled
    assert 'On call connect, greet caller with: "Namaste from Medicare Clinic! I am Rakesh."' in compiled


def test_09_three_business_test_matrix():
    """TEST 9: Multi-business matrix (Healthcare, Cafe, Real Estate) verifying tenant & identity isolation."""
    businesses = [
        {
            "name": "Medicare Multi-Specialty Clinic",
            "agent": "Rakesh",
            "loc": "Sector 14, Gurugram",
            "role": "Clinic Front Desk"
        },
        {
            "name": "Sunrise Cafe",
            "agent": "Aarav",
            "loc": "Indiranagar, Bangalore",
            "role": "Table Host"
        },
        {
            "name": "Prime Properties",
            "agent": "Neha",
            "loc": "BKC, Mumbai",
            "role": "Property Consultant"
        }
    ]

    for biz in businesses:
        cfg = {
            "identity": {"agentName": biz["agent"], "businessName": biz["name"]},
            "persona": {"role": biz["role"]},
            "businessInformation": {"businessName": biz["name"], "location": biz["loc"]},
            "variables": {
                "input": [
                    {"name": "agentName", "value": biz["agent"]},
                    {"name": "businessName", "value": biz["name"]},
                    {"name": "businessAddress", "value": biz["loc"]}
                ]
            }
        }
        compiled = prompt_compiler.compile_system_prompt(configuration=cfg)

        assert f"You are {biz['agent']}, representing {biz['name']}." in compiled
        assert f"Role: {biz['role']}." in compiled
        assert biz["loc"] in compiled

        # Check no cross-tenant leakage
        for other_biz in businesses:
            if other_biz["name"] != biz["name"]:
                assert other_biz["name"] not in compiled
                assert other_biz["agent"] not in compiled
