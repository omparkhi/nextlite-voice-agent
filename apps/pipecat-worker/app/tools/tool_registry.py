"""NextLite Pipecat Tool Registry Module.

Central registry and factory for resolving configured runtime tools into native Pipecat
FunctionSchema instances with trusted server-side context injection.

Architecture:
RuntimeAgentConfig.tools -> ToolRegistry -> ToolFactory -> native Pipecat FunctionSchema -> SarvamLLMService / LLMContext
"""

import re
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Protocol, Set, Union
import httpx
from loguru import logger

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

from app.runtime_config_client import RuntimeAgentConfig, RuntimeToolConfig, RuntimeToolDefinition
from app.tools.appointment_tool import (
    BOOK_APPOINTMENT_TOOL_NAME,
    RESCHEDULE_APPOINTMENT_TOOL_NAME,
    create_book_appointment_tool_factory,
    create_reschedule_appointment_tool_factory,
)
from app.tools.knowledge_tool import (
    QUERY_KNOWLEDGE_BASE_TOOL_NAME,
    create_knowledge_tool_factory,
)
from app.tools.lead_tool import (
    CREATE_CALLBACK_LEAD_TOOL_NAME,
    create_callback_lead_tool_factory,
)
from app.tools.slot_tool import (
    CHECK_SLOTS_TOOL_NAME,
    create_check_slots_tool_factory,
)

if TYPE_CHECKING:
    from app.call_lifecycle import CallTranscriptCollector, TrustedCallContext


@dataclass
class ToolRuntimeContext:
    """Per-call trusted execution context for tools.
    
    Contains authoritative identifiers strictly derived from server-side session
    establishment. The LLM cannot access, modify, or override these values.
    """
    deployment_id: str
    call_session_id: Optional[str] = None
    caller_phone: Optional[str] = None
    tenant_id: Optional[str] = None
    agent_id: Optional[str] = None
    api_url: Optional[str] = None
    worker_secret: Optional[str] = None
    timezone: Optional[str] = None
    business_hours: Optional[str] = None
    slot_duration: Optional[str] = None
    transcript_collector: Optional["CallTranscriptCollector"] = None
    timing_tracker: Optional[Any] = None
    _call_session_task: Optional[Any] = None

    async def ensure_call_session_id(self) -> Optional[str]:
        """Ensures that the background CallSession creation task has completed before tool execution."""
        if self.call_session_id:
            return self.call_session_id
        if self._call_session_task is not None:
            try:
                res = await self._call_session_task
                if res and isinstance(res, str):
                    self.call_session_id = res
            except Exception as e:
                logger.error(f"[ToolRuntimeContext] Error awaiting background call_session_task: {e}")
        return self.call_session_id

    @classmethod
    def from_trusted_call_context(
        cls,
        trusted_ctx: "TrustedCallContext",
        api_url: Optional[str] = None,
        worker_secret: Optional[str] = None,
        transcript_collector: Optional["CallTranscriptCollector"] = None,
        timing_tracker: Optional[Any] = None,
    ) -> "ToolRuntimeContext":
        """Convenience constructor from Phase 6C TrustedCallContext."""
        return cls(
            deployment_id=trusted_ctx.deployment_id,
            call_session_id=trusted_ctx.call_session_id,
            caller_phone=trusted_ctx.caller_phone,
            tenant_id=trusted_ctx.tenant_id,
            agent_id=trusted_ctx.agent_id,
            api_url=api_url,
            worker_secret=worker_secret,
            transcript_collector=transcript_collector,
            timing_tracker=timing_tracker,
        )


CANONICAL_PLATFORM_TOOLS = (
    "query_knowledge_base",
    "create_callback_lead",
    "book_appointment",
    "check_available_slots",
    "reschedule_appointment",
)

CANONICAL_TOOL_LABEL_MAP: Dict[str, str] = {
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
    # Slot checking
    "check_available_slots": "check_available_slots",
    "check available slots": "check_available_slots",
    "check_slots": "check_available_slots",
    "check slots": "check_available_slots",
    # Reschedule
    "reschedule_appointment": "reschedule_appointment",
    "reschedule appointment": "reschedule_appointment",
    "reschedule": "reschedule_appointment",
}


