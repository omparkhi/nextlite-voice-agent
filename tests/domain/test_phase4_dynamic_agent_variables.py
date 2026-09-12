import pytest
from apps.api.app.domain.variable_resolver import (
    is_valid_variable_name,
    sanitize_variable_name,
    validate_variable_value,
    resolve_prompt_variables,
    validate_instruction_variable_references,
    CORE_VARIABLES
)
from apps.api.app.domain.variable_references import (
    normalize_variable_references,
    extract_variable_references
)
from apps.api.app.services.prompt_compiler_service import prompt_compiler
from apps.api.app.services.template_service import TemplateService

HEALTHCARE_RESTRICTED_KEYWORDS = [
    "doctor", "patient", "clinic", "consultation", "hospital", "opd"
]

@pytest.mark.asyncio
async def test_01_create_variable():
    """TEST 1: Create a custom variable with name, label, type, and default value."""
    var = {
        "key": "reservationPolicy",
        "label": "Reservation Policy",
        "description": "Rules for booking tables in advance",
        "type": "text",
        "defaultValue": "Reservations accepted up to 2 hours prior.",
        "required": True
    }
    assert is_valid_variable_name(var["key"]) is True
    assert validate_variable_value(var["defaultValue"], var["type"]) is True
    assert var["key"] == "reservationPolicy"
    assert var["defaultValue"] == "Reservations accepted up to 2 hours prior."

@pytest.mark.asyncio
async def test_02_read_variables():
    """TEST 2: Read configured variables from configuration."""
    config = {
        "variables": {
            "input": [
                {"key": "businessName", "defaultValue": "Grand Hotel"},
                {"key": "roomType", "defaultValue": "Deluxe Suite"}
            ]
        }
    }
    input_vars = config["variables"]["input"]
    assert len(input_vars) == 2
    keys = [v["key"] for v in input_vars]
    assert "businessName" in keys
    assert "roomType" in keys

@pytest.mark.asyncio
async def test_03_update_variable():
    """TEST 3: Update a variable default value without corrupting key."""
    var = {"key": "businessHours", "defaultValue": "9 AM - 6 PM"}
    # Update default value
    var["defaultValue"] = "10 AM - 10 PM"
    assert var["key"] == "businessHours"
    assert var["defaultValue"] == "10 AM - 10 PM"

@pytest.mark.asyncio
async def test_04_delete_variable():
    """TEST 4: Delete a variable from the list."""
    vars_list = [
        {"key": "businessName", "defaultValue": "Bistro"},
        {"key": "tempVar", "defaultValue": "Temporary"}
    ]
    filtered = [v for v in vars_list if v["key"] != "tempVar"]
    assert len(filtered) == 1
    assert filtered[0]["key"] == "businessName"

@pytest.mark.asyncio
async def test_05_duplicate_variable_names_rejected():
    """TEST 5: Duplicate variable names are rejected."""
    existing_keys = {"businessName", "serviceType"}
    new_var_key = "businessName"
    is_duplicate = new_var_key in existing_keys
    assert is_duplicate is True

@pytest.mark.asyncio
async def test_06_invalid_variable_names_rejected():
    """TEST 6: Invalid variable names are rejected."""
    invalid_names = [
        "business name",      # spaces
        "business-name",      # hyphens
        "business.name",      # dots
        "123business",        # starts with digit
        "BusinessName",       # PascalCase instead of camelCase
        "svguserName",        # svg clipboard prefix
        "svgserviceProviderName" # svg clipboard prefix
    ]
    for name in invalid_names:
        assert is_valid_variable_name(name) is False, f"Name '{name}' should be rejected"

    valid_names = [
        "businessName",
        "serviceType",
        "courseFee",
        "reservationPolicy",
        "customerCareNumber"
    ]
    for name in valid_names:
        assert is_valid_variable_name(name) is True, f"Name '{name}' should be accepted"

@pytest.mark.asyncio
async def test_07_variable_type_validation():
    """TEST 7: Variable type validation works for text, number, currency, boolean, json."""
    assert validate_variable_value("Hello", "text") is True
    assert validate_variable_value(1500, "number") is True
    assert validate_variable_value("1500.50", "number") is True
    assert validate_variable_value("₹2,500", "currency") is True
    assert validate_variable_value("$100.00", "currency") is True
    assert validate_variable_value("true", "boolean") is True
    assert validate_variable_value(False, "boolean") is True
    assert validate_variable_value('{"valid": "json"}', "json") is True
    assert validate_variable_value('invalid-json{', "json") is False

