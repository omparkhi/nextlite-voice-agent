"""NextLite Voice V3 — Canonical Tool Registry Domain Module.

Establishes the single source of truth for platform tools:
- Stable machine identities (e.g. `book_appointment`, `create_callback_lead`, `query_knowledge_base`)
- Distinct human-facing display names and LLM descriptions
- JSON Input schemas with type definitions and required fields
- Structured Output schemas
- Input validation and safety checks against untrusted LLM arguments
- Dynamic agent tool filtering for RuntimeAgentConfig
"""

import re
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Tuple
from ..schemas import RuntimeToolDefinition

CANONICAL_PLATFORM_TOOLS = (
    "query_knowledge_base",
    "create_callback_lead",
    "book_appointment",
    "check_available_slots",
    "reschedule_appointment",
    "end_call",
    "transfer_call",
)

CANONICAL_TOOL_LABEL_MAP: Dict[str, str] = {
    # Knowledge retrieval
    "query_knowledge_base": "query_knowledge_base",
    "query knowledge base": "query_knowledge_base",
    "query_knowledge_base_tool": "query_knowledge_base",
    "knowledge base": "query_knowledge_base",
    "knowledge_base": "query_knowledge_base",
    "knowledge search": "query_knowledge_base",
    "search knowledge base": "query_knowledge_base",
    # Lead capture
    "create_callback_lead": "create_callback_lead",
    "create callback lead": "create_callback_lead",
    "callback lead": "create_callback_lead",
    "callback_lead": "create_callback_lead",
    "record callback lead": "create_callback_lead",
    "lead capture": "create_callback_lead",
    "lead_capture": "create_callback_lead",
    # Booking / Appointment
    "book_appointment": "book_appointment",
    "book appointment": "book_appointment",
    "book doctor appointment": "book_appointment",
    "book demo class": "book_appointment",
    "book service slot": "book_appointment",
    "book site visit": "book_appointment",
    "book advisor call": "book_appointment",
    "schedule appointment": "book_appointment",
    "schedule_appointment": "book_appointment",
    "appointment booking": "book_appointment",
    "booking": "book_appointment",
    "reservation": "book_appointment",
    # Slot Availability Checking
    "check_available_slots": "check_available_slots",
    "check available slots": "check_available_slots",
    "check_slots": "check_available_slots",
    "check slots": "check_available_slots",
    "slot availability": "check_available_slots",
    "check slot availability": "check_available_slots",
    "check availability": "check_available_slots",
    # Reschedule Appointment
    "reschedule_appointment": "reschedule_appointment",
    "reschedule appointment": "reschedule_appointment",
    "reschedule": "reschedule_appointment",
    "reschedule booking": "reschedule_appointment",
    # Call Termination
    "end_call": "end_call",
    "end call": "end_call",
    "hangup": "end_call",
    "hang_up": "end_call",
    "hang up": "end_call",
    "terminate_call": "end_call",
    "disconnect_call": "end_call",
    "disconnect": "end_call",
    # Call Transfer & Emergency Escalation
    "transfer_call": "transfer_call",
    "transfer call": "transfer_call",
    "transfer_emergency_call": "transfer_call",
    "transfer emergency call": "transfer_call",
    "emergency_transfer": "transfer_call",
    "emergency transfer": "transfer_call",
    "emergency_escalation": "transfer_call",
    "emergency escalation": "transfer_call",
    "transfer_to_doctor": "transfer_call",
    "transfer to doctor": "transfer_call",
    "escalate_call": "transfer_call",
    "escalate call": "transfer_call",
    "transfer": "transfer_call",
}

PROTECTED_CONTEXT_KEYS = {
    "tenantId",
    "tenant_id",
    "agentId",
    "agent_id",
    "deploymentId",
    "deployment_id",
    "callSessionId",
    "call_session_id",
    "authorization",
    "callerPhone",
    "caller_phone",
}


