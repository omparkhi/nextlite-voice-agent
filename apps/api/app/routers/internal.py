import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..db import get_db
from ..auth import require_worker
from ..schemas import RuntimeAgentConfig
from ..services.runtime_config_service import RuntimeAgentConfigService
from ..repositories import CallSessionRepository, AppointmentRepository, KnowledgeRepository
from ..models import CallStatus, CallDirection, Appointment, Lead, AppointmentStatus, LeadStatus, LeadPriority, Deployment

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

@router.get("/runtime-config/{deployment_id}")
async def get_runtime_config_by_path(
    deployment_id: str,
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    dep_uuid = uuid.UUID(deployment_id)
    service = RuntimeAgentConfigService(session)
    try:
        config = await service.resolve_runtime_config(deployment_id=dep_uuid)
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
    caller_num = payload.get("callerNumber") or payload.get("callerPhoneNumber")
    now = datetime.utcnow()
    call = CallSession(
        tenantId=tenant_id,
        agentId=agent_id,
        deploymentId=dep_id,
        roomName=payload.get("roomName", "default-room"),
        callerNumber=caller_num,
        direction=CallDirection(payload.get("direction", "INBOUND")),
        status=CallStatus(payload.get("status", "ACTIVE")),
        primaryLanguage=payload.get("primaryLanguage", "en-IN"),
        startedAt=now,
        createdAt=now
    )
    await repo.create(call)
    await session.commit()
    return {
        "id": str(call.id),
        "tenantId": str(call.tenantId),
        "agentId": str(call.agentId) if call.agentId else str(tenant_id),
        "deploymentId": str(call.deploymentId) if call.deploymentId else str(tenant_id),
        "roomName": call.roomName or "default-room",
        "callerNumber": call.callerNumber,
        "direction": call.direction.value if hasattr(call.direction, "value") else str(call.direction),
        "status": call.status.value if hasattr(call.status, "value") else str(call.status),
        "durationSeconds": call.durationSeconds or 0,
        "primaryLanguage": call.primaryLanguage or "en-IN",
        "startedAt": call.startedAt.isoformat() if call.startedAt else now.isoformat(),
        "endedAt": call.endedAt.isoformat() if call.endedAt else None,
        "transcriptText": call.transcriptText,
        "turnsJson": call.turnsJson or [],
        "toolsUsed": call.toolsUsed or [],
        "metricsJson": call.metricsJson or {},
        "createdAt": call.createdAt.isoformat() if call.createdAt else now.isoformat(),
    }

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
    transcript = payload.get("turnsJson") or payload.get("transcript", [])
    transcript_text = payload.get("transcriptText")
    metrics = payload.get("metricsJson", {})
    tools_used = payload.get("toolsUsed", [])

    finalized = await repo.finalize_call(
        call_id=call_uuid,
        status=status_enum,
        duration_seconds=duration,
        transcript=transcript,
        metrics_json=metrics,
        tools_used=tools_used,
        transcript_text=transcript_text
    )
    if not finalized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found")
    await session.commit()
    
    now_iso = datetime.utcnow().isoformat()
    return {
        "id": str(finalized.id),
        "tenantId": str(finalized.tenantId),
        "agentId": str(finalized.agentId) if finalized.agentId else str(finalized.tenantId),
        "deploymentId": str(finalized.deploymentId) if finalized.deploymentId else str(finalized.tenantId),
        "roomName": finalized.roomName or "default-room",
        "callerNumber": finalized.callerNumber,
        "direction": finalized.direction.value if hasattr(finalized.direction, "value") else str(finalized.direction),
        "status": finalized.status.value if hasattr(finalized.status, "value") else str(finalized.status),
        "durationSeconds": finalized.durationSeconds or duration,
        "primaryLanguage": finalized.primaryLanguage or "en-IN",
        "startedAt": finalized.startedAt.isoformat() if finalized.startedAt else now_iso,
        "endedAt": finalized.endedAt.isoformat() if finalized.endedAt else now_iso,
        "transcriptText": finalized.transcriptText or transcript_text,
        "turnsJson": finalized.turnsJson or transcript,
        "toolsUsed": finalized.toolsUsed or tools_used,
        "metricsJson": finalized.metricsJson or metrics,
        "createdAt": finalized.createdAt.isoformat() if finalized.createdAt else now_iso,
    }

@router.post("/appointments", status_code=status.HTTP_201_CREATED)
async def create_internal_appointment(
    payload: Dict[str, Any],
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    dep_id_str = payload.get("deploymentId")
    tenant_id_str = payload.get("tenantId")
    agent_id_str = payload.get("agentId")

    effective_tenant_id: Optional[uuid.UUID] = None
    effective_agent_id: Optional[uuid.UUID] = None

    if dep_id_str:
        dep_res = await session.execute(select(Deployment).where(Deployment.id == uuid.UUID(dep_id_str)))
        dep = dep_res.scalar_one_or_none()
        if dep:
            effective_tenant_id = dep.tenantId
            effective_agent_id = dep.agentId

    if not effective_tenant_id and tenant_id_str:
        effective_tenant_id = uuid.UUID(tenant_id_str)
    if not effective_agent_id and agent_id_str:
        effective_agent_id = uuid.UUID(agent_id_str)

    if not effective_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not determine tenantId for appointment")

    customer_name = payload.get("customerName") or payload.get("name")
    if not customer_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customerName is required")

    service_type = payload.get("title") or payload.get("serviceType") or payload.get("service") or "General Appointment"
    apt_date = payload.get("bookingDate") or payload.get("appointmentDate") or payload.get("date") or "Tomorrow"
    apt_time = payload.get("bookingTime") or payload.get("appointmentTime") or payload.get("time") or "10:00 AM"
    phone = payload.get("customerPhone") or payload.get("phone") or "+910000000000"
    call_session_id = uuid.UUID(payload["callSessionId"]) if payload.get("callSessionId") else None

    apt_repo = AppointmentRepository(session)
    apt_number = await apt_repo.get_next_appointment_number(effective_tenant_id)

    apt = Appointment(
        tenantId=effective_tenant_id,
        agentId=effective_agent_id,
        callSessionId=call_session_id,
        appointmentNumber=apt_number,
        customerName=customer_name,
        customerPhone=phone,
        title=service_type,
        resourceName=payload.get("resourceName"),
        bookingDate=apt_date,
        bookingTime=apt_time,
        status=AppointmentStatus.REQUESTED,
        notes=payload.get("notes")
    )
    await apt_repo.create(apt)
    await session.commit()

    return {
        "success": True,
        "id": str(apt.id),
        "appointmentNumber": apt_number,
        "status": "REQUESTED",
        "serviceType": service_type,
        "appointmentDate": apt_date,
        "appointmentTime": apt_time,
        "customerName": customer_name,
        "customerPhone": phone,
        "resourceName": payload.get("resourceName")
    }

@router.post("/leads", status_code=status.HTTP_201_CREATED)
async def create_internal_lead(
    payload: Dict[str, Any],
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    dep_id_str = payload.get("deploymentId")
    tenant_id_str = payload.get("tenantId")
    agent_id_str = payload.get("agentId")

    effective_tenant_id: Optional[uuid.UUID] = None
    effective_agent_id: Optional[uuid.UUID] = None

    if dep_id_str:
        dep_res = await session.execute(select(Deployment).where(Deployment.id == uuid.UUID(dep_id_str)))
        dep = dep_res.scalar_one_or_none()
        if dep:
            effective_tenant_id = dep.tenantId
            effective_agent_id = dep.agentId

    if not effective_tenant_id and tenant_id_str:
        effective_tenant_id = uuid.UUID(tenant_id_str)
    if not effective_agent_id and agent_id_str:
        effective_agent_id = uuid.UUID(agent_id_str)

    if not effective_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not determine tenantId for lead")

    customer_name = payload.get("customerName") or payload.get("name") or "Interested Caller"
    customer_phone = payload.get("customerPhone") or payload.get("phone") or "+910000000000"
    requirement = payload.get("requirement") or payload.get("notes") or "General Inquiry"
    call_session_id = uuid.UUID(payload["callSessionId"]) if payload.get("callSessionId") else None

    lead_number = f"LEAD-{str(uuid.uuid4())[:6].upper()}"
    lead = Lead(
        tenantId=effective_tenant_id,
        agentId=effective_agent_id,
        callSessionId=call_session_id,
        leadNumber=lead_number,
        customerName=customer_name,
        customerPhone=customer_phone,
        customerEmail=payload.get("customerEmail"),
        requirement=requirement,
        status=LeadStatus.NEW,
        priority=LeadPriority.MEDIUM,
        notes=payload.get("notes")
    )
    session.add(lead)
    await session.commit()

    return {
        "success": True,
        "id": str(lead.id),
        "leadNumber": lead_number,
        "status": "NEW",
        "customerName": customer_name,
        "customerPhone": customer_phone
    }

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

@router.post("/knowledge/retrieve")
async def retrieve_knowledge(
    payload: Dict[str, Any],
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    from ..services.knowledge_service import KnowledgeService

    dep_id_str = payload.get("deploymentId")
    tenant_id_str = payload.get("tenantId")
    agent_id_str = payload.get("agentId")
    query = payload.get("query")

    if not query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="query is required")

    effective_tenant_id: Optional[uuid.UUID] = None
    effective_agent_id: Optional[uuid.UUID] = None

    if dep_id_str:
        dep_res = await session.execute(select(Deployment).where(Deployment.id == uuid.UUID(dep_id_str)))
        dep = dep_res.scalar_one_or_none()
        if dep:
            effective_tenant_id = dep.tenantId
            effective_agent_id = dep.agentId

    if not effective_tenant_id and tenant_id_str:
        effective_tenant_id = uuid.UUID(tenant_id_str)
    if not effective_agent_id and agent_id_str:
        effective_agent_id = uuid.UUID(agent_id_str)

    if not effective_tenant_id or not effective_agent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tenantId and agentId or deploymentId are required"
        )

    top_k = int(payload.get("topK", 3))
    threshold = float(payload.get("scoreThreshold", 0.65))

    service = KnowledgeService(session)
    chunks = await service.retrieve_relevant_chunks(
        tenant_id=effective_tenant_id,
        agent_id=effective_agent_id,
        query=query,
        top_k=top_k,
        threshold=threshold
    )
    return {"results": chunks, "count": len(chunks)}
