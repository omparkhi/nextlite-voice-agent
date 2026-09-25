"""NextLite Pipecat Emergency & Call Transfer Tool.

Allows LLM to initiate live PSTN/SIP call transfer directly to the doctor or emergency line
when a true clinical emergency is verified.
"""

import asyncio
from typing import TYPE_CHECKING, Any, Dict, Optional
import httpx
from loguru import logger

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

if TYPE_CHECKING:
    from app.tools.tool_registry import ToolRuntimeContext

TRANSFER_CALL_TOOL_NAME = "transfer_call"

TRANSFER_CALL_TOOL_PROPERTIES: Dict[str, Any] = {
    "reason": {
        "type": "string",
        "description": "Specific clinical reason or symptom justifying emergency transfer (e.g. 'Severe continuous bleeding', 'Facial trauma', 'Unbearable pain')",
    },
    "patientName": {
        "type": "string",
        "description": "Optional patient name",
    },
    "severity": {
        "type": "string",
        "enum": ["CRITICAL", "EMERGENCY", "URGENT"],
        "description": "Severity level of the emergency",
    },
    "notes": {
        "type": "string",
        "description": "Optional brief clinical observations",
    },
}

TRANSFER_CALL_TOOL_REQUIRED: list = ["reason"]


def create_transfer_call_tool_factory(
    context: "ToolRuntimeContext",
    description_override: Optional[str] = None,
    on_transfer_call_callback: Optional[Any] = None,
    http_client: Optional[httpx.AsyncClient] = None,
) -> FunctionSchema:
    """Creates a native Pipecat FunctionSchema for transfer_call bound to trusted context."""
    desc = (
        description_override
        or "Transfer the ongoing phone call directly to the doctor or emergency staff when a true medical/dental emergency is verified (such as active severe bleeding, accidental trauma/fracture, or unbearable acute distress). Always speak a calming reassuring phrase in the caller's active language before invoking this tool."
    )

    async def handle_transfer_call(params: FunctionCallParams) -> Dict[str, Any]:
        args = params.arguments or {}
        reason = args.get("reason", "Medical/Clinical Emergency")
        patient_name = args.get("patientName") or "Caller"
        severity = args.get("severity") or "EMERGENCY"

        logger.warning(
            f"[TransferCallTool] LLM requested emergency call transfer | stream_id={getattr(context, 'deployment_id', 'unknown')} | "
            f"patient='{patient_name}' | severity='{severity}' | reason='{reason}'"
        )

        if context.transcript_collector:
            context.transcript_collector.record_tool_call(
                tool_name=TRANSFER_CALL_TOOL_NAME,
                call_id=getattr(params, "call_id", "transfer_call"),
                args=args,
                success=True,
            )

        target_phone = args.get("target_phone") or args.get("targetPhone") or args.get("phone")
        # Trigger transfer callback if registered on context
        if hasattr(context, "trigger_transfer_call") and callable(context.trigger_transfer_call):
            try:
                res = context.trigger_transfer_call(reason=reason, patient_name=patient_name, severity=severity, target_phone=target_phone)
                if asyncio.iscoroutine(res):
                    await res
            except Exception as e:
                logger.debug(f"[TransferCallTool] trigger_transfer_call notice: {e}")
        elif on_transfer_call_callback and callable(on_transfer_call_callback):
            try:
                res = on_transfer_call_callback(reason=reason, patient_name=patient_name, severity=severity, target_phone=target_phone)
                if asyncio.iscoroutine(res):
                    await res
            except Exception as e:
                logger.debug(f"[TransferCallTool] on_transfer_call_callback notice: {e}")

        transfer_result = {
            "success": True,
            "action": "TRANSFER",
            "message": "Live call transfer initiated. Please speak one short calming reassurance to the patient.",
            "reason": reason,
            "severity": severity,
        }

        if params.result_callback:
            from pipecat.frames.frames import FunctionCallResultProperties
            try:
                await params.result_callback(
                    transfer_result,
                    properties=FunctionCallResultProperties(run_llm=True),
                )
            except Exception as e:
                logger.debug(f"[TransferCallTool] result_callback notice: {e}")

        return transfer_result

    return FunctionSchema(
        name=TRANSFER_CALL_TOOL_NAME,
        description=desc,
        properties=TRANSFER_CALL_TOOL_PROPERTIES,
        required=TRANSFER_CALL_TOOL_REQUIRED,
        handler=handle_transfer_call,
    )