@dataclass
class ToolDefinition:
    id: str
    name: str
    display_name: str
    description: str
    category: str
    parameters: Dict[str, Any]
    output_schema: Dict[str, Any]
    is_platform_default: bool = True
    confirmation_supported: bool = False

    def to_runtime_tool_definition(
        self,
        enabled: bool = True,
        confirmation_required: bool = False,
        direct_response_enabled: bool = False,
    ) -> RuntimeToolDefinition:
        return RuntimeToolDefinition(
            tool_id=self.id,
            name=self.name,
            description=self.description,
            parameters=self.parameters,
            enabled=enabled,
            confirmation_required=confirmation_required,
            direct_response_enabled=direct_response_enabled,
        )

    def to_catalog_dict(self) -> Dict[str, Any]:
        params_list = []
        props = self.parameters.get("properties", {})
        req_list = self.parameters.get("required", [])
        for p_name, p_spec in props.items():
            params_list.append({
                "name": p_name,
                "type": p_spec.get("type", "string"),
                "description": p_spec.get("description", ""),
                "required": p_name in req_list,
            })

        return {
            "id": self.id,
            "toolId": self.id,
            "name": self.name,
            "displayName": self.display_name,
            "description": self.description,
            "category": self.category,
            "parameters": params_list,
            "confirmationSupported": self.confirmation_supported,
            "isPlatformDefault": self.is_platform_default,
        }


