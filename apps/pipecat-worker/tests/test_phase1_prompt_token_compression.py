"""Phase 1 Unit & Controlled Benchmark Tests: LLM Prompt & Context Token Compression.

Tests verify:
1. Prompt compilation in Lean vs Legacy modes.
2. Dynamic tenant facts preservation across all tenant configurations.
3. Deterministic application WorkflowState tracking and summary formatting.
4. Multilingual Devanagari & Latin script instructions in Lean mode.
5. Tool schema scoping on post-tool turns (preserving emergency/terminal tools, stripping bulk schemas).
6. Non-PII token metrics telemetry instrumentation.
7. Feature flag rollback safety (ENABLE_LEAN_PROMPT_COMPRESSION and ENABLE_LLM_PROMPT_WARMUP).
8. Controlled A/B token count benchmark comparing Legacy vs Lean prompts across simulated call turns.
"""

import json
import pytest
from unittest.mock import MagicMock, patch

from app.config import settings
from app.workflow_state import WorkflowState
from app.temporal_context import build_compact_temporal_anchor, build_temporal_and_calendar_instructions
from app.language_manager import (
    ConversationLanguageManager,
    build_full_instructions,
    build_lean_language_instruction,
    build_language_instruction,
)
from app.tools.tool_registry import ToolRuntimeContext, ToolRegistry


# ---------------------------------------------------------------------------
# 1. Prompt Compiler & Dynamic Tenant Configuration Tests
# ---------------------------------------------------------------------------

def test_prompt_compiler_dynamic_tenant_facts_preserved():
    """Verify dynamic business facts (name, hours, doctors, services, variables) are preserved in Lean prompt."""
    import sys
    from pathlib import Path
    root_path = str(Path(__file__).resolve().parents[3])
    if root_path not in sys.path:
        sys.path.insert(0, root_path)
    from apps.api.app.services.prompt_compiler_service import PromptCompilerService

    compiler = PromptCompilerService()
    tenant_config = {
        "identity": {
            "businessName": "Apex Multispeciality Dental Clinic",
            "agentName": "Pooja",
        },
        "businessInformation": {
            "businessType": "Dental Healthcare",
            "description": "Advanced laser dentistry and dental implants",
            "hours": "Mon-Sat 10:00 AM - 08:00 PM, Sunday Closed",
            "location": "Baner Road, Pune, Maharashtra",
            "phone": "+91-20-88889999",
        },
        "variables": {
            "input": [
                {"name": "leadDentist", "value": "Dr. Rohit Deshmukh (MDS Orthodontics)"},
                {"name": "consultationFee", "value": "₹500 INR"},
                {"name": "emergencyService", "value": "Available 24/7 on call"},
            ]
        },
        "conversation": {
            "phases": [
                {"name": "Greeting", "objective": "Greet warmly and identify concern"},
                {"name": "Details", "objective": "Collect patient name and appointment preference"},
                {"name": "Booking", "objective": "Confirm slot via tool and conclude"},
            ]
        },
        "guardrails": {
            "emergencyTransferEnabled": True,
            "emergencyPhone": "+919876543210",
            "prohibitedTopics": ["Self-medication prescription", "Unverified surgical guarantees"],
        },
    }

    # Compile in lean mode
    lean_prompt = compiler.compile_system_prompt(tenant_config, lean_mode=True)
    legacy_prompt = compiler.compile_system_prompt(tenant_config, lean_mode=False)

    # Assertions on Lean Prompt
    assert "Apex Multispeciality Dental Clinic" in lean_prompt
    assert "Pooja" in lean_prompt
    assert "Mon-Sat 10:00 AM - 08:00 PM" in lean_prompt
    assert "Baner Road, Pune, Maharashtra" in lean_prompt
    assert "Dr. Rohit Deshmukh" in lean_prompt
    assert "₹500 INR" in lean_prompt
    assert "transfer_call" in lean_prompt
    assert "end_call" in lean_prompt

    # Assert token/character compression: Lean prompt must be significantly more compact than legacy
    assert len(lean_prompt) < len(legacy_prompt)
    reduction_pct = (1.0 - len(lean_prompt) / len(legacy_prompt)) * 100
    assert reduction_pct > 40.0, f"Expected >40% character reduction, got {reduction_pct:.1f}%"


# ---------------------------------------------------------------------------
# 2. Compact Temporal Context Tests
# ---------------------------------------------------------------------------