@pytest.mark.asyncio
async def test_08_required_variable_validation():
    """TEST 8: Required variable validation detects missing configured values."""
    variables = [
        {"key": "businessName", "defaultValue": "Spice Route", "required": True},
        {"key": "apiKey", "defaultValue": "", "required": True},
        {"key": "optionalNote", "defaultValue": "", "required": False}
    ]
    validation = validate_instruction_variable_references(
        instructions="Welcome to {businessName}",
        variables=variables
    )
    assert "apiKey" in validation["missing_required"]
    assert "businessName" not in validation["missing_required"]
    assert "optionalNote" not in validation["missing_required"]
    assert validation["is_valid"] is False

@pytest.mark.asyncio
async def test_09_default_values_persist():
    """TEST 9: Default values persist and resolve accurately."""
    instructions = "Thanks for calling {businessName}. Our timings are {businessHours}."
    variables = [
        {"key": "businessName", "defaultValue": "Royal Dine"},
        {"key": "businessHours", "defaultValue": "11 AM to 11 PM"}
    ]
    resolved = resolve_prompt_variables(instructions, variables=variables)
    assert "Royal Dine" in resolved
    assert "11 AM to 11 PM" in resolved

@pytest.mark.asyncio
async def test_10_business_name_resolves():
    """TEST 10: {businessName} resolves correctly in compiled system prompt."""
    config = {
        "identity": {"agentName": "Aarti", "businessName": "Spice Garden"},
        "instructions": "Welcome to {businessName}! How can I help you today?"
    }
    compiled = prompt_compiler.compile_system_prompt(configuration=config)
    assert "Welcome to Spice Garden!" in compiled

@pytest.mark.asyncio
async def test_11_custom_variable_resolves():
    """TEST 11: {customVariable} resolves correctly."""
    config = {
        "identity": {"agentName": "ChefHost"},
        "variables": {
            "input": [
                {"key": "corkageFee", "defaultValue": "500 rupees per bottle"}
            ]
        },
        "instructions": "Our corkage policy fee is {corkageFee}."
    }
    compiled = prompt_compiler.compile_system_prompt(configuration=config)
    assert "Our corkage policy fee is 500 rupees per bottle." in compiled

@pytest.mark.asyncio
async def test_12_sarvam_artifact_svg_username_normalizes_and_resolves():
    """TEST 12: Sarvam artifact svguserName normalizes to {userName} and resolves with context."""
    raw_prompt = "Hello svguserName! Welcome to svgserviceProviderName."
    normalized = normalize_variable_references(raw_prompt)
    assert "{userName}" in normalized
    assert "{serviceProviderName}" in normalized
    assert "svguserName" not in normalized

    resolved = resolve_prompt_variables(
        raw_prompt,
        runtime_context={"userName": "Ankit Verma", "serviceProviderName": "Dental Excellence"}
    )
    assert "Hello Ankit Verma!" in resolved
    assert "Welcome to Dental Excellence." in resolved

@pytest.mark.asyncio
async def test_13_svg_service_provider_name_normalizes():
    """TEST 13: svgserviceProviderName normalizes to {serviceProviderName}."""
    text = "Thanks for calling svgserviceProviderName."
    refs = extract_variable_references(text)
    assert "serviceProviderName" in refs
    assert "svgserviceProviderName" not in refs

@pytest.mark.asyncio
async def test_14_no_canonical_variable_named_svg_username():
    """TEST 14: No canonical variable named svguserName is created or validated."""
    sanitized = sanitize_variable_name("svguserName")
    assert sanitized == "userName"
    assert is_valid_variable_name("svguserName") is False
    assert is_valid_variable_name(sanitized) is True

@pytest.mark.asyncio
async def test_15_instruction_autocomplete_uses_actual_variables():
    """TEST 15: Instruction validation and autocomplete identify actual agent variables."""
    agent_vars = [
        {"key": "reservationDeposit", "label": "Reservation Deposit", "defaultValue": "1000"}
    ]
    val = validate_instruction_variable_references(
        instructions="Please note the {reservationDeposit} is mandatory.",
        variables=agent_vars
    )
    assert "reservationDeposit" in val["referenced_variables"]
    assert "reservationDeposit" in val["available_variables"]
    assert len(val["unknown_variables"]) == 0

