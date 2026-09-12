import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth import get_current_user_payload
from ..services.crm_service import CRMService

router = APIRouter(prefix="/api/client", tags=["client"])

def resolve_tenant_id(payload: Dict[str, Any], query_tenant_id: Optional[str] = None) -> uuid.UUID:
    if payload.get("role") == "ADMIN" and query_tenant_id:
        return uuid.UUID(query_tenant_id)
    tenant_id_str = payload.get("tenantId")
    if not tenant_id_str:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tenant context")
    return uuid.UUID(tenant_id_str)

def require_mutation_role(payload: Dict[str, Any]):
    role = payload.get("role")
    if role not in ["ADMIN", "CLIENT_OWNER"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: Read-only access for CLIENT_VIEWER")

# Profile
@router.get("/profile")
async def get_profile(
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    profile = await service.get_client_profile(tenant_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return profile

@router.put("/profile")
async def update_profile(
    body: Dict[str, Any],
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    if "businessName" in body and body["businessName"]:
        await service.update_client_profile(tenant_id, body["businessName"])
    return {"message": "Profile updated successfully"}

# Calls
@router.get("/calls")
async def list_calls(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    agent_id: Optional[str] = Query(None, alias="agentId"),
    status_filter: Optional[str] = Query(None, alias="status"),
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    agent_uuid = uuid.UUID(agent_id) if agent_id else None
    return await service.list_call_sessions(tenant_id, limit, offset, agent_uuid, status_filter)

@router.get("/calls/{call_id}")
async def get_call(
    call_id: str,
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    call = await service.get_call_session(uuid.UUID(call_id), tenant_id)
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found")
    return call

# Leads
@router.get("/leads")
async def list_leads(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    agent_id: Optional[str] = Query(None, alias="agentId"),
    status_filter: Optional[str] = Query(None, alias="status"),
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    agent_uuid = uuid.UUID(agent_id) if agent_id else None
    return await service.list_leads(tenant_id, limit, offset, agent_uuid, status_filter)

@router.get("/leads/{lead_id}")
async def get_lead(
    lead_id: str,
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    lead = await service.get_lead(uuid.UUID(lead_id), tenant_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return lead

@router.patch("/leads/{lead_id}")
async def update_lead(
    lead_id: str,
    body: Dict[str, Any],
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    updated = await service.update_lead(uuid.UUID(lead_id), tenant_id, body)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return updated

# Appointments
@router.get("/appointments")
async def list_appointments(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    agent_id: Optional[str] = Query(None, alias="agentId"),
    status_filter: Optional[str] = Query(None, alias="status"),
    booking_date: Optional[str] = Query(None, alias="bookingDate"),
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    agent_uuid = uuid.UUID(agent_id) if agent_id else None
    return await service.list_appointments(tenant_id, limit, offset, agent_uuid, status_filter, booking_date)

@router.get("/appointments/{appointment_id}")
async def get_appointment(
    appointment_id: str,
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    appt = await service.get_appointment(uuid.UUID(appointment_id), tenant_id)
    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    return appt

@router.patch("/appointments/{appointment_id}")
async def update_appointment(
    appointment_id: str,
    body: Dict[str, Any],
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    updated = await service.update_appointment(uuid.UUID(appointment_id), tenant_id, body)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    return updated

# Phone Numbers
@router.get("/phone-numbers")
async def list_phone_numbers(
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    numbers = await service.list_phone_numbers(tenant_id)
    return {"phoneNumbers": numbers}

# Follow-ups & WhatsApp
@router.get("/follow-ups")
async def list_follow_ups(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None, alias="status"),
    channel: Optional[str] = Query(None),
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    return await service.list_follow_ups(tenant_id, limit, offset, status_filter, channel)

@router.get("/follow-ups/{follow_up_id}")
async def get_follow_up(
    follow_up_id: str,
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    rec = await service.get_follow_up(uuid.UUID(follow_up_id), tenant_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up not found")
    return rec

@router.post("/follow-ups/send-whatsapp")
async def send_whatsapp(
    body: Dict[str, Any],
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    return await service.send_whatsapp(tenant_id, body)

# Analytics
@router.get("/analytics/overview")
async def get_analytics_overview(
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    return await service.get_analytics_overview(tenant_id)