def normalize_tool_id(tool_id_or_name: Optional[str]) -> Optional[str]:
    """Canonical tool ID normalization utility matching NextLite shared contracts."""
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

    return None


def is_valid_tool_name(name: str) -> bool:
    """Validates tool name for LLM compatibility (1-64 chars, valid identifier)."""
    if not name or not isinstance(name, str):
        return False
    trimmed = name.strip()
    if len(trimmed) == 0 or len(trimmed) > 64:
        return False
    return bool(re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", trimmed))


class ToolFactory(Protocol):
    """Protocol for tool factories producing native Pipecat FunctionSchema instances."""
    tool_id: str

    def create(
        self,
        context: ToolRuntimeContext,
        tool_config: Optional[RuntimeToolDefinition] = None,
        runtime_config: Optional[RuntimeAgentConfig] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> FunctionSchema:
        ...


class LeadToolFactory:
    tool_id = CREATE_CALLBACK_LEAD_TOOL_NAME

    def create(
        self,
        context: ToolRuntimeContext,
        tool_config: Optional[RuntimeToolDefinition] = None,
        runtime_config: Optional[RuntimeAgentConfig] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> FunctionSchema:
        desc = tool_config.description if tool_config and tool_config.description else None
        return create_callback_lead_tool_factory(
            context=context,
            description_override=desc,
            http_client=http_client,
        )


class AppointmentToolFactory:
    tool_id = BOOK_APPOINTMENT_TOOL_NAME

    def create(
        self,
        context: ToolRuntimeContext,
        tool_config: Optional[RuntimeToolDefinition] = None,
        runtime_config: Optional[RuntimeAgentConfig] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> FunctionSchema:
        desc = tool_config.description if tool_config and tool_config.description else None
        return create_book_appointment_tool_factory(
            context=context,
            description_override=desc,
            http_client=http_client,
            direct_response_enabled=bool(tool_config and tool_config.direct_response_enabled),
            direct_response_language=(
                runtime_config.language.primary
                if runtime_config and runtime_config.language
                else "en-IN"
            ),
        )


class KnowledgeToolFactory:
    tool_id = QUERY_KNOWLEDGE_BASE_TOOL_NAME

    def create(
        self,
        context: ToolRuntimeContext,
        tool_config: Optional[RuntimeToolDefinition] = None,
        runtime_config: Optional[RuntimeAgentConfig] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> FunctionSchema:
        desc = tool_config.description if tool_config and tool_config.description else None
        
        top_k = 5
        if runtime_config and runtime_config.knowledge and runtime_config.knowledge.retrieval_config:
            top_k = runtime_config.knowledge.retrieval_config.top_k
            
        return create_knowledge_tool_factory(
            context=context,
            description_override=desc,
            top_k=top_k,
            http_client=http_client,
        )


class SlotToolFactory:
    tool_id = CHECK_SLOTS_TOOL_NAME

    def create(
        self,
        context: ToolRuntimeContext,
        tool_config: Optional[RuntimeToolDefinition] = None,
        runtime_config: Optional[RuntimeAgentConfig] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> FunctionSchema:
        desc = tool_config.description if tool_config and tool_config.description else None
        return create_check_slots_tool_factory(
            context=context,
            description_override=desc,
            http_client=http_client,
        )


class RescheduleToolFactory:
    tool_id = RESCHEDULE_APPOINTMENT_TOOL_NAME

    def create(
        self,
        context: ToolRuntimeContext,
        tool_config: Optional[RuntimeToolDefinition] = None,
        runtime_config: Optional[RuntimeAgentConfig] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> FunctionSchema:
        desc = tool_config.description if tool_config and tool_config.description else None
        return create_reschedule_appointment_tool_factory(
            context=context,
            description_override=desc,
            http_client=http_client,
        )


class ToolRegistry:
    """NextLite Voice Tool Registry for Pipecat Worker.
    
    Resolves authoritative RuntimeAgentConfig.tools into native Pipecat FunctionSchema instances.
    """

    def __init__(self):
        self._factories: Dict[str, ToolFactory] = {}
        # Register standard built-in canonical factories
        self.register(KnowledgeToolFactory())
        self.register(LeadToolFactory())
        self.register(AppointmentToolFactory())
        self.register(SlotToolFactory())
        self.register(RescheduleToolFactory())

    def register(self, factory: ToolFactory) -> "ToolRegistry":
        """Register a tool factory with the registry."""
        if not factory or not getattr(factory, "tool_id", None):
            raise ValueError("[ToolRegistry] Cannot register tool factory without a valid tool_id")
        self._factories[factory.tool_id] = factory
        return self

    def get(self, tool_id: str) -> Optional[ToolFactory]:
        """Retrieve a tool factory by tool_id."""
        return self._factories.get(tool_id)

    def has(self, tool_id: str) -> bool:
        """Check if a factory is registered for the tool_id."""
        return tool_id in self._factories

    def resolve_tools(
        self,
        runtime_config: Optional[RuntimeAgentConfig] = None,
        context: Optional[Union[ToolRuntimeContext, str]] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> List[FunctionSchema]:
        """Resolves configured runtime tools into native Pipecat FunctionSchema instances.
        
        Resolution Rules:
        1. If runtime_config is None, returns [].
        2. If tools.enabled == False, returns [].
        3. Filters out disabled individual tools (enabled == False).
        4. Validates LLM-facing tool names.
        5. Deduplicates exposed tool names.
        6. Safely skips unknown/unregistered tools with diagnostic logs (NO arbitrary execution).
        7. Wraps execution handlers with timing, diagnostic error isolation, and toolsUsed lifecycle tracking.
        8. Knowledge fallback: If runtime_config.knowledge.enabled is True and not explicitly configured/disabled,
           includes query_knowledge_base.
        """
        if not runtime_config:
            return []

        resolved_context: ToolRuntimeContext
        if isinstance(context, str):
            resolved_context = ToolRuntimeContext(deployment_id=context)
        elif isinstance(context, ToolRuntimeContext):
            resolved_context = context
        else:
            resolved_context = ToolRuntimeContext(
                deployment_id=runtime_config.deployment.deployment_id or ""
            )

        resolved_tools: List[FunctionSchema] = []
        seen_tool_names: Set[str] = set()
        query_knowledge_base_configured = False

        tools_config = runtime_config.tools

        # Process explicit tools list if tools are enabled
        if tools_config and tools_config.enabled and isinstance(tools_config.tools, list):
            for tool_def in tools_config.tools:
                if not tool_def or not tool_def.enabled:
                    continue

                raw_tool_id = tool_def.tool_id or tool_def.name
                canonical_tool_id = normalize_tool_id(raw_tool_id) or raw_tool_id

                if canonical_tool_id == QUERY_KNOWLEDGE_BASE_TOOL_NAME:
                    query_knowledge_base_configured = True

                factory = self.get(canonical_tool_id)
                if not factory:
                    logger.warning(
                        f"[ToolRegistry] Unknown toolId '{raw_tool_id}' (canonical: '{canonical_tool_id}'). "
                        "No factory registered for this tool. Skipping without arbitrary execution."
                    )
                    continue

                candidate_name = tool_def.name if is_valid_tool_name(tool_def.name) else factory.tool_id
                llm_name = candidate_name if is_valid_tool_name(candidate_name) else factory.tool_id

                if llm_name in seen_tool_names:
                    logger.warning(
                        f"[ToolRegistry] Duplicate tool name '{llm_name}' detected. Skipping duplicate."
                    )
                    continue

                try:
                    raw_schema = factory.create(
                        context=resolved_context,
                        tool_config=tool_def,
                        runtime_config=runtime_config,
                        http_client=http_client,
                    )
                    # Wrap execution handler with timing, isolation, and lifecycle recording
                    instrumented_schema = self._instrument_function_schema(
                        raw_schema=raw_schema,
                        llm_name=llm_name,
                        context=resolved_context,
                    )
                    resolved_tools.append(instrumented_schema)
                    seen_tool_names.add(llm_name)
                except Exception as err:
                    logger.error(
                        f"[ToolRegistry] Failed to instantiate tool '{canonical_tool_id}': {err}"
                    )

        # Check if query_knowledge_base is explicitly disabled in tools.tools
        is_explicitly_disabled_in_tools = False
        if tools_config and isinstance(tools_config.tools, list):
            is_explicitly_disabled_in_tools = any(
                (t.tool_id == QUERY_KNOWLEDGE_BASE_TOOL_NAME or t.name == QUERY_KNOWLEDGE_BASE_TOOL_NAME)
                and not t.enabled
                for t in tools_config.tools
                if t
            )

        # Fallback: Knowledge tool enabled top-level and not explicitly configured in tools
        if (
            not query_knowledge_base_configured
            and not is_explicitly_disabled_in_tools
            and runtime_config.knowledge
            and runtime_config.knowledge.enabled
            and resolved_context.deployment_id
            and QUERY_KNOWLEDGE_BASE_TOOL_NAME not in seen_tool_names
        ):
            knowledge_factory = self.get(QUERY_KNOWLEDGE_BASE_TOOL_NAME)
            if knowledge_factory:
                try:
                    raw_schema = knowledge_factory.create(
                        context=resolved_context,
                        tool_config=None,
                        runtime_config=runtime_config,
                        http_client=http_client,
                    )
                    instrumented_schema = self._instrument_function_schema(
                        raw_schema=raw_schema,
                        llm_name=QUERY_KNOWLEDGE_BASE_TOOL_NAME,
                        context=resolved_context,
                    )
                    resolved_tools.append(instrumented_schema)
                    seen_tool_names.add(QUERY_KNOWLEDGE_BASE_TOOL_NAME)
                except Exception as err:
                    logger.error(
                        f"[ToolRegistry] Failed to instantiate default knowledge tool: {err}"
                    )

        return resolved_tools

    def _instrument_function_schema(
        self,
        raw_schema: FunctionSchema,
        llm_name: str,
        context: ToolRuntimeContext,
    ) -> FunctionSchema:
        """Wraps a FunctionSchema handler with timing logs, lifecycle tracking, and error isolation."""
        original_handler = raw_schema.handler

        async def instrumented_handler(params: FunctionCallParams) -> Any:
            t0 = time.perf_counter()
            call_id = params.tool_call_id or "call_unknown"
            args = params.arguments or {}
            logger.info(
                f"[AudioTiming] tool_started tool={llm_name} "
                f"callSessionId={context.call_session_id or 'none'} "
                f"deploymentId={context.deployment_id or 'none'}"
            )

            # Record tool call execution in transcript collector
            if context.transcript_collector:
                context.transcript_collector.record_tool_call(
                    tool_name=llm_name,
                    call_id=call_id,
                    args=args,
                    success=True,
                )

            try:
                if original_handler:
                    res = await original_handler(params)
                else:
                    res = {"success": True}
                t1 = time.perf_counter()
                duration_ms = round((t1 - t0) * 1000)
                if context.timing_tracker and hasattr(context.timing_tracker, "record_tool_execution"):
                    context.timing_tracker.record_tool_execution(
                        tool_name=llm_name,
                        start_time=t0,
                        end_time=t1,
                        success=True,
                        args=args if isinstance(args, dict) else None,
                    )
                logger.info(
                    f"[AudioTiming] tool_completed tool={llm_name} "
                    f"callSessionId={context.call_session_id or 'none'} "
                    f"durationMs={duration_ms}"
                )
                return res
            except Exception as exc:
                t1 = time.perf_counter()
                duration_ms = round((t1 - t0) * 1000)
                if context.timing_tracker and hasattr(context.timing_tracker, "record_tool_execution"):
                    context.timing_tracker.record_tool_execution(
                        tool_name=llm_name,
                        start_time=t0,
                        end_time=t1,
                        success=False,
                        args=args if isinstance(args, dict) else None,
                    )
                logger.warning(
                    f"[AudioTiming] tool_completed tool={llm_name} "
                    f"callSessionId={context.call_session_id or 'none'} "
                    f"durationMs={duration_ms} error=true ({exc})"
                )
                safe_failure = {
                    "success": False,
                    "error": "INTERNAL_TOOL_ERROR",
                    "message": "The requested action could not be completed at this time.",
                }
                try:
                    if params.result_callback:
                        await params.result_callback(safe_failure)
                except Exception:
                    pass
                return safe_failure

        return FunctionSchema(
            name=llm_name,
            description=raw_schema.description,
            properties=raw_schema.properties,
            required=raw_schema.required,
            handler=instrumented_handler,
        )


# Global singleton registry instance
tool_registry = ToolRegistry()
