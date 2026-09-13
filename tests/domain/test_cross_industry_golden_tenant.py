import sys
from pathlib import Path
import pytest
import uuid

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from apps.api.app.services.prompt_compiler_service import prompt_compiler
from apps.api.app.domain.tool_registry import CANONICAL_TOOL_REGISTRY, validate_tool_arguments, sanitize_tool_arguments
from apps.api.app.domain.variable_resolver import build_effective_variable_map, resolve_prompt_variables


def test_golden_tenant_fitness_studio():
    """
    SECTION 27 GOLDEN TEST 1:
    Configure a brand new business industry: 'Elite Fitness & Crossfit Studio'.
    Proves that arbitrary industries compile and execute cleanly with ZERO source code changes.
    """
    fitness_config = {
        "identity": {
            "agentName": "Sameer",
            "displayName": "Sameer - Membership & Trial Coordinator",
            "greeting": "Namaste! Welcome to {{businessName}}. Are you looking for gym memberships or personal training slots today?",
            "businessName": "Elite Fitness Studio"
        },
        "persona": {
            "role": "Fitness Membership & Trial Coordinator",
            "personality": "Energetic, encouraging, structured, and polite",
            "tone": "motivational and professional",
            "style": "concise and direct"
        },
        "businessInformation": {
            "businessName": "Elite Fitness Studio",
            "businessType": "Fitness & Wellness",
            "description": "Premium 24/7 fitness center with CrossFit, Olympic lifting, and yoga facilities.",
            "location": "Koregaon Park, Pune",
            "hours": "Mon-Sun 5:30 AM - 10:30 PM",
            "customFacts": {
                "Trial_Session": "Free 1-day pass for first-time visitors",
                "Locker_Facility": "Complimentary digital lockers and steam room"
            }
        },
        "variables": {
            "input": [
                {"name": "agentName", "value": "Sameer"},
                {"name": "businessName", "value": "Elite Fitness Studio"},
                {"name": "businessAddress", "value": "Koregaon Park, Pune"},
                {"name": "membershipPlans", "value": "Monthly: Rs 3500, Annual: Rs 25000"}
            ]
        },
        "tools": {
            "enabled": True,
            "bindings": [
                {"toolId": "book_appointment", "name": "book_appointment", "enabled": True},
                {"toolId": "query_knowledge_base", "name": "query_knowledge_base", "enabled": True},
                {"toolId": "create_callback_lead", "name": "create_callback_lead", "enabled": True}
            ]
        }
    }

    compiled = prompt_compiler.compile_system_prompt(configuration=fitness_config)

    # 1. Verify identity grounding
    assert "You are Sameer, representing Elite Fitness Studio." in compiled
    assert "Role: Fitness Membership & Trial Coordinator." in compiled
    assert "Location: Koregaon Park, Pune" in compiled
    assert "Mon-Sun 5:30 AM - 10:30 PM" in compiled
    assert 'On call connect, greet caller with: "Namaste! Welcome to Elite Fitness Studio.' in compiled
    assert "- membershipPlans: Monthly: Rs 3500, Annual: Rs 25000" in compiled

    # 2. Verify zero domain leakage (no clinic, doctor, hospital, patient, opd)
    for forbidden in ["clinic", "hospital", "doctor", "opd", "patient", "medical"]:
        assert forbidden not in compiled.lower(), f"Unexpected domain leakage of '{forbidden}' in Fitness Studio prompt"


def test_golden_tenant_legal_services():
    """
    SECTION 27 GOLDEN TEST 2:
    Configure a brand new business industry: 'Apex Corporate Law Chambers'.
    """
    legal_config = {
        "identity": {
            "agentName": "Kavita",
            "businessName": "Apex Law Chambers",
            "greeting": "Good day, thank you for contacting {{businessName}}. How may I assist you with legal consultation scheduling?"
        },
        "persona": {
            "role": "Legal Intake Coordinator",
            "tone": "formal and discreet"
        },
        "businessInformation": {
            "businessName": "Apex Law Chambers",
            "businessType": "Legal & Corporate Advisory",
            "location": "Connaught Place, New Delhi",
            "hours": "Mon-Fri 9:30 AM - 6:30 PM"
        },
        "variables": {
            "input": [
                {"name": "agentName", "value": "Kavita"},
                {"name": "businessName", "value": "Apex Law Chambers"}
            ]
        }
    }

    compiled = prompt_compiler.compile_system_prompt(configuration=legal_config)

    assert "You are Kavita, representing Apex Law Chambers." in compiled
    assert "Role: Legal Intake Coordinator." in compiled
    assert "Connaught Place, New Delhi" in compiled
    assert "Mon-Fri 9:30 AM - 6:30 PM" in compiled

    for forbidden in ["clinic", "hospital", "doctor", "opd", "patient"]:
        assert forbidden not in compiled.lower()


def test_golden_tenant_pet_grooming():
    """
    SECTION 27 GOLDEN TEST 3:
    Configure a brand new business industry: 'Happy Tails Pet Grooming & Spa'.
    """
    pet_config = {
        "identity": {
            "agentName": "Tanvi",
            "businessName": "Happy Tails Pet Spa",
            "greeting": "Hello! Welcome to {{businessName}}. How can I help book a grooming session for your pet today?"
        },
        "persona": {
            "role": "Pet Spa Concierge",
            "tone": "warm and friendly"
        },
        "businessInformation": {
            "businessName": "Happy Tails Pet Spa",
            "businessType": "Pet Services",
            "location": "Bandra, Mumbai",
            "hours": "Tue-Sun 10:00 AM - 7:00 PM"
        }
    }

    compiled = prompt_compiler.compile_system_prompt(configuration=pet_config)

    assert "You are Tanvi, representing Happy Tails Pet Spa." in compiled
    assert "Role: Pet Spa Concierge." in compiled
    assert "Bandra, Mumbai" in compiled
    assert "Tue-Sun 10:00 AM - 7:00 PM" in compiled

    for forbidden in ["clinic", "hospital", "doctor", "opd", "patient"]:
        assert forbidden not in compiled.lower()
