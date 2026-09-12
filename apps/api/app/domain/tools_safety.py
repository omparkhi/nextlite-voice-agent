import re
from typing import Optional, Dict, Any

UUID_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

USER_SAFE_DISPLAY_KEYS = (
    "appointmentNumber",
    "displayNumber",
    "referenceNumber",
    "orderNumber",
    "bookingNumber",
    "confirmationNumber",
    "ticketNumber",
    "leadNumber",
)

CANONICAL_PLATFORM_TOOLS = (
    "query_knowledge_base",
    "create_callback_lead",
    "book_appointment",
)

CANONICAL_TOOL_LABEL_MAP = {
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

    # Appointment booking
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

def get_user_safe_display_id(result: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    Extracts customer-safe display/reference identifier (e.g. APT-1002, LEAD-5001),
    strictly suppressing raw internal database UUIDs.
    """
    if not result or not isinstance(result, dict):
        return None

    for key in USER_SAFE_DISPLAY_KEYS:
        val = result.get(key)
        if isinstance(val, str):
            trimmed = val.strip()
            if trimmed and not UUID_REGEX.match(trimmed):
                return trimmed

    return None
