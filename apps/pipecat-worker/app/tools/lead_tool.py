"""NextLite Pipecat Create Callback Lead Tool.

Ports generic lead creation behavior from LiveKit worker to Pipecat native tool calling.
Connects strictly to NextLite Control Plane internal API (POST /api/internal/leads).

Security & Boundary Rules:
- deploymentId and callSessionId are injected exclusively from trusted ToolRuntimeContext.
- LLM cannot provide or override tenantId, agentId, deploymentId, or callSessionId.
- If customerPhone is omitted, falls back to trusted context.caller_phone.
- Never accesses PostgreSQL directly.
- Never generates lead IDs in Pipecat.
- Structured success or failure is returned to the LLM to prevent hallucinations.
"""

from typing import TYPE_CHECKING, Any, Callable, Dict, Optional
import httpx
from loguru import logger

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

from app.turn_timing import log_phone_trace

if TYPE_CHECKING:
    from app.tools.tool_registry import ToolRuntimeContext

CREATE_CALLBACK_LEAD_TOOL_NAME = "create_callback_lead"

LEAD_TOOL_PROPERTIES: Dict[str, Any] = {
    "customerName": {
        "type": "string",
        "description": "Customer full name",
    },
    "customerPhone": {
        "type": "string",
        "description": "Contact phone if provided",
    },
    "notes": {
        "type": "string",
        "description": "Callback notes",
    },
}

LEAD_TOOL_REQUIRED = ["customerName"]