# Authoritative Platform Tool Definitions
CANONICAL_TOOL_REGISTRY: Dict[str, ToolDefinition] = {
    "query_knowledge_base": ToolDefinition(
        id="query_knowledge_base",
        name="query_knowledge_base",
        display_name="Knowledge Retrieval",
        description="Query the business knowledge base to retrieve authoritative facts, pricing, policies, and business details.",
        category="Knowledge",
        parameters={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Semantic query to search business knowledge base"
                }
            },
            "required": ["query"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "results": {"type": "array"},
                "message": {"type": "string"}
            },
            "required": ["success"]
        },
        is_platform_default=True,
        confirmation_supported=False
    ),
    "book_appointment": ToolDefinition(
        id="book_appointment",
        name="book_appointment",
        display_name="Appointment Booking",
        description="Submit a booking or appointment request with customer details (Full Name, Age), date, time, and service type. Never claim success unless the tool returns a successful result.",
        category="Scheduling",
        parameters={
            "type": "object",
            "properties": {
                "customerName": {"type": "string", "description": "Customer full name"},
                "bookingDate": {"type": "string", "description": "Date of appointment (YYYY-MM-DD or relative like tomorrow)"},
                "bookingTime": {"type": "string", "description": "Time of appointment (e.g. 10:00 AM, 3:00 PM)"},
                "title": {"type": "string", "description": "Reason for visit or service type"},
                "age": {"type": "string", "description": "Age of the person (e.g. '22')"}
                # "place": {"type": "string", "description": "Place, city, or location (e.g. 'Nagpur')"}
            },
            "required": ["customerName", "bookingDate", "bookingTime"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "appointmentNumber": {"type": "string"},
                "status": {"type": "string"},
                "serviceType": {"type": "string"},
                "appointmentDate": {"type": "string"},
                "appointmentTime": {"type": "string"}
            },
            "required": ["success"]
        },
        is_platform_default=True,
        confirmation_supported=True
    ),
    "create_callback_lead": ToolDefinition(
        id="create_callback_lead",
        name="create_callback_lead",
        display_name="Lead Capture & Callback",
        description="Capture customer contact details and follow-up inquiry or requirement.",
        category="CRM",
        parameters={
            "type": "object",
            "properties": {
                "customerName": {"type": "string", "description": "Customer name"},
                "customerPhone": {"type": "string", "description": "Contact phone number"},
                "customerEmail": {"type": "string", "description": "Customer email address"},
                "requirement": {"type": "string", "description": "Customer inquiry, question, or requirement"},
                "priority": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "URGENT"], "description": "Priority level"}
            },
            "required": ["customerName", "customerPhone"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "leadNumber": {"type": "string"},
                "status": {"type": "string"},
                "customerName": {"type": "string"}
            },
            "required": ["success"]
        },
        is_platform_default=True,
        confirmation_supported=False
    ),
    "check_available_slots": ToolDefinition(
        id="check_available_slots",
        name="check_available_slots",
        display_name="Check Slot Availability",
        description="Check available appointment slots for a given date and time. Also checks if the caller already has an existing booked appointment.",
        category="Scheduling",
        parameters={
            "type": "object",
            "properties": {
                "bookingDate": {
                    "type": "string",
                    "description": "Date to check (YYYY-MM-DD or relative like 'today', 'tomorrow', 'next Monday')"
                },
                "bookingTime": {
                    "type": "string",
                    "description": "Optional preferred time or session e.g. '10:00 AM', 'morning', 'afternoon'"
                }
            },
            "required": ["bookingDate"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "slotAvailable": {"type": "boolean"},
                "availableSlots": {"type": "array"},
                "hasExistingBooking": {"type": "boolean"},
                "existingBooking": {"type": "object"},
                "message": {"type": "string"}
            },
            "required": ["slotAvailable"]
        },
        is_platform_default=True,
        confirmation_supported=False
    ),
    "reschedule_appointment": ToolDefinition(
        id="reschedule_appointment",
        name="reschedule_appointment",
        display_name="Reschedule Appointment",
        description="Reschedule an existing patient appointment to a new date and time.",
        category="Scheduling",
        parameters={
            "type": "object",
            "properties": {
                "appointmentId": {
                    "type": "string",
                    "description": "Appointment ID or number if known (optional if caller phone is recognized)"
                },
                "newDate": {
                    "type": "string",
                    "description": "New date for appointment (YYYY-MM-DD or relative like 'tomorrow')"
                },
                "newTime": {
                    "type": "string",
                    "description": "New time for appointment (e.g. '11:00 AM')"
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for rescheduling"
                }
            },
            "required": ["newDate", "newTime"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "appointmentNumber": {"type": "string"},
                "newDate": {"type": "string"},
                "newTime": {"type": "string"},
                "message": {"type": "string"}
            },
            "required": ["success"]
        },
        is_platform_default=True,
        confirmation_supported=True
    ),
    "end_call": ToolDefinition(
        id="end_call",
        name="end_call",
        display_name="End Call",
        description="Politely terminate and disconnect the PSTN phone call when the conversation is finished, the caller says goodbye, thanks you, or states they will call later. You MUST invoke this tool whenever delivering your final closing farewell to hang up the phone call.",
        category="Telephony",
        parameters={
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Optional reason for concluding the call (e.g. 'objective_completed', 'caller_said_bye', 'appointment_booked')"
                }
            },
            "required": []
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "action": {"type": "string"},
                "message": {"type": "string"}
            },
            "required": ["success"]
        },
        is_platform_default=True,
        confirmation_supported=False
    ),
    "transfer_call": ToolDefinition(
        id="transfer_call",
        name="transfer_call",
        display_name="Live Call Transfer / Emergency Escalation",
        description="Transfer the ongoing phone call directly to the doctor or emergency staff when a true medical/dental emergency is verified (such as active severe bleeding, accidental trauma/fracture, or unbearable acute distress). Always speak a calming reassuring phrase in the caller's active language before invoking this tool.",
        category="Telephony",
        parameters={
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Specific clinical reason or symptom justifying emergency transfer (e.g. 'Severe continuous bleeding', 'Facial trauma', 'Unbearable pain')"
                },
                "patientName": {
                    "type": "string",
                    "description": "Optional patient name"
                },
                "severity": {
                    "type": "string",
                    "enum": ["CRITICAL", "EMERGENCY", "URGENT"],
                    "description": "Severity level of the emergency"
                },
                "notes": {
                    "type": "string",
                    "description": "Optional brief clinical observations"
                }
            },
            "required": ["reason"]
        },
        output_schema={
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "action": {"type": "string"},
                "targetPhone": {"type": "string"},
                "message": {"type": "string"}
            },
            "required": ["success"]
        },
        is_platform_default=True,
        confirmation_supported=False
    ),
}


