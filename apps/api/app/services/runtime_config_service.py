import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models import Deployment, Agent, AgentVersion, PhoneNumber, DeploymentStatus
from ..schemas import (
    RuntimeAgentConfig, RuntimeTenantConfig, RuntimeAgentMetadata,
    RuntimeDeploymentMetadata, RuntimePromptConfig, RuntimeVoiceConfig,
    RuntimeLanguageConfig, RuntimeBehaviorConfig, RuntimeKnowledgeConfig,
    RuntimeToolConfig, RuntimeToolDefinition, RuntimeVariableConfig
)
from .prompt_compiler_service import prompt_compiler
from ..logging import logger

CANONICAL_TOOL_DEFS = {
    "book_appointment": RuntimeToolDefinition(
        tool_id="book_appointment",
        name="book_appointment",
        description="Submit an appointment request. Records an unconfirmed request for team verification.",
        parameters={
            "type": "object",
            "properties": {
                "customerName": {"type": "string", "description": "Customer name"},
                "title": {"type": "string", "description": "Reason for visit or appointment purpose"},
                "bookingDate": {"type": "string", "description": "Date of appointment (YYYY-MM-DD or relative like tomorrow)"},
                "bookingTime": {"type": "string", "description": "Time of appointment (e.g. 10:00 AM, 12:00 PM)"},
                "resourceName": {"type": "string", "description": "Requested staff member, host, specialist, or service provider"},
                "customerPhone": {"type": "string", "description": "Contact phone number"},
                "notes": {"type": "string", "description": "Additional notes"}
            },
            "required": ["customerName", "title", "bookingDate", "bookingTime"]
        },
        enabled=True
    ),
    "create_callback_lead": RuntimeToolDefinition(
        tool_id="create_callback_lead",
        name="create_callback_lead",
        description="Create a callback request or lead for a customer wanting more information.",
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
        enabled=True
    ),
    "query_knowledge_base": RuntimeToolDefinition(
        tool_id="query_knowledge_base",
        name="query_knowledge_base",
        description="Query the business knowledge base to retrieve authoritative facts, pricing, policies, and business details.",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Semantic query to search business knowledge base"}
            },
            "required": ["query"]
        },
        enabled=True
    ),
}

