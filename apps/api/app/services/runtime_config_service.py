import uuid
from typing import Optional, Dict, Any
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
        runtime_cfg = cfg.get("runtime", {})
        tools_cfg = cfg.get("tools", {})
        vars_cfg = cfg.get("variables", {})
        knowledge_cfg = cfg.get("knowledge", {})

        base_prompt = cfg.get("systemPrompt") or "You are a professional voice assistant."
        timezone = cfg.get("timezone") or "Asia/Kolkata"
        primary_lang = lang_cfg.get("primary", "en-IN")
        supported_langs = lang_cfg.get("supportedLanguages", ["en-IN", "hi-IN"])

        compiled_prompt = prompt_compiler.compile_system_prompt(
            base_prompt=base_prompt,
            timezone=timezone,
            primary_lang=primary_lang,
            supported_langs=supported_langs
        )

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
                greeting=cfg.get("greeting", "Hello! How can I assist you today?"),
                timezone=timezone
            ),
            voice=RuntimeVoiceConfig(
                provider=voice_cfg.get("provider", "sarvam"),
                stt_model=voice_cfg.get("sttModel", "saaras:v3"),
                tts_model=voice_cfg.get("ttsModel", "bulbul:v3"),
                voice_id=voice_cfg.get("voiceId", "priya"),
                gender=voice_cfg.get("gender", "female"),
                speaking_speed=voice_cfg.get("speakingSpeed", 1.0),
                pitch=voice_cfg.get("pitch", 0.0)
            ),
            language=RuntimeLanguageConfig(
                primary=primary_lang,
                supported_languages=supported_langs,
                auto_detect_enabled=lang_cfg.get("autoDetectEnabled", False),
                language_switching_enabled=lang_cfg.get("languageSwitchingEnabled", True)
            ),
            runtime=RuntimeBehaviorConfig(
                model_provider=runtime_cfg.get("modelProvider", "sarvam"),
                llm_model=runtime_cfg.get("llmModel", "sarvam-2b-v0.5"),
                temperature=runtime_cfg.get("temperature", 0.3),
                interruption_mode=runtime_cfg.get("interruptionMode", "adaptive"),
                preemptive_generation_enabled=runtime_cfg.get("preemptiveGenerationEnabled", False),
                response_eagerness=runtime_cfg.get("responseEagerness", "medium"),
                noise_cancellation_model=runtime_cfg.get("noiseCancellationModel", "quailVfS"),
                expressive_mode_enabled=runtime_cfg.get("expressiveModeEnabled", False),
                max_call_duration_seconds=runtime_cfg.get("maxCallDurationSeconds", 600)
            ),
            knowledge=RuntimeKnowledgeConfig(
                enabled=knowledge_cfg.get("enabled", False),
                retrieval_config=knowledge_cfg.get("retrievalConfig", {"topK": 3, "scoreThreshold": 0.65})
            ),
            tools=RuntimeToolConfig(
                enabled=tools_cfg.get("enabled", True),
                tools=[
                    RuntimeToolDefinition.model_validate(t) for t in tools_cfg.get("tools", [])
                ]
            ),
            variables=RuntimeVariableConfig(
                input_variables=vars_cfg.get("inputVariables", []),
                output_variables=vars_cfg.get("outputVariables", []),
                runtime_context=vars_cfg.get("runtimeContext", {})
            )
        )