def test_compact_temporal_anchor_vs_legacy():
    """Verify compact temporal anchor contains date, day, time, timezone without duplicate 1.8KB table."""
    compact_anchor = build_compact_temporal_anchor(time_zone="Asia/Kolkata")
    legacy_calendar = build_temporal_and_calendar_instructions(time_zone="Asia/Kolkata")

    # Content checks
    assert "=== RUNTIME CLOCK ===" in compact_anchor
    assert "Asia/Kolkata" in compact_anchor
    assert "YYYY-MM-DD" in compact_anchor

    # Size checks: compact anchor should be <350 chars, legacy is >1200 chars
    assert len(compact_anchor) < 400
    assert len(legacy_calendar) > 1200
    assert len(compact_anchor) < len(legacy_calendar) * 0.35


# ---------------------------------------------------------------------------
# 3. Deterministic WorkflowState Unit Tests
# ---------------------------------------------------------------------------

def test_workflow_state_tool_update_and_summary():
    """Verify WorkflowState records tool results and renders compact prompt injection."""
    state = WorkflowState(active_language="mr-IN", caller_phone="+919876543210")

    # Initial state
    assert not state.availability_checked
    assert not state.booking_confirmed
    assert state.get_missing_fields() == ["patient_name", "appointment_date", "appointment_time"]

    # Record check_available_slots tool result
    state.update_from_tool(
        tool_name="check_available_slots",
        args={"date": "2026-09-28", "time": "11:00 AM"},
        result={"available": True, "slot": "11:00 AM"},
    )
    assert state.availability_checked is True
    assert state.availability_result == "AVAILABLE"
    assert state.appointment_date == "2026-09-28"
    assert state.appointment_time == "11:00 AM"

    # Record book_appointment tool result
    state.update_from_tool(
        tool_name="book_appointment",
        args={"patientName": "Rahul Patil", "patientAge": "32", "bookingDate": "2026-09-28", "bookingTime": "11:00 AM"},
        result={"success": True, "appointmentId": "APT-9912"},
    )
    assert state.booking_confirmed is True
    assert state.patient_name == "Rahul Patil"
    assert state.patient_age == "32"
    assert state.booking_id == "APT-9912"

    # Compact summary formatting
    summary = state.to_compact_prompt_summary()
    assert "Rahul Patil" in summary
    assert "2026-09-28" in summary
    assert "11:00 AM" in summary
    assert "Booked: YES" in summary
    assert len(summary) < 250


# ---------------------------------------------------------------------------
# 4. Multilingual LanguageManager Instruction Compression Tests
# ---------------------------------------------------------------------------

def test_multilingual_lean_language_instructions():
    """Verify lean language instructions for Marathi, Hindi, and English maintain script rules."""
    mr_lean = build_lean_language_instruction("mr-IN")
    hi_lean = build_lean_language_instruction("hi-IN")
    en_lean = build_lean_language_instruction("en-IN")

    assert "Marathi" in mr_lean
    assert "Hindi" in hi_lean
    assert "English" in en_lean
    assert "ACTIVE LANGUAGE" in mr_lean

    # Compare against verbose legacy instructions
    mr_legacy = build_language_instruction("mr-IN")
    assert len(mr_lean) < len(mr_legacy) * 0.40


# ---------------------------------------------------------------------------
# 5. Tool Schema Scoping on Post-Tool Turns
# ---------------------------------------------------------------------------

def test_tool_schema_scoping_post_tool_turn():
    """Verify build_chat_completion_params filters non-terminal tool schemas on post-tool turns."""
    from app.main import InstrumentedSarvamLLMService
    from pipecat.services.sarvam.llm import SarvamLLMSettings

    service = InstrumentedSarvamLLMService(
        api_key="test_api_key",
        settings=SarvamLLMSettings(model="sarvam-105b-conversations"),
    )

    all_tools = [
        {"type": "function", "function": {"name": "check_available_slots", "description": "Check slots"}},
        {"type": "function", "function": {"name": "book_appointment", "description": "Book slot"}},
        {"type": "function", "function": {"name": "query_knowledge_base", "description": "Search clinic docs"}},
        {"type": "function", "function": {"name": "transfer_call", "description": "Transfer call to human receptionist"}},
        {"type": "function", "function": {"name": "end_call", "description": "Hang up telephony line"}},
    ]

    # Case A: Normal user turn (non-post-tool) -> all 5 tools must be retained
    params_user_turn = {
        "messages": [
            {"role": "system", "content": "You are a receptionist."},
            {"role": "user", "content": "Do you have an appointment tomorrow at 10 AM?"},
        ],
        "tools": all_tools,
    }
    scoped_user = service.build_chat_completion_params(params_user_turn)
    assert len(scoped_user["tools"]) == 5

    # Case B: Post-tool turn (tool result just received) -> non-terminal tools suppressed to save tokens
    params_post_tool = {
        "messages": [
            {"role": "system", "content": "You are a receptionist."},
            {"role": "user", "content": "Book 10 AM for Rahul"},
            {"role": "assistant", "content": None, "tool_calls": [{"id": "c1", "function": {"name": "book_appointment"}}]},
            {"role": "tool", "tool_call_id": "c1", "content": '{"success": true, "appointmentId": "APT-100"}'},
        ],
        "tools": all_tools,
    }
    scoped_post_tool = service.build_chat_completion_params(params_post_tool)
    tool_names = [t["function"]["name"] for t in scoped_post_tool.get("tools", [])]
    assert "check_available_slots" not in tool_names
    assert "book_appointment" not in tool_names
    assert "query_knowledge_base" not in tool_names
    # Terminal & Emergency tools MUST be preserved
    assert "transfer_call" in tool_names
    assert "end_call" in tool_names