class RuntimeAgentConfigService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def resolve_runtime_config(
        self,
        deployment_id: Optional[uuid.UUID] = None,
        phone_number: Optional[str] = None
    ) -> RuntimeAgentConfig:
        deployment = None

        if deployment_id:
            stmt = select(Deployment).where(Deployment.id == deployment_id)
            res = await self.session.execute(stmt)
            deployment = res.scalar_one_or_none()
        elif phone_number:
            p_stmt = select(PhoneNumber).where(PhoneNumber.phoneNumber == phone_number.strip())
            p_res = await self.session.execute(p_stmt)
            phone_record = p_res.scalar_one_or_none()
            if phone_record and phone_record.agentId:
                d_stmt = select(Deployment).where(
                    Deployment.agentId == phone_record.agentId,
                    Deployment.status == DeploymentStatus.ACTIVE
                ).order_by(Deployment.createdAt.desc()).limit(1)
                d_res = await self.session.execute(d_stmt)
                deployment = d_res.scalar_one_or_none()

        if not deployment:
            raise ValueError("Active deployment not found for requested ID or phone number")

        # Fetch Agent & Version
        a_stmt = select(Agent).where(Agent.id == deployment.agentId)
        a_res = await self.session.execute(a_stmt)
        agent = a_res.scalar_one_or_none()

        v_stmt = select(AgentVersion).where(AgentVersion.id == deployment.versionId)
        v_res = await self.session.execute(v_stmt)
        version = v_res.scalar_one_or_none()

        if not agent or not version:
            raise ValueError("Corrupt deployment: missing associated agent or version snapshot")

        # Parse configuration snapshot
        cfg = version.configuration or {}
        voice_cfg = cfg.get("voice", {})
        lang_cfg = cfg.get("language", {})
        runtime_cfg = cfg.get("runtime", {}) or cfg.get("runtimeSettings", {})
        tools_cfg = cfg.get("tools", {})
        vars_cfg = cfg.get("variables", {})
        knowledge_cfg = cfg.get("knowledge", {})
        identity_cfg = cfg.get("identity", {})

        timezone = (
            cfg.get("timezone")
            or cfg.get("businessInformation", {}).get("timezone")
            or "Asia/Kolkata"
        )
        primary_lang = lang_cfg.get("primary", "hi-IN")
        supported_langs = lang_cfg.get("supported") or lang_cfg.get("supportedLanguages") or ["en-IN", "hi-IN"]

        compiled_prompt = prompt_compiler.compile_system_prompt(
            configuration=cfg,
            timezone=timezone,
            primary_lang=primary_lang,
            supported_langs=supported_langs
        )

        greeting = (
            identity_cfg.get("greeting")
            or cfg.get("greeting")
            or "Hello! How can I assist you today?"
        )

        # Build tools list
        resolved_tool_defs: List[RuntimeToolDefinition] = []
        raw_tools = tools_cfg.get("tools") or tools_cfg.get("bindings") or []
        tools_enabled = tools_cfg.get("enabled", True)

        if tools_enabled:
            if isinstance(raw_tools, list) and len(raw_tools) > 0:
                for t in raw_tools:
                    if isinstance(t, dict):
                        t_id = t.get("toolId") or t.get("tool_id") or t.get("name")
                        if t_id and t.get("enabled", True):
                            canon = CANONICAL_TOOL_DEFS.get(t_id)
                            if canon:
                                resolved_tool_defs.append(canon)
                            else:
                                resolved_tool_defs.append(RuntimeToolDefinition(
                                    tool_id=t_id,
                                    name=t.get("name", t_id),
                                    description=t.get("description", "Custom business tool"),
                                    parameters=t.get("parameters"),
                                    enabled=True,
                                    confirmation_required=t.get("confirmationRequired", False)
                                ))
            else:
                # Default canonical tools enabled for voice agent
                resolved_tool_defs.append(CANONICAL_TOOL_DEFS["query_knowledge_base"])
                resolved_tool_defs.append(CANONICAL_TOOL_DEFS["book_appointment"])
                resolved_tool_defs.append(CANONICAL_TOOL_DEFS["create_callback_lead"])

        return RuntimeAgentConfig(
            tenant=RuntimeTenantConfig(tenant_id=str(deployment.tenantId)),
            agent=RuntimeAgentMetadata(
                agent_id=str(agent.id),
                agent_name=agent.name,
                status=agent.status.value
            ),
            deployment=RuntimeDeploymentMetadata(
                deployment_id=str(deployment.id),
                version_id=str(version.id),
                version_number=version.versionNumber
            ),
            prompt=RuntimePromptConfig(
                compiled_system_prompt=compiled_prompt,
                greeting=greeting,
                timezone=timezone
            ),
            voice=RuntimeVoiceConfig(
                provider=voice_cfg.get("provider", "sarvam"),
                stt_model=voice_cfg.get("sttModel", "saaras:v3"),
                tts_model=voice_cfg.get("ttsModel", "bulbul:v3"),
                voice_id=voice_cfg.get("voiceId", "shubh"),
                gender=voice_cfg.get("gender", "male"),
                speaking_speed=float(voice_cfg.get("speakingSpeed", 1.0)),
                pitch=float(voice_cfg.get("pitch", 0.0))
            ),
            language=RuntimeLanguageConfig(
                primary=primary_lang,
                supported_languages=supported_langs,
                auto_detect_enabled=lang_cfg.get("autoDetect", lang_cfg.get("autoDetectEnabled", False)),
                language_switching_enabled=lang_cfg.get("languageSwitchEnabled", lang_cfg.get("languageSwitchingEnabled", True))
            ),
            runtime=RuntimeBehaviorConfig(
                model_provider=runtime_cfg.get("modelProvider", "sarvam"),
                llm_model=runtime_cfg.get("llmModel", "sarvam-105b-conversations"),
                temperature=float(runtime_cfg.get("modelTemperature", runtime_cfg.get("temperature", 0.3))),
                interruption_mode=runtime_cfg.get("interruptionMode", "adaptive"),
                preemptive_generation_enabled=runtime_cfg.get("preemptiveGenerationEnabled", False),
                response_eagerness=runtime_cfg.get("eagernessToRespond", runtime_cfg.get("responseEagerness", "medium")),
                noise_cancellation_model=runtime_cfg.get("noiseCancellationModel", "quailVfS"),
                expressive_mode_enabled=runtime_cfg.get("expressiveModeEnabled", False),
                max_call_duration_seconds=int(runtime_cfg.get("maxCallLengthSeconds", runtime_cfg.get("maxCallDurationSeconds", 600)))
            ),
            knowledge=RuntimeKnowledgeConfig(
                enabled=knowledge_cfg.get("enabled", True),
                retrieval_config=knowledge_cfg.get("retrievalConfig", {"topK": 3, "scoreThreshold": 0.65})
            ),
            tools=RuntimeToolConfig(
                enabled=tools_enabled,
                tools=resolved_tool_defs
            ),
            variables=RuntimeVariableConfig(
                input_variables=vars_cfg.get("input", vars_cfg.get("inputVariables", [])),
                output_variables=vars_cfg.get("output", vars_cfg.get("outputVariables", [])),
                runtime_context=vars_cfg.get("runtimeContext", {})
            )
        )
