import pytest
from apps.api.app.schemas import (
    RuntimeAgentConfig, RuntimeTenantConfig, RuntimeAgentMetadata,
    RuntimeDeploymentMetadata, RuntimePromptConfig, RuntimeVoiceConfig,
    RuntimeLanguageConfig, RuntimeBehaviorConfig, RuntimeKnowledgeConfig,
    RuntimeToolConfig, RuntimeVariableConfig, RegisterRequest,
    LeadResponse, AppointmentResponse
)

def test_runtime_agent_config_serialization_camelcase():
    config = RuntimeAgentConfig(
        tenant=RuntimeTenantConfig(tenant_id="tenant-123"),
        agent=RuntimeAgentMetadata(agent_id="agent-456", agent_name="AI Receptionist"),
        deployment=RuntimeDeploymentMetadata(deployment_id="dep-789", version_id="ver-001"),
        prompt=RuntimePromptConfig(compiled_system_prompt="You are a helpful assistant"),
        voice=RuntimeVoiceConfig(voice_id="priya"),
        language=RuntimeLanguageConfig(primary="en-IN", supported_languages=["en-IN", "hi-IN"]),
        runtime=RuntimeBehaviorConfig(temperature=0.3),
        knowledge=RuntimeKnowledgeConfig(enabled=True),
        tools=RuntimeToolConfig(enabled=True),
        variables=RuntimeVariableConfig()
    )

    dumped = config.model_dump(by_alias=True)
    assert "tenant" in dumped
    assert dumped["tenant"]["tenantId"] == "tenant-123"
    assert dumped["agent"]["agentName"] == "AI Receptionist"
    assert dumped["deployment"]["deploymentId"] == "dep-789"
    assert dumped["prompt"]["compiledSystemPrompt"] == "You are a helpful assistant"
    assert dumped["voice"]["voiceId"] == "priya"
    assert dumped["language"]["supportedLanguages"] == ["en-IN", "hi-IN"]
    assert dumped["runtime"]["temperature"] == 0.3

def test_deserialization_from_camelcase_json():
    payload = {
        "email": "owner@clinic.com",
        "password": "SecurePassword123!",
        "name": "Dr. Sharma",
        "tenantName": "Sharma Health"
    }
    req = RegisterRequest.model_validate(payload)
    assert req.email == "owner@clinic.com"
    assert req.tenant_name == "Sharma Health"