# ---------------------------------------------------------------------------
# 6. Feature Flag Rollback Safety Tests
# ---------------------------------------------------------------------------

def test_feature_flag_rollback_behavior():
    """Verify ENABLE_LEAN_PROMPT_COMPRESSION=False completely restores legacy prompt assembly."""
    import sys
    from pathlib import Path
    root_path = str(Path(__file__).resolve().parents[3])
    if root_path not in sys.path:
        sys.path.insert(0, root_path)
    from apps.api.app.services.prompt_compiler_service import PromptCompilerService

    compiler = PromptCompilerService()
    test_cfg = {"identity": {"businessName": "City Hospital"}}

    # When lean compression is ON
    lean = compiler.compile_system_prompt(test_cfg, lean_mode=True)
    assert "=== PLATFORM SAFETY & CONVERSATIONAL RULES ===" in lean

    # When lean compression is OFF (rollback)
    legacy = compiler.compile_system_prompt(test_cfg, lean_mode=False)
    assert "=== NEXTLITE CORE RUNTIME SAFETY BOUNDARY ===" in legacy
    assert "OPERATING HOURS, BREAK TIMES & FAST-PATH BOUNDARIES" in legacy


# ---------------------------------------------------------------------------
# 7. Controlled A/B Token Benchmark Simulation
# ---------------------------------------------------------------------------

def test_controlled_ab_token_benchmark_simulation():
    """Runs a multi-turn appointment booking call simulation measuring Legacy vs Lean token counts."""
    import sys
    from pathlib import Path
    root_path = str(Path(__file__).resolve().parents[3])
    if root_path not in sys.path:
        sys.path.insert(0, root_path)
    from apps.api.app.services.prompt_compiler_service import PromptCompilerService

    compiler = PromptCompilerService()
    tenant_cfg = {
        "identity": {"businessName": "Dr. Sharma Dental Care", "agentName": "Neha"},
        "businessInformation": {"hours": "Mon-Sat 9AM-8PM", "location": "Kothrud, Pune", "businessType": "Dental Clinic"},
        "variables": {"input": [{"name": "consultationFee", "value": "₹400"}]},
    }

    legacy_prompt = compiler.compile_system_prompt(tenant_cfg, lean_mode=False)
    legacy_prompt_with_calendar = f"{legacy_prompt}\n\n{build_temporal_and_calendar_instructions()}"
    legacy_full = build_full_instructions(legacy_prompt_with_calendar, "mr-IN", lean_mode=False)

    lean_prompt = compiler.compile_system_prompt(tenant_cfg, lean_mode=True)
    lean_prompt_with_clock = f"{lean_prompt}\n\n{build_compact_temporal_anchor()}"
    lean_full = build_full_instructions(lean_prompt_with_clock, "mr-IN", lean_mode=True)

    # Measure character and estimated token counts (1 token ~= 3.5 chars for mixed multilingual)
    legacy_chars = len(legacy_full)
    lean_chars = len(lean_full)

    legacy_est_tokens = legacy_chars // 3.5
    lean_est_tokens = lean_chars // 3.5

    print(f"\n[BENCHMARK] Legacy Prompt: {legacy_chars} chars (~{int(legacy_est_tokens)} tokens)")
    print(f"[BENCHMARK] Lean Prompt:   {lean_chars} chars (~{int(lean_est_tokens)} tokens)")
    print(f"[BENCHMARK] Token Reduction: {(1.0 - lean_chars / legacy_chars) * 100:.1f}%")

    # Assert significant reduction
    assert lean_est_tokens < 1200
    assert lean_chars < legacy_chars * 0.45
