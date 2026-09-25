import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models import Deployment, Agent, AgentVersion, AgentTemplate, PhoneNumber, DeploymentStatus
from ..schemas import (
    RuntimeAgentConfig, RuntimeTenantConfig, RuntimeAgentMetadata,
    RuntimeDeploymentMetadata, RuntimePromptConfig, RuntimeVoiceConfig,
    RuntimeLanguageConfig, RuntimeBehaviorConfig, RuntimeNudgeConfig, RuntimeKnowledgeConfig,
    RuntimeToolConfig, RuntimeToolDefinition, RuntimeVariableConfig
)
from .prompt_compiler_service import prompt_compiler
from ..domain.tool_registry import (
    CANONICAL_TOOL_REGISTRY,
    filter_agent_runtime_tools,
    get_canonical_tool,
)
from ..logging import logger

CANONICAL_TOOL_DEFS = {
    t_id: t_def.to_runtime_tool_definition(enabled=True)
    for t_id, t_def in CANONICAL_TOOL_REGISTRY.items()
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
            import re
            from sqlalchemy import or_
            raw_p = phone_number.strip()
            digits = re.sub(r"[^\d]", "", raw_p)
            candidates = [raw_p, f"+{digits}", digits]
            if len(digits) >= 10:
                candidates.append(digits[-10:])
                candidates.append(f"+91{digits[-10:]}")
                candidates.append(f"91{digits[-10:]}")
            
            p_stmt = select(PhoneNumber).where(
                or_(
                    PhoneNumber.phoneNumber.in_(candidates),
                    PhoneNumber.phoneNumber.like(f"%{digits[-10:]}") if len(digits) >= 10 else False
                )
            )
            p_res = await self.session.execute(p_stmt)
            phone_record = p_res.scalars().first()
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

        # Query latest version to overlay authoritative mutable business variables without requiring redeploy
        latest_v_stmt = (
            select(AgentVersion)
            .where(AgentVersion.agentId == agent.id)
            .order_by(AgentVersion.versionNumber.desc())
            .limit(1)
        )
        latest_v_res = await self.session.execute(latest_v_stmt)
        latest_v = latest_v_res.scalar_one_or_none()

        # Parse configuration: Start with deployed version snapshot for stable agent behavior
        import copy
        cfg = copy.deepcopy(version.configuration or {})

        # Overlay authoritative current mutable variables, business information, and identity from latest version
        if latest_v and latest_v.configuration and isinstance(latest_v.configuration, dict):
            latest_cfg = latest_v.configuration
            if "variables" in latest_cfg and latest_cfg["variables"]:
                cfg["variables"] = copy.deepcopy(latest_cfg["variables"])
            if "businessInformation" in latest_cfg and latest_cfg["businessInformation"]:
                cfg["businessInformation"] = copy.deepcopy(latest_cfg["businessInformation"])
            if "identity" in latest_cfg and isinstance(latest_cfg["identity"], dict):
                if "identity" not in cfg or not isinstance(cfg["identity"], dict):
                    cfg["identity"] = {}
                cfg["identity"].update(copy.deepcopy(latest_cfg["identity"]))

        voice_cfg = cfg.get("voice", {}) if isinstance(cfg.get("voice"), dict) else {}
        lang_cfg = cfg.get("language", {}) if isinstance(cfg.get("language"), dict) else {}
        runtime_cfg = (cfg.get("runtime") or cfg.get("runtimeSettings") or {}) if (isinstance(cfg.get("runtime"), dict) or isinstance(cfg.get("runtimeSettings"), dict)) else {}
        tools_cfg = cfg.get("tools")
        vars_cfg = cfg.get("variables", {}) if isinstance(cfg.get("variables"), dict) else {}
        knowledge_cfg = cfg.get("knowledge", {}) if isinstance(cfg.get("knowledge"), dict) else {}
        identity_cfg = cfg.get("identity", {}) if isinstance(cfg.get("identity"), dict) else {}

        raw_nudges = cfg.get("nudges") if isinstance(cfg.get("nudges"), dict) else (runtime_cfg.get("nudges") if isinstance(runtime_cfg.get("nudges"), dict) else {})
        nudge_enabled = bool(raw_nudges.get("enabled", True)) if isinstance(raw_nudges, dict) else True
        try:
            nudge_delay = int(raw_nudges.get("delaySeconds", raw_nudges.get("delay_seconds", 5))) if isinstance(raw_nudges, dict) else 5
        except Exception:
            nudge_delay = 5
        raw_msgs = raw_nudges.get("messages") if isinstance(raw_nudges, dict) else None
        if isinstance(raw_msgs, list):
            nudge_msgs = [str(m) for m in raw_msgs if m]
        elif isinstance(raw_msgs, str) and raw_msgs.strip():
            nudge_msgs = [raw_msgs.strip()]
        else:
            nudge_msgs = ["Are you there? I can help you."]
        try:
            nudge_max = int(raw_nudges.get("maxUnansweredNudges", raw_nudges.get("max_unanswered_nudges", 2))) if isinstance(raw_nudges, dict) else 2
        except Exception:
            nudge_max = 2

        timezone = (
            cfg.get("timezone")
            or cfg.get("businessInformation", {}).get("timezone")
            or "Asia/Kolkata"
        )
        primary_lang = lang_cfg.get("primary", "hi-IN")
        supported_langs = lang_cfg.get("supported") or lang_cfg.get("supportedLanguages") or ["en-IN", "hi-IN"]

        # Resolve template base prompt if agent references a template
        template_base_prompt = None
        if agent.templateId:
            t_stmt = select(AgentTemplate).where(AgentTemplate.id == agent.templateId)
            t_res = await self.session.execute(t_stmt)
            tmpl = t_res.scalar_one_or_none()
            if tmpl:
                template_base_prompt = tmpl.basePrompt or tmpl.systemPromptTemplate

        compiled_prompt = prompt_compiler.compile_system_prompt(
            configuration=cfg,
            template_base_prompt=template_base_prompt,
            timezone=timezone,
            primary_lang=primary_lang,
            supported_langs=supported_langs
        )

        raw_greeting = (
            identity_cfg.get("greeting")
            or cfg.get("greeting")
            or "Hello! How can I assist you today?"
        )
        input_vars_list = vars_cfg.get("input", vars_cfg.get("inputVariables", [])) if isinstance(vars_cfg, dict) else []
        runtime_ctx_map = vars_cfg.get("runtimeContext", {}) if isinstance(vars_cfg, dict) else {}

        from ..domain.variable_resolver import resolve_prompt_variables
        from ..domain.greeting_localizer import localize_greeting
        resolved_greeting = resolve_prompt_variables(
            raw_greeting,
            variables=input_vars_list,
            runtime_context=runtime_ctx_map,
            config=cfg
        )

        voice_id = str(voice_cfg.get("voiceId", "shubh")).lower()
        is_male = voice_id in ["shubh", "aditya", "amit", "ratan", "kabir", "male"] or voice_cfg.get("gender") == "male"
        biz_info = cfg.get("businessInformation") or {}
        b_name = biz_info.get("businessName") or identity_cfg.get("businessName")
        a_name = identity_cfg.get("agentName")

        language_style = lang_cfg.get("languageStyle", lang_cfg.get("language_style", "mixed"))

        resolved_greeting = localize_greeting(
            resolved_greeting,
            primary_lang=primary_lang,
            business_name=b_name,
            agent_name=a_name,
            is_male=is_male,
            language_style=language_style,
        )

        # Build tools list dynamically from canonical tool registry and agent bindings
        tools_enabled = tools_cfg.get("enabled", True) if isinstance(tools_cfg, dict) else (tools_cfg is not None)
        resolved_tool_defs: List[RuntimeToolDefinition] = filter_agent_runtime_tools(tools_cfg)

        auto_detect_raw = lang_cfg.get("autoDetect", lang_cfg.get("autoDetectEnabled"))
        auto_detect_val = auto_detect_raw if auto_detect_raw is not None else (len(supported_langs) > 1 or True)
        lang_switch_raw = lang_cfg.get("languageSwitchEnabled", lang_cfg.get("languageSwitchingEnabled"))
        lang_switch_val = lang_switch_raw if lang_switch_raw is not None else (len(supported_langs) > 1 or True)

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
                greeting=resolved_greeting,
                timezone=timezone,
                guardrails=cfg.get("guardrails") or {},
                emergency_phone=(
                    (cfg.get("guardrails") or {}).get("emergencyPhone")
                    or (cfg.get("guardrails") or {}).get("emergency_phone")
                    or cfg.get("emergencyPhone")
                    or biz_info.get("phone")
                    or biz_info.get("phoneNumber")
                )
            ),
            voice=RuntimeVoiceConfig(
                provider=voice_cfg.get("provider", "sarvam"),
                stt_model=voice_cfg.get("sttModel", "saaras:v3-realtime"),
                tts_model=voice_cfg.get("ttsModel", "bulbul:v3"),
                voice_id=voice_cfg.get("voiceId", "shubh"),
                gender=voice_cfg.get("gender", "male"),
                speaking_speed=float(voice_cfg.get("speakingSpeed", 1.0)),
                pitch=float(voice_cfg.get("pitch", 0.0))
            ),
            language=RuntimeLanguageConfig(
                primary=primary_lang,
                supported_languages=supported_langs,
                auto_detect_enabled=bool(auto_detect_val),
                language_switching_enabled=bool(lang_switch_val),
                language_style=lang_cfg.get("languageStyle", lang_cfg.get("language_style", "mixed"))
            ),
            runtime=RuntimeBehaviorConfig(
                model_provider=runtime_cfg.get("modelProvider", "sarvam"),
                llm_model=runtime_cfg.get("llmModel", "sarvam-105b-conversations"),
                temperature=float(runtime_cfg.get("modelTemperature", runtime_cfg.get("temperature", 0.3))),
                tool_llm_model=runtime_cfg.get("toolLlmModel"),
                tool_max_tokens=int(runtime_cfg.get("toolMaxTokens", 128)),
                post_tool_max_tokens=int(runtime_cfg.get("postToolMaxTokens", 80)),
                tool_reasoning_mode=runtime_cfg.get("toolReasoningMode"),
                enable_early_tool_ack=runtime_cfg.get("enableEarlyToolAck", True),
                enable_conversational_early_ack=False,
                interruption_mode=runtime_cfg.get("interruptionMode", "adaptive"),
                preemptive_generation_enabled=runtime_cfg.get("preemptiveGenerationEnabled", False),
                response_eagerness=runtime_cfg.get("eagernessToRespond", runtime_cfg.get("responseEagerness", "medium")),
                expressive_mode_enabled=runtime_cfg.get("expressiveModeEnabled", False),
                max_call_duration_seconds=int(runtime_cfg.get("maxCallLengthSeconds", runtime_cfg.get("maxCallDurationSeconds", 600))),
                nudges=RuntimeNudgeConfig(
                    enabled=nudge_enabled,
                    delay_seconds=nudge_delay,
                    messages=nudge_msgs,
                    max_unanswered_nudges=nudge_max
                )
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
                input_variables=input_vars_list,
                output_variables=vars_cfg.get("output", vars_cfg.get("outputVariables", [])) if isinstance(vars_cfg, dict) else [],
                runtime_context=runtime_ctx_map
            )
        )