def normalize_tool_id(tool_id_or_name: Optional[str]) -> Optional[str]:
    """Normalizes tool names/aliases to canonical platform tool identifiers."""
    if not tool_id_or_name or not isinstance(tool_id_or_name, str):
        return None
    trimmed = tool_id_or_name.strip()
    if not trimmed:
        return None

    if trimmed in CANONICAL_PLATFORM_TOOLS:
        return trimmed

    lower = trimmed.lower()
    if lower in CANONICAL_TOOL_LABEL_MAP:
        return CANONICAL_TOOL_LABEL_MAP[lower]

    snake = re.sub(r"[^a-z0-9_]+", "_", lower).strip("_")
    if snake in CANONICAL_TOOL_LABEL_MAP:
        return CANONICAL_TOOL_LABEL_MAP[snake]

    spaces = re.sub(r"[_\s]+", " ", lower).strip()
    if spaces in CANONICAL_TOOL_LABEL_MAP:
        return CANONICAL_TOOL_LABEL_MAP[spaces]

    if re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", trimmed):
        return trimmed

    return None


def get_canonical_tool(tool_id_or_name: str) -> Optional[ToolDefinition]:
    """Retrieves canonical ToolDefinition by id or normalized name."""
    norm_id = normalize_tool_id(tool_id_or_name)
    if norm_id and norm_id in CANONICAL_TOOL_REGISTRY:
        return CANONICAL_TOOL_REGISTRY[norm_id]
    return None


def list_canonical_tools() -> List[Dict[str, Any]]:
    """Returns list of all canonical tools in catalog format."""
    return [t.to_catalog_dict() for t in CANONICAL_TOOL_REGISTRY.values()]


