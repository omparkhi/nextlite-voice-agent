import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

# ==========================================
# 1. RUNTIME AGENT CONFIG SCHEMAS
# ==========================================

class RuntimeTenantConfig(CamelModel):
    tenant_id: str

class RuntimeAgentMetadata(CamelModel):
    agent_id: str
    agent_name: str
    status: str = "READY"

class RuntimeDeploymentMetadata(CamelModel):
    deployment_id: str
    version_id: str
    version_number: Optional[int] = 1

class RuntimePromptConfig(CamelModel):
    compiled_system_prompt: str
    greeting: Optional[str] = ""
    timezone: Optional[str] = "Asia/Kolkata"

class RuntimeVoiceConfig(CamelModel):
    provider: str = "sarvam"
    stt_model: Optional[str] = "saaras:v3-realtime"
    tts_model: Optional[str] = "bulbul:v3"
    voice_id: str = "priya"
    gender: Optional[Literal["male", "female", "neutral"]] = "female"
    speaking_speed: Optional[float] = 1.0
    pitch: Optional[float] = 0.0

class RuntimeLanguageConfig(CamelModel):
    primary: str = "en-IN"
    supported_languages: List[str] = Field(default_factory=lambda: ["en-IN"])
    auto_detect_enabled: Optional[bool] = True
    language_switching_enabled: Optional[bool] = True

class RuntimeNudgeConfig(CamelModel):
    enabled: bool = True
    delay_seconds: int = 5
    messages: List[str] = Field(default_factory=lambda: ["Are you there? I can help you."])
    max_unanswered_nudges: int = 2

class RuntimeBehaviorConfig(CamelModel):
    model_provider: Optional[str] = "sarvam"
    llm_model: Optional[str] = "sarvam-2b-v0.5"
    temperature: Optional[float] = 0.3
    interruption_mode: Optional[str] = "adaptive"
    preemptive_generation_enabled: Optional[bool] = False
    response_eagerness: Optional[str] = "medium"
    noise_cancellation_model: Optional[str] = "quailVfS"
    expressive_mode_enabled: Optional[bool] = False
    max_call_duration_seconds: Optional[int] = 600
    enable_early_tool_ack: bool = True
    enable_conversational_early_ack: bool = False
    tool_max_tokens: Optional[int] = 128
    post_tool_max_tokens: Optional[int] = 80
    tool_llm_model: Optional[str] = None
    tool_reasoning_mode: Optional[str] = None
    nudges: Optional[RuntimeNudgeConfig] = Field(default_factory=RuntimeNudgeConfig)

class RuntimeKnowledgeConfig(CamelModel):
    enabled: bool = False
    retrieval_config: Optional[Dict[str, Any]] = Field(
        default_factory=lambda: {"topK": 3, "scoreThreshold": 0.65}
    )

class RuntimeToolDefinition(CamelModel):
    tool_id: Optional[str] = None
    name: str
    description: str
    parameters: Optional[Dict[str, Any]] = None
    enabled: bool = True
    confirmation_required: Optional[bool] = False
    direct_response_enabled: bool = False

class RuntimeToolConfig(CamelModel):
    enabled: bool = True
    tools: List[RuntimeToolDefinition] = Field(default_factory=list)

class RuntimeVariableDefinition(CamelModel):
    key: str
    label: Optional[str] = None
    type: str = "string"
    required: bool = False
    default_value: Optional[Any] = None
    scope: Optional[str] = "CALL"

class RuntimeVariableConfig(CamelModel):
    input_variables: List[RuntimeVariableDefinition] = Field(default_factory=list)
    output_variables: List[RuntimeVariableDefinition] = Field(default_factory=list)
    runtime_context: Optional[Dict[str, str]] = Field(default_factory=dict)

class RuntimeAgentConfig(CamelModel):
    tenant: RuntimeTenantConfig
    agent: RuntimeAgentMetadata
    deployment: RuntimeDeploymentMetadata
    prompt: RuntimePromptConfig
    voice: RuntimeVoiceConfig
    language: RuntimeLanguageConfig
    runtime: RuntimeBehaviorConfig
    knowledge: RuntimeKnowledgeConfig
    tools: RuntimeToolConfig
    variables: RuntimeVariableConfig


# ==========================================
# 2. REST API REQUEST / RESPONSE SCHEMAS
# ==========================================

# Auth
class RegisterRequest(CamelModel):
    email: str
    password: str
    name: str
    tenant_name: str

class LoginRequest(CamelModel):
    email: str
    password: str

class TokenResponse(CamelModel):
    access_token: str
    user: Dict[str, Any]

# Agent
class CreateAgentRequest(CamelModel):
    name: str
    description: Optional[str] = None
    template_id: Optional[str] = None

class UpdateAgentRequest(CamelModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class CreateVersionRequest(CamelModel):
    system_prompt: str
    config: Dict[str, Any]
    change_summary: Optional[str] = None

class DeployAgentRequest(CamelModel):
    version_id: str
    environment: str = "PRODUCTION"

# CRM
class LeadResponse(CamelModel):
    id: str
    tenant_id: str
    agent_id: Optional[str] = None
    lead_number: str
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    requirement: str
    status: str
    priority: str
    created_at: datetime

class AppointmentResponse(CamelModel):
    id: str
    tenant_id: str
    agent_id: Optional[str] = None
    appointment_number: str
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    service_type: str
    appointment_date: str
    appointment_time: str
    status: str
    created_at: datetime

class CallSessionResponse(CamelModel):
    id: str
    tenant_id: str
    agent_id: Optional[str] = None
    deployment_id: Optional[str] = None
    status: str
    direction: str
    caller_phone_number: Optional[str] = None
    duration_seconds: Optional[int] = 0
    transcript: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    metrics_json: Optional[Dict[str, Any]] = Field(default_factory=dict)
    started_at: datetime
    ended_at: Optional[datetime] = None
