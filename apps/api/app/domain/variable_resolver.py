import re
import json
from typing import Dict, Any, List, Optional, Set, Tuple
from .variable_references import normalize_variable_references, extract_variable_references

# Controlled set of production-useful variable types
VALID_VARIABLE_TYPES = {
    "text", "string", "number", "boolean", "currency",
    "phone", "email", "address", "time", "date", "datetime",
    "list", "json"
}

# Machine-safe variable name pattern: camelCase starting with lowercase letter
VARIABLE_NAME_PATTERN = re.compile(r"^[a-z][a-zA-Z0-9_]*$")

# Generic core variables with neutral, business-agnostic default metadata
CORE_VARIABLES: List[Dict[str, Any]] = [
    {
        "key": "agentName",
        "label": "Agent Name",
        "description": "Name of the voice assistant",
        "type": "text",
        "defaultValue": "AI Assistant",
        "required": True,
        "isCore": True,
    },
    {
        "key": "businessName",
        "label": "Business Name",
        "description": "Name of the business or company",
        "type": "text",
        "defaultValue": "Your Business",
        "required": True,
        "isCore": True,
    },
    {
        "key": "businessType",
        "label": "Business Type",
        "description": "Category or industry of business",
        "type": "text",
        "defaultValue": "Business",
        "required": False,
        "isCore": True,
    },
    {
        "key": "businessAddress",
        "label": "Business Address",
        "description": "Physical location or address of the business",
        "type": "address",
        "defaultValue": "Your business address",
        "required": False,
        "isCore": True,
    },
    {
        "key": "businessHours",
        "label": "Business Hours",
        "description": "Operating hours of the business",
        "type": "text",
        "defaultValue": "Your business hours",
        "required": False,
        "isCore": True,
    },
    {
        "key": "timezone",
        "label": "Timezone",
        "description": "Operational timezone",
        "type": "text",
        "defaultValue": "Asia/Kolkata",
        "required": False,
        "isCore": True,
    },
    {
        "key": "customerCareNumber",
        "label": "Customer Care Number",
        "description": "Support helpline or telephone number",
        "type": "phone",
        "defaultValue": "Your customer care number",
        "required": False,
        "isCore": True,
    },
    {
        "key": "providerContactPhone",
        "label": "Provider Contact Phone",
        "description": "Direct contact phone for the provider or host",
        "type": "phone",
        "defaultValue": "Your provider contact number",
        "required": False,
        "isCore": True,
    },
    {
        "key": "serviceType",
        "label": "Service Type",
        "description": "Primary service offered (e.g. Table Reservation, Appointment, Course Enquiry)",
        "type": "text",
        "defaultValue": "Your service",
        "required": False,
        "isCore": True,
    },
    {
        "key": "serviceProviderName",
        "label": "Service Provider Name",
        "description": "Name of the service provider, doctor, host, instructor, or specialist",
        "type": "text",
        "defaultValue": "Your service provider",
        "required": False,
        "isCore": True,
    },
]

def is_valid_variable_name(name: str) -> bool:
    """
    Validates that a variable name is machine-safe (camelCase starting with lowercase letter).
    Rejects spaces, dashes, dots, numbers as first char, and 'svg...' Sarvam clipboard prefixes.
    """
    if not name or not isinstance(name, str):
        return False
    
    clean = name.strip()
    if not VARIABLE_NAME_PATTERN.match(clean):
        return False
    
    # Reject 'svg...' prefix as canonical variable name (it is a clipboard artifact)
    if clean.startswith("svg") and len(clean) > 3:
        return False
            
    return True

def sanitize_variable_name(name: str) -> str:
    """
    Sanitizes user input into a clean canonical camelCase variable name.
    Strips accidental 'svg' prefix and converts non-alphanumeric chars to camelCase while preserving camelCase casing.
    """
    if not name or not isinstance(name, str):
        return ""
    
    s = name.strip()
    # Strip leading 'svg' if present
    if s.startswith("svg") and len(s) > 3:
        s = s[3:]
        if s:
            s = s[0].lower() + s[1:]
    
    # If delimiters are present, convert to camelCase
    if re.search(r"[\s\-_.]", s):
        words = re.split(r"[\s\-_.]+", s)
        if not words or not words[0]:
            return ""
        camel = words[0].lower() + "".join(w.capitalize() for w in words[1:] if w)
        return re.sub(r"[^a-zA-Z0-9_]", "", camel)
    
    if s:
        return s[0].lower() + s[1:]
    return ""

def validate_variable_value(val: Any, var_type: str) -> bool:
    """
    Validates a variable default value against its declared type.
    """
    if val is None or val == "":
        return True  # Empty/null values are allowed as optional defaults
    
    vtype = (var_type or "text").lower()
    
    if vtype in ["text", "string", "address", "phone", "email", "time", "date", "datetime"]:
        return isinstance(val, str)
    elif vtype in ["number", "currency"]:
        if isinstance(val, (int, float)):
            return True
        try:
            float(str(val).replace(",", "").replace("$", "").replace("₹", "").strip())
            return True
        except (ValueError, TypeError):
            return False
    elif vtype == "boolean":
        if isinstance(val, bool):
            return True
        return str(val).lower() in ["true", "false", "1", "0", "yes", "no"]
    elif vtype == "list":
        return isinstance(val, list) or (isinstance(val, str) and (val.startswith("[") or "," in val))
    elif vtype == "json":
        if isinstance(val, (dict, list)):
            return True
        try:
            json.loads(str(val))
            return True
        except Exception:
            return False
            
    return True

