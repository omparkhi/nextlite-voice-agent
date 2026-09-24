"""NextLite Pipecat End Call Tool.

Allows LLM to gracefully terminate a phone call session when the objective is complete.
"""

import asyncio
from typing import TYPE_CHECKING, Any, Dict, Optional
import httpx
from loguru import logger

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

if TYPE_CHECKING:
    from app.tools.tool_registry import ToolRuntimeContext

END_CALL_TOOL_NAME = "end_call"

END_CALL_TOOL_PROPERTIES: Dict[str, Any] = {
    "reason": {
        "type": "string",
        "description": "Optional reason for concluding the call (e.g. 'objective_completed', 'caller_said_bye', 'appointment_booked')",
    },
}

END_CALL_TOOL_REQUIRED: list = []


def create_end_call_tool_factory(
    context: "ToolRuntimeContext",
    description_override: Optional[str] = None,
    on_end_call_callback: Optional[Any] = None,
    http_client: Optional[httpx.AsyncClient] = None,
) -> FunctionSchema:
    """Creates a native Pipecat FunctionSchema for end_call bound to trusted context."""
    desc = (
        description_override
        or "Politely terminate and disconnect the PSTN phone call when the conversation is finished, the caller says goodbye, thanks you, or states they will call later. You MUST invoke this tool whenever delivering your final closing farewell to hang up the phone call."
    )

    async def handle_end_call(params: FunctionCallParams) -> Dict[str, Any]:
        args = params.arguments or {}
        reason = args.get("reason", "Conversation completed")
        logger.info(
            f"[EndCallTool] LLM requested call termination | stream_id={getattr(context, 'deployment_id', 'unknown')} | reason='{reason}'"
        )

        if context.transcript_collector:
            context.transcript_collector.record_tool_call(
                tool_name=END_CALL_TOOL_NAME,
                call_id=getattr(params, "call_id", "end_call"),
                args=args,
                success=True,
            )

        if hasattr(context, "trigger_end_call") and callable(context.trigger_end_call):
            try:
                res = context.trigger_end_call(reason=reason)
                if asyncio.iscoroutine(res):
                    await res
            except Exception as e:
                logger.debug(f"[EndCallTool] trigger_end_call notice: {e}")
        elif on_end_call_callback and callable(on_end_call_callback):
            try:
                res = on_end_call_callback(reason=reason)
                if asyncio.iscoroutine(res):
                    await res
            except Exception as e:
                logger.debug(f"[EndCallTool] on_end_call_callback notice: {e}")

        closing_result = {
            "success": True,
            "action": "HANGUP",
            "message": "Call termination scheduled upon completion of closing turn.",
            "reason": reason,
        }

        if params.result_callback:
            from pipecat.frames.frames import FunctionCallResultProperties
            try:
                await params.result_callback(
                    closing_result,
                    properties=FunctionCallResultProperties(run_llm=True),
                )
            except Exception as e:
                logger.debug(f"[EndCallTool] result_callback notice: {e}")

        return closing_result

    return FunctionSchema(
        name=END_CALL_TOOL_NAME,
        description=desc,
        properties=END_CALL_TOOL_PROPERTIES,
        required=END_CALL_TOOL_REQUIRED,
        handler=handle_end_call,
    )