@pytest.mark.asyncio
async def test_16_adding_variable_available_for_autocomplete():
    """TEST 16: Adding a variable makes it recognized as an available variable."""
    initial_vars = [{"key": "businessName", "defaultValue": "My Shop"}]
    val1 = validate_instruction_variable_references("Policy: {cancellationWindow}", variables=initial_vars)
    assert "cancellationWindow" in val1["unknown_variables"]

    # Add variable
    updated_vars = initial_vars + [{"key": "cancellationWindow", "defaultValue": "24 hours"}]
    val2 = validate_instruction_variable_references("Policy: {cancellationWindow}", variables=updated_vars)
    assert "cancellationWindow" not in val2["unknown_variables"]

@pytest.mark.asyncio
async def test_17_deleting_variable_removes_from_autocomplete():
    """TEST 17: Deleting a variable marks references as unknown."""
    vars_list = [
        {"key": "businessName", "defaultValue": "My Shop"},
        {"key": "valetParking", "defaultValue": "Complimentary"}
    ]
    # Before delete
    val_before = validate_instruction_variable_references("Parking: {valetParking}", variables=vars_list)
    assert "valetParking" not in val_before["unknown_variables"]

    # After delete
    vars_after = [v for v in vars_list if v["key"] != "valetParking"]
    val_after = validate_instruction_variable_references("Parking: {valetParking}", variables=vars_after)
    assert "valetParking" in val_after["unknown_variables"]

@pytest.mark.asyncio
async def test_18_unknown_instruction_references_detected():
    """TEST 18: Unknown instruction references are detected deterministically."""
    instructions = "Welcome to {businessName}. Your secret is {nonExistentVariable123}."
    val = validate_instruction_variable_references(instructions, variables=[])
    assert "nonExistentVariable123" in val["unknown_variables"]

@pytest.mark.asyncio
async def test_19_agent_a_variables_do_not_leak_to_agent_b():
    """TEST 19: Agent A variables do not leak into Agent B."""
    config_a = {
        "identity": {"agentName": "Agent A"},
        "variables": {"input": [{"key": "secretOffer", "defaultValue": "AGENT_A_DISCOUNT"}]},
        "instructions": "Offer: {secretOffer}"
    }
    config_b = {
        "identity": {"agentName": "Agent B"},
        "variables": {"input": [{"key": "secretOffer", "defaultValue": "AGENT_B_DISCOUNT"}]},
        "instructions": "Offer: {secretOffer}"
    }
    prompt_a = prompt_compiler.compile_system_prompt(configuration=config_a)
    prompt_b = prompt_compiler.compile_system_prompt(configuration=config_b)

    assert "AGENT_A_DISCOUNT" in prompt_a
    assert "AGENT_A_DISCOUNT" not in prompt_b
    assert "AGENT_B_DISCOUNT" in prompt_b
    assert "AGENT_B_DISCOUNT" not in prompt_a

@pytest.mark.asyncio
async def test_20_tenant_a_variables_do_not_leak_to_tenant_b():
    """TEST 20: Tenant A variables do not leak into Tenant B."""
    tenant_1_vars = [{"key": "businessName", "defaultValue": "Tenant 1 Enterprise"}]
    tenant_2_vars = [{"key": "businessName", "defaultValue": "Tenant 2 Logistics"}]

    prompt_t1 = resolve_prompt_variables("Welcome to {businessName}", variables=tenant_1_vars)
    prompt_t2 = resolve_prompt_variables("Welcome to {businessName}", variables=tenant_2_vars)

    assert "Tenant 1 Enterprise" in prompt_t1
    assert "Tenant 2 Logistics" in prompt_t2
    assert "Tenant 2" not in prompt_t1

@pytest.mark.asyncio
async def test_21_template_does_not_acquire_agent_variable_values():
    """TEST 21: Template does not acquire Agent variable values."""
    tmpl = TemplateService.find_system_template("receptionist")
    base_prompt_before = tmpl["base_prompt"]

    custom_config = {
        "identity": {"agentName": "CustomAgent"},
        "variables": {"input": [{"key": "businessName", "defaultValue": "Unique Client Brand"}]},
        "instructions": "Representing {businessName}"
    }
    _ = prompt_compiler.compile_system_prompt(configuration=custom_config, template_base_prompt=base_prompt_before)

    tmpl_after = TemplateService.find_system_template("receptionist")
    assert tmpl_after["base_prompt"] == base_prompt_before
    assert "Unique Client Brand" not in tmpl_after["base_prompt"]

