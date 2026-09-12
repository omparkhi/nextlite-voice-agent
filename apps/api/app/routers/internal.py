import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth import require_worker
from ..schemas import RuntimeAgentConfig
from ..services.runtime_config_service import RuntimeAgentConfigService
from ..repositories import CallSessionRepository, AppointmentRepository, KnowledgeRepository
from ..models import CallStatus, CallDirection

router = APIRouter(prefix="/api/internal", tags=["internal"])

@router.get("/runtime-agent-config")
async def get_runtime_agent_config(
    deployment_id: Optional[str] = Query(None, alias="deploymentId"),
    phone_number: Optional[str] = Query(None, alias="phoneNumber"),
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    dep_uuid = uuid.UUID(deployment_id) if deployment_id else None
    service = RuntimeAgentConfigService(session)
    try:
        config = await service.resolve_runtime_config(
            deployment_id=dep_uuid,
            phone_number=phone_number
        )
        return config.model_dump(by_alias=True)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )

@router.post("/call-sessions", status_code=status.HTTP_201_CREATED)
async def create_call_session(
    payload: Dict[str, Any],
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    repo = CallSessionRepository(session)
    tenant_id = uuid.UUID(payload["tenantId"])
    agent_id = uuid.UUID(payload["agentId"]) if payload.get("agentId") else None
    dep_id = uuid.UUID(payload["deploymentId"]) if payload.get("deploymentId") else None

    from ..models import CallSession
    call = CallSession(
        tenantId=tenant_id,
        agentId=agent_id,
        deploymentId=dep_id,
        status=CallStatus(payload.get("status", "ACTIVE")),
        direction=CallDirection(payload.get("direction", "INBOUND")),
        callerPhoneNumber=payload.get("callerPhoneNumber"),
        recipientPhoneNumber=payload.get("recipientPhoneNumber")
    )
    await repo.create(call)
    await session.commit()
    return {"id": str(call.id), "status": call.status.value}

@router.patch("/call-sessions/{call_id}")
async def finalize_call_session(
    call_id: str,
    payload: Dict[str, Any],
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    repo = CallSessionRepository(session)
    call_uuid = uuid.UUID(call_id)
    status_enum = CallStatus(payload.get("status", "COMPLETED"))
    duration = int(payload.get("durationSeconds", 0))
    transcript = payload.get("transcript", [])
    metrics = payload.get("metricsJson", {})
    tools_used = payload.get("toolsUsed", [])

    finalized = await repo.finalize_call(
        call_id=call_uuid,
        status=status_enum,
        duration_seconds=duration,
        transcript=transcript,
        metrics_json=metrics,
        tools_used=tools_used
    )
    if not finalized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found")
    await session.commit()
    return {"id": str(finalized.id), "status": finalized.status.value}

@router.post("/tools/execute")
async def execute_tool(
    payload: Dict[str, Any],
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    from ..services.tool_execution_service import ToolExecutionService

    tool_name = payload.get("toolName") or payload.get("name")
    if not tool_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="toolName is required")

    tenant_id_str = payload.get("tenantId")
    if not tenant_id_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tenantId is required")

    tenant_id = uuid.UUID(tenant_id_str)
    agent_id = uuid.UUID(payload["agentId"]) if payload.get("agentId") else None
    call_session_id = uuid.UUID(payload["callSessionId"]) if payload.get("callSessionId") else None
    caller_phone = payload.get("callerPhoneNumber") or payload.get("customerPhone")
    arguments = payload.get("arguments") or payload.get("parameters") or {}

    service = ToolExecutionService(session)
    try:
        result = await service.execute_tool(
            tool_name=tool_name,
            arguments=arguments,
            trusted_tenant_id=tenant_id,
            trusted_agent_id=agent_id,
            trusted_caller_phone=caller_phone,
            call_session_id=call_session_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
