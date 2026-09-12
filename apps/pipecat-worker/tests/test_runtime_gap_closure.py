import pytest
from app.runtime_config_client import RuntimeAgentConfig

def test_runtime_agent_config_gap_fields():
    """Verify that RuntimeAgentConfig correctly parses the newly supported gap fields."""
    raw_config = {
        "tenant": {"tenantId": "t-1"},
        "agent": {"agentId": "a-1", "agentName": "test"},
        "deployment": {"deploymentId": "d-1", "versionId": "v-1"},
        "prompt": {"compiledSystemPrompt": "Hello"},
        "voice": {
            "provider": "sarvam",
            "voiceId": "priya",
            "speakingSpeed": 1.2,
            "pitch": 0.9,
            "gender": "female",
            "expressiveModeEnabled": True
        },
        "language": {"primary": "hi-IN", "supportedLanguages": ["hi-IN", "en-IN"]},
        "runtime": {
            "maxCallDurationSeconds": 300,
            "preemptiveGenerationEnabled": False,
            "responseEagerness": "low",
            "interruptionMode": "adaptive",
            "noiseCancellationModel": "quailVfS"
        },
        "knowledge": {"enabled": False},
        "tools": {"enabled": False, "tools": []},
        "variables": {"inputVariables": [], "outputVariables": []}
    }
    
    config = RuntimeAgentConfig.model_validate(raw_config)
    
    # Verify Phase 7D implemented fields
    assert config.voice.speaking_speed == 1.2
    assert config.voice.pitch == 0.9
    assert config.runtime.max_call_duration_seconds == 300
    
    # Verify deferred/unsupported fields are correctly parsed (so they aren't lost if accessed later)
    assert config.voice.gender == "female"
    assert config.runtime.preemptive_generation_enabled is False
    assert config.runtime.response_eagerness == "low"
    assert config.runtime.interruption_mode == "adaptive"
    assert config.runtime.noise_cancellation_model == "quailVfS"