def create_callback_lead_tool_factory(
    context: "ToolRuntimeContext",
    description_override: Optional[str] = None,
    http_client: Optional[httpx.AsyncClient] = None,
) -> FunctionSchema:
    """Creates a native Pipecat FunctionSchema for create_callback_lead bound to trusted context."""
    if not context.deployment_id or not context.deployment_id.strip():
        raise ValueError("[LeadTool] deployment_id is required in ToolRuntimeContext")

    trusted_deployment_id = context.deployment_id.strip()

    base_url = (context.api_url or "http://localhost:3001").rstrip("/")
    worker_secret = context.worker_secret or "dev-worker-api-secret"
    api_endpoint = f"{base_url}/api/internal/leads"

    tool_description = (
        description_override.strip()
        if description_override and description_override.strip()
        else "Record a callback request or lead when the customer asks for follow-up."
    )

    async def handle_create_callback_lead(params: FunctionCallParams) -> Dict[str, Any]:
        await context.ensure_call_session_id()
        trusted_call_session_id = context.call_session_id.strip() if context.call_session_id else None
        trusted_caller_phone = context.caller_phone.strip() if context.caller_phone else None

        raw_args = params.arguments or {}
        if not isinstance(raw_args, dict):
            failure_result = {
                "success": False,
                "error": "INVALID_ARGUMENTS",
                "message": "Invalid callback request details: arguments must be a JSON object.",
            }
            if params.result_callback:
                await params.result_callback(failure_result)
            return failure_result

        # 1. Validate customerName
        raw_name = raw_args.get("customerName")
        if not raw_name or not isinstance(raw_name, str) or not raw_name.strip():
            failure_result = {
                "success": False,
                "error": "INVALID_ARGUMENTS",
                "message": "Customer name is required to record a callback request.",
            }
            if params.result_callback:
                await params.result_callback(failure_result)
            return failure_result

        customer_name = raw_name.strip()
        if len(customer_name) > 255:
            failure_result = {
                "success": False,
                "error": "INVALID_ARGUMENTS",
                "message": "Customer name exceeds 255 characters.",
            }
            if params.result_callback:
                await params.result_callback(failure_result)
            return failure_result

        # 2. Resolve caller phone: supplied customerPhone > trusted callerPhone fallback
        raw_phone = raw_args.get("customerPhone")
        turn_id = context.timing_tracker.active_turn_id if context.timing_tracker else "unknown"
        log_phone_trace("tool_argument_received", turn_id, raw_phone)

        effective_phone: Optional[str] = None
        if raw_phone and isinstance(raw_phone, str) and raw_phone.strip():
            effective_phone = raw_phone.strip()
        elif trusted_caller_phone:
            effective_phone = trusted_caller_phone

        log_phone_trace("control_plane_payload", turn_id, effective_phone)

        if not effective_phone:
            failure_result = {
                "success": False,
                "error": "INVALID_ARGUMENTS",
                "message": (
                    "Customer phone number is required to record a callback request. "
                    "Please ask the caller for their contact phone number."
                ),
            }
            if params.result_callback:
                await params.result_callback(failure_result)
            return failure_result

        # 3. Assemble API payload strictly with trusted identity fields
        payload: Dict[str, Any] = {
            "deploymentId": trusted_deployment_id,
            "customerName": customer_name,
            "customerPhone": effective_phone,
        }
        if trusted_call_session_id:
            payload["callSessionId"] = trusted_call_session_id

        raw_email = raw_args.get("customerEmail")
        if raw_email and isinstance(raw_email, str) and raw_email.strip():
            payload["customerEmail"] = raw_email.strip()

        raw_category = raw_args.get("interestCategory")
        if raw_category and isinstance(raw_category, str) and raw_category.strip():
            payload["interestCategory"] = raw_category.strip()

        raw_notes = raw_args.get("notes")
        if raw_notes and isinstance(raw_notes, str) and raw_notes.strip():
            payload["notes"] = raw_notes.strip()

        raw_meta = raw_args.get("metadata")
        if raw_meta and isinstance(raw_meta, dict) and len(raw_meta) > 0:
            payload["metadata"] = raw_meta

        headers = {
            "x-worker-secret": worker_secret,
            "Authorization": f"Bearer {worker_secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        # 4. Perform authenticated HTTP call to NextLite Control Plane
        result: Dict[str, Any]
        try:
            if http_client:
                response = await http_client.post(
                    api_endpoint,
                    json=payload,
                    headers=headers,
                    timeout=4.0,
                )
            else:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    response = await client.post(
                        api_endpoint,
                        json=payload,
                        headers=headers,
                    )

            if response.status_code in (200, 201):
                resp_json = response.json() if response.content else {}
                lead_id = resp_json.get("id", "lead-created")
                result = {
                    "success": True,
                    "leadId": lead_id,
                    "message": "Callback request recorded successfully. Our team will contact the customer.",
                }
            else:
                err_data: Dict[str, Any] = {}
                try:
                    err_data = response.json()
                except Exception:
                    pass

                status = response.status_code
                error_code = err_data.get("code") or (
                    "UNAUTHORIZED" if status == 401
                    else "DEPLOYMENT_NOT_FOUND" if status == 404
                    else "DEPLOYMENT_INACTIVE" if status == 409
                    else "LEAD_CREATION_FAILED"
                )
                logger.warning(
                    f"[LeadTool] API returned status {status} for lead creation: {err_data.get('error') or err_data.get('message')}"
                )
                result = {
                    "success": False,
                    "error": error_code,
                    "message": "Unable to record the callback request at this time. Please try again later.",
                }
        except httpx.TimeoutException:
            logger.warning("[LeadTool] Timeout connecting to leads API")
            result = {
                "success": False,
                "error": "SERVICE_UNAVAILABLE",
                "message": "Unable to record the callback request due to a temporary network timeout. Please try again later.",
            }
        except Exception as err:
            logger.warning(f"[LeadTool] Failed to connect to leads API: {err}")
            result = {
                "success": False,
                "error": "CONNECTION_ERROR",
                "message": "Unable to record the callback request due to a temporary network issue. Please try again later.",
            }

        # 5. Deliver result to Pipecat LLM callback
        if params.result_callback:
            await params.result_callback(result)

        return result

    return FunctionSchema(
        name=CREATE_CALLBACK_LEAD_TOOL_NAME,
        description=tool_description,
        properties=LEAD_TOOL_PROPERTIES,
        required=LEAD_TOOL_REQUIRED,
        handler=handle_create_callback_lead,
    )
