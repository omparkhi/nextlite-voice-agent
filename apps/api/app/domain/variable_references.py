import re
from typing import List, Set

# Regex patterns for Sarvam copied variable artifacts
# Case 1: Braced format: {{svgVariableName}} or {svgVariableName}
BRACED_DOUBLE_SVG_PATTERN = re.compile(r"\{\{svg([A-Za-z0-9_]+)\}\}")
BRACED_SINGLE_SVG_PATTERN = re.compile(r"\{svg([A-Za-z0-9_]+)\}")

# Case 2: Unbraced camelCase / PascalCase identifier with svg prefix
# e.g. svgserviceProviderName, svguserName, svgbusinessName, svgserviceType, svgcustomerCareNumber
# Note: Negative lookahead ensures we don't match plain words like "svg_image" or "svg2png" unless intended
UNBRACED_SVG_CAMELCASE_PATTERN = re.compile(r"\bsvg([A-Z][a-zA-Z0-9_]*|[a-z]+[A-Z][a-zA-Z0-9_]*)\b")

# Known common variable names in voice agent platforms
KNOWN_COMMON_VARIABLES = {
    "serviceprovidername": "serviceProviderName",
    "username": "userName",
    "businessname": "businessName",
    "servicetype": "serviceType",
    "customercarenumber": "customerCareNumber",
    "location": "location",
    "appointmentdate": "appointmentDate",
    "bookingtime": "bookingTime",
    "doctorname": "doctorName",
    "clinicname": "clinicName",
    "patientname": "patientName",
    "callername": "callerName",
    "phone": "phone",
    "email": "email",
}

def normalize_variable_references(text: str) -> str:
    """
    Normalizes copied variable references and removes Sarvam 'svg' chip copy artifacts.
    Transforms:
      - '{{svguserName}}' -> '{{userName}}'
      - '{svgserviceProviderName}' -> '{serviceProviderName}'
      - 'svgserviceProviderName' -> '{serviceProviderName}'
      - 'svguserName' -> '{userName}'
    Preserves all standard variable references (e.g. '{userName}', '{{businessName}}').
    """
    if not text or not isinstance(text, str):
        return text or ""

    # 1. Replace {{svgVariableName}} -> {{variableName}}
    result = BRACED_DOUBLE_SVG_PATTERN.sub(r"{{\1}}", text)

    # 2. Replace {svgVariableName} -> {variableName}
    result = BRACED_SINGLE_SVG_PATTERN.sub(r"{\1}", result)

    # 3. Replace unbraced svg<camelCaseVar> -> {<camelCaseVar>}
    def replace_unbraced(match: re.Match) -> str:
        var_name = match.group(1)
        # Check if matched identifier is a known variable or camelCase
        return f"{{{var_name}}}"

    result = UNBRACED_SVG_CAMELCASE_PATTERN.sub(replace_unbraced, result)

    return result

def extract_variable_references(text: str) -> List[str]:
    """
    Extracts canonical variable names referenced within a prompt or instruction text.
    Correctly recognizes both standard ({varName}, {{varName}}) and Sarvam-copied (svgvarName) references.
    Returns a list of unique canonical variable names in order of appearance.
    """
    if not text or not isinstance(text, str):
        return []

    # Normalize first to canonical {varName} / {{varName}} representation
    normalized = normalize_variable_references(text)

    # Extract all {varName} and {{varName}}
    raw_matches = re.findall(r"\{+([A-Za-z0-9_]+)\}+", normalized)

    seen: Set[str] = set()
    canonical_vars: List[str] = []

    for v in raw_matches:
        # Strip any accidental leading 'svg' if still present
        canonical = v
        if canonical.startswith("svg") and len(canonical) > 3:
            remainder = canonical[3:]
            if remainder[0].isupper() or remainder.lower() in KNOWN_COMMON_VARIABLES:
                canonical = remainder[0].lower() + remainder[1:] if remainder[0].isupper() else remainder
        
        if canonical not in seen:
            seen.add(canonical)
            canonical_vars.append(canonical)

    return canonical_vars