def build_effective_variable_map(
    variables: Optional[List[Dict[str, Any]]] = None,
    runtime_context: Optional[Dict[str, Any]] = None,
    config: Optional[Dict[str, Any]] = None
) -> Dict[str, str]:
    """
    Builds an authoritative map of effective variable names and their current string values.
    Enforces the precedence:
      1. Configuration identity / businessInformation fields (Base)
      2. Agent-specific configured variables (Input Variables)
      3. Trusted runtime / session context (Highest precedence for dynamic values)
    """
    resolution_map: Dict[str, str] = {}

    # Tier 1: Configuration identity / business info
    if config and isinstance(config, dict):
        ident = config.get("identity") or {}
        biz = config.get("businessInformation") or {}

        if ident.get("agentName") or ident.get("displayName") or ident.get("name"):
            resolution_map["agentName"] = str(ident.get("agentName") or ident.get("displayName") or ident.get("name"))
        if ident.get("businessName") or biz.get("businessName"):
            resolution_map["businessName"] = str(ident.get("businessName") or biz.get("businessName"))
        if biz.get("businessType"):
            resolution_map["businessType"] = str(biz.get("businessType"))
        if biz.get("location") or biz.get("address"):
            resolution_map["businessAddress"] = str(biz.get("location") or biz.get("address"))
        if biz.get("hours"):
            resolution_map["businessHours"] = str(biz.get("hours"))
        if biz.get("timezone") or config.get("timezone"):
            resolution_map["timezone"] = str(biz.get("timezone") or config.get("timezone"))
        if biz.get("phone") or biz.get("contactInformation"):
            resolution_map["customerCareNumber"] = str(biz.get("phone") or biz.get("contactInformation"))
        if biz.get("customFacts") and isinstance(biz["customFacts"], dict):
            for k, v in biz["customFacts"].items():
                resolution_map[k] = str(v)

    # Tier 2: Configured Agent Variables (input variables)
    if variables and isinstance(variables, list):
        for var in variables:
            if isinstance(var, dict):
                k = var.get("key") or var.get("name")
                if k:
                    val = var.get("defaultValue") if var.get("defaultValue") is not None else var.get("value")
                    if val is not None and str(val).strip():
                        resolution_map[k] = str(val).strip()

    # Tier 3: Trusted Runtime Context
    if runtime_context and isinstance(runtime_context, dict):
        for k, v in runtime_context.items():
            if v is not None:
                resolution_map[k] = str(v)

    return resolution_map

def resolve_prompt_variables(
    text: str,
    variables: Optional[List[Dict[str, Any]]] = None,
    runtime_context: Optional[Dict[str, Any]] = None,
    config: Optional[Dict[str, Any]] = None
) -> str:
    """
    Resolves variable placeholders {variableName} within prompt/instruction text.
    """
    if not text or not isinstance(text, str):
        return text or ""

    # 1. Normalize copied variable references (e.g. svguserName -> {userName})
    normalized = normalize_variable_references(text)

    # 2. Build resolution map
    resolution_map = build_effective_variable_map(
        variables=variables,
        runtime_context=runtime_context,
        config=config
    )

    # 3. Replace {varName} and {{varName}}
    def replace_placeholder(match: re.Match) -> str:
        var_name = match.group(1)
        if var_name in resolution_map:
            return resolution_map[var_name]
        # If not in map, preserve placeholder for future runtime resolution or detection
        return match.group(0)

    # Matches {varName} or {{varName}}
    resolved = re.sub(r"\{+([a-zA-Z0-9_]+)\}+", replace_placeholder, normalized)
    return resolved

def validate_instruction_variable_references(
    instructions: str,
    variables: Optional[List[Dict[str, Any]]] = None,
    config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Validates variable references inside instructions.
    Identifies:
      - referenced_variables: list of all referenced variables
      - available_variables: set of all configured + core + config variables
      - unknown_variables: references not found in any variable source
      - missing_required: required variables without a configured value
    """
    referenced = extract_variable_references(instructions or "")
    
    available_keys: Set[str] = set()
    for core in CORE_VARIABLES:
        available_keys.add(core["key"])
        
    if config and isinstance(config, dict):
        ident = config.get("identity") or {}
        biz = config.get("businessInformation") or {}
        if ident.get("agentName"): available_keys.add("agentName")
        if ident.get("businessName") or biz.get("businessName"): available_keys.add("businessName")
        if biz.get("businessType"): available_keys.add("businessType")
        if biz.get("location"): available_keys.add("businessAddress")
        if biz.get("hours"): available_keys.add("businessHours")
        if biz.get("customFacts") and isinstance(biz["customFacts"], dict):
            available_keys.update(biz["customFacts"].keys())
            
    configured_values: Dict[str, Any] = {}
    if variables and isinstance(variables, list):
        for v in variables:
            if isinstance(v, dict):
                k = v.get("key") or v.get("name")
                if k:
                    available_keys.add(k)
                    val = v.get("defaultValue") if v.get("defaultValue") is not None else v.get("value")
                    if val is not None and str(val).strip():
                        configured_values[k] = val

    unknown_vars = [r for r in referenced if r not in available_keys]
    
    # Check required variables
    missing_required = []
    if variables and isinstance(variables, list):
        for v in variables:
            if isinstance(v, dict) and v.get("required"):
                k = v.get("key") or v.get("name")
                if k and (k not in configured_values or str(configured_values[k]).strip() == ""):
                    missing_required.append(k)
                    
    return {
        "referenced_variables": referenced,
        "available_variables": list(available_keys),
        "unknown_variables": unknown_vars,
        "missing_required": missing_required,
        "is_valid": len(unknown_vars) == 0 and len(missing_required) == 0
    }