def sanitize_tool_arguments(arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Strips out protected context keys that an LLM might attempt to supply,
    guaranteeing that tenantId/agentId/callSessionId are never overridden by the LLM.
    """
    if not isinstance(arguments, dict):
        return {}
    return {k: v for k, v in arguments.items() if k not in PROTECTED_CONTEXT_KEYS}


def validate_tool_arguments(tool_id: str, arguments: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validates tool arguments against the tool's input schema.
    Returns (is_valid, error_message).
    """
    tool_def = get_canonical_tool(tool_id)
    if not tool_def:
        return False, f"Unknown tool: '{tool_id}'"

    if not isinstance(arguments, dict):
        return False, f"Tool arguments must be a dictionary, got {type(arguments).__name__}"

    props = tool_def.parameters.get("properties", {})
    required_fields = tool_def.parameters.get("required", [])

    # Check required fields
    for req in required_fields:
        if req not in arguments:
            # Check for common parameter aliases
            alias_match = False
            if req == "customerName" and ("name" in arguments or "customer_name" in arguments):
                alias_match = True
            elif req == "customerPhone" and ("phone" in arguments or "customer_phone" in arguments):
                alias_match = True
            elif req == "title" and ("serviceType" in arguments or "service" in arguments or "purpose" in arguments):
                alias_match = True
            elif req == "bookingDate" and ("appointmentDate" in arguments or "date" in arguments):
                alias_match = True
            elif req == "bookingTime" and ("appointmentTime" in arguments or "time" in arguments):
                alias_match = True
            elif req == "newDate" and ("date" in arguments or "rescheduleDate" in arguments or "new_date" in arguments):
                alias_match = True
            elif req == "newTime" and ("time" in arguments or "rescheduleTime" in arguments or "new_time" in arguments):
                alias_match = True

            if not alias_match:
                return False, f"Missing required parameter '{req}' for tool '{tool_id}'"

        # Check non-empty string for present required fields
        val = arguments.get(req)
        if val is not None and isinstance(val, str) and len(val.strip()) == 0:
            return False, f"Required parameter '{req}' cannot be empty for tool '{tool_id}'"

    # Validate types of present properties
    for field_name, value in arguments.items():
        if field_name in props and value is not None:
            expected_type = props[field_name].get("type")
            if expected_type == "string" and not isinstance(value, str):
                return False, f"Invalid type for '{field_name}': expected string, got {type(value).__name__}"
            elif expected_type == "integer" and not isinstance(value, int):
                return False, f"Invalid type for '{field_name}': expected integer, got {type(value).__name__}"
            elif expected_type == "number" and not isinstance(value, (int, float)):
                return False, f"Invalid type for '{field_name}': expected number, got {type(value).__name__}"
            elif expected_type == "boolean" and not isinstance(value, bool):
                return False, f"Invalid type for '{field_name}': expected boolean, got {type(value).__name__}"
            elif expected_type == "array" and not isinstance(value, list):
                return False, f"Invalid type for '{field_name}': expected array, got {type(value).__name__}"

            # Enum validation
            enum_vals = props[field_name].get("enum")
            if enum_vals and isinstance(value, str) and value.upper() not in [e.upper() for e in enum_vals]:
                return False, f"Invalid value '{value}' for '{field_name}'. Allowed: {enum_vals}"

    return True, None


def filter_agent_runtime_tools(tools_cfg: Optional[Dict[str, Any]]) -> List[RuntimeToolDefinition]:
    """
    Resolves the exact list of tools to expose to runtime/LLM based on agent configuration.
    
    Rules:
    1. If tools_cfg is None -> return []
    2. If tools_cfg.enabled is False -> return [] (Master switch disabled)
    3. If bindings/tools list is specified:
       - Only include bindings where enabled is True
       - Match with Canonical Registry or custom definition
       - Deduplicate by tool identifier
    4. If bindings is empty list [] and master switch was explicitly set, return []
    5. If bindings is not specified (legacy default), return all canonical platform tools.
    """
    if not tools_cfg or not isinstance(tools_cfg, dict):
        return []

    is_master_enabled = tools_cfg.get("enabled", True)
    if not is_master_enabled:
        return []

    raw_tools = tools_cfg.get("bindings") or tools_cfg.get("tools")
    resolved_tools: List[RuntimeToolDefinition] = []
    seen_ids = set()

    if raw_tools is not None:
        if isinstance(raw_tools, list):
            for t in raw_tools:
                if not isinstance(t, dict):
                    continue
                t_id = t.get("toolId") or t.get("tool_id") or t.get("name")
                if not t_id:
                    continue

                # Check individual tool enabled flag
                is_tool_enabled = t.get("enabled", True)
                if not is_tool_enabled:
                    continue

                canonical = get_canonical_tool(t_id)
                if canonical:
                    if canonical.id not in seen_ids:
                        confirmation_req = t.get("confirmationRequired", False)
                        # Appointment REQUESTED results are backend-authored
                        # and use an approved localized template in the worker.
                        # Default this safe action to the direct path; an admin
                        # can explicitly opt out with false.
                        direct_response_enabled = t.get(
                            "directResponseEnabled",
                            canonical.id == "book_appointment",
                        )
                        resolved_tools.append(
                            canonical.to_runtime_tool_definition(
                                enabled=True,
                                confirmation_required=confirmation_req,
                                direct_response_enabled=direct_response_enabled,
                            )
                        )
                        seen_ids.add(canonical.id)
                else:
                    norm_id = normalize_tool_id(t_id) or t_id
                    if norm_id not in seen_ids:
                        resolved_tools.append(
                            RuntimeToolDefinition(
                                tool_id=norm_id,
                                name=t.get("name", norm_id),
                                description=t.get("description", "Custom business tool"),
                                parameters=t.get("parameters"),
                                enabled=True,
                                confirmation_required=t.get("confirmationRequired", False),
                                direct_response_enabled=t.get("directResponseEnabled", False),
                            )
                        )
                        seen_ids.add(norm_id)

        # Telephony platform fallback: end_call platform tool is included if tools are enabled and not explicitly disabled
        if "end_call" not in seen_ids:
            is_end_call_disabled = any(
                isinstance(t, dict)
                and (normalize_tool_id(t.get("toolId") or t.get("tool_id") or t.get("name")) == "end_call")
                and not t.get("enabled", True)
                for t in raw_tools
            )
            if not is_end_call_disabled:
                end_call_canonical = get_canonical_tool("end_call")
                if end_call_canonical:
                    resolved_tools.append(
                        end_call_canonical.to_runtime_tool_definition(enabled=True)
                    )
                    seen_ids.add("end_call")

        return resolved_tools

    # Legacy default fallback when bindings field is absent
    for tool_def in CANONICAL_TOOL_REGISTRY.values():
        resolved_tools.append(
            tool_def.to_runtime_tool_definition(
                enabled=True,
                direct_response_enabled=tool_def.id == "book_appointment",
            )
        )

    return resolved_tools