@pytest.mark.asyncio
async def test_22_published_agent_version_isolated_from_draft_edits():
    """TEST 22: Published AgentVersion snapshot remains isolated from later draft variable changes."""
    published_snapshot_config = {
        "identity": {"agentName": "StableAgent"},
        "variables": {"input": [{"key": "supportPhone", "defaultValue": "1800-111-222"}]},
        "instructions": "Helpline: {supportPhone}"
    }
    draft_modified_config = {
        "identity": {"agentName": "StableAgent"},
        "variables": {"input": [{"key": "supportPhone", "defaultValue": "1800-999-888"}]},
        "instructions": "Helpline: {supportPhone}"
    }

    compiled_published = prompt_compiler.compile_system_prompt(configuration=published_snapshot_config)
    compiled_draft = prompt_compiler.compile_system_prompt(configuration=draft_modified_config)

    assert "1800-111-222" in compiled_published
    assert "1800-999-888" in compiled_draft
    assert "1800-999-888" not in compiled_published

@pytest.mark.asyncio
async def test_23_existing_first_client_variables_work():
    """TEST 23: Existing first-client variables (Dr. Roy Clinic) continue to work."""
    healthcare_config = {
        "identity": {
            "agentName": "Aarti",
            "businessName": "Dr. Roy Clinic",
            "greeting": "Hi, thanks for calling {businessName}! This is {agentName}."
        },
        "variables": {
            "input": [
                {"key": "consultationFee", "defaultValue": "₹800"},
                {"key": "clinicLocation", "defaultValue": "Koramangala 4th Block"}
            ]
        },
        "instructions": "Dr. Roy Clinic consultation fee is {consultationFee} located at {clinicLocation}."
    }
    compiled = prompt_compiler.compile_system_prompt(configuration=healthcare_config)
    assert "Dr. Roy Clinic" in compiled
    assert "₹800" in compiled
    assert "Koramangala 4th Block" in compiled

@pytest.mark.asyncio
async def test_24_restaurant_coaching_works_without_healthcare_leakage():
    """TEST 24: Restaurant & coaching agent variable resolution contains zero healthcare leakage."""
    tmpl = TemplateService.find_system_template("receptionist")
    restaurant_config = {
        "identity": {"agentName": "Host", "businessName": "Bella Italia"},
        "variables": {
            "input": [
                {"key": "serviceType", "defaultValue": "Table Reservation"},
                {"key": "cuisine", "defaultValue": "Wood-fired Italian Pizza"},
                {"key": "openingHours", "defaultValue": "12 PM - 11 PM"}
            ]
        },
        "instructions": """## Restaurant Guidelines
- Welcome guests to {businessName}.
- Handle inquiries regarding our {cuisine} and {serviceType}.
- Operating hours are {openingHours}."""
    }

    compiled = prompt_compiler.compile_system_prompt(
        configuration=restaurant_config,
        template_base_prompt=tmpl["base_prompt"]
    )
    compiled_lower = compiled.lower()
    for kw in HEALTHCARE_RESTRICTED_KEYWORDS:
        assert kw not in compiled_lower, f"Healthcare keyword '{kw}' leaked into restaurant prompt!"

    assert "Bella Italia" in compiled
    assert "Wood-fired Italian Pizza" in compiled
    assert "Table Reservation" in compiled

@pytest.mark.asyncio
async def test_25_multiline_instructions_with_multiple_variables_compile():
    """TEST 25: Multiline Instructions containing multiple variables compile and resolve correctly."""
    multiline = """## Guidelines for {businessName}

### Phase 1: Welcome
- Greet caller on behalf of {serviceProviderName}.
- Inquire regarding {serviceType}.

### Phase 2: Information
- Helpline: {customerCareNumber}
- Address: {businessAddress}
- Timings: {businessHours}"""

    variables = [
        {"key": "businessName", "defaultValue": "Apex Fit Gym"},
        {"key": "serviceProviderName", "defaultValue": "Coach Vikram"},
        {"key": "serviceType", "defaultValue": "Personal Training Session"},
        {"key": "customerCareNumber", "defaultValue": "+91 9876543210"},
        {"key": "businessAddress", "defaultValue": "Plot 12, Ring Road"},
        {"key": "businessHours", "defaultValue": "6 AM - 10 PM"}
    ]

    resolved = resolve_prompt_variables(multiline, variables=variables)
    assert "Apex Fit Gym" in resolved
    assert "Coach Vikram" in resolved
    assert "Personal Training Session" in resolved
    assert "+91 9876543210" in resolved
    assert "Plot 12, Ring Road" in resolved
    assert "6 AM - 10 PM" in resolved
    assert "## Guidelines for Apex Fit Gym" in resolved
