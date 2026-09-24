import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth import get_current_user_payload
from ..services.crm_service import CRMService
from ..services.template_service import TemplateService
from ..services.cache_service import invalidate_worker_cache

router = APIRouter(prefix="/api/client", tags=["client"])

# Templates
@router.get("/templates")
async def list_templates(
    industry: Optional[str] = None,
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    service = TemplateService(session)
    return await service.list_templates(industry=industry)

@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    service = TemplateService(session)
    tmpl = await service.get_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return tmpl

def resolve_tenant_id(payload: Dict[str, Any], query_tenant_id: Optional[str] = None) -> uuid.UUID:
    if payload.get("role") == "ADMIN" and query_tenant_id:
        return uuid.UUID(query_tenant_id)
    tenant_id_str = payload.get("tenantId")
    if not tenant_id_str:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tenant context")
    return uuid.UUID(tenant_id_str)

def require_mutation_role(payload: Dict[str, Any]):
    role = payload.get("role")
    if role not in ["ADMIN", "CLIENT_OWNER", "CLIENT_RECEPTIONIST"]:
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

@router.get("/calls/{call_id}/transcript")
async def get_call_transcript(
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
    return {
        "callId": call["id"],
        "status": call["status"],
        "durationSeconds": call["durationSeconds"],
        "transcriptText": call["transcriptText"],
        "turns": call["turnsJson"] or call["transcript"],
        "toolsUsed": call["toolsUsed"],
        "metrics": call["metricsJson"],
        "startedAt": call["startedAt"],
        "endedAt": call["endedAt"],
    }

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
    booked_by: Optional[str] = Query(None, alias="bookedBy"),
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    agent_uuid = uuid.UUID(agent_id) if agent_id else None
    return await service.list_appointments(tenant_id, limit, offset, agent_uuid, status_filter, booking_date, booked_by)

@router.get("/appointments/slots")
async def check_appointment_slots(
    booking_date: str = Query(..., alias="bookingDate"),
    phone: Optional[str] = Query(None),
    preferred_time: Optional[str] = Query(None, alias="preferredTime"),
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    return await service.check_slots(tenant_id, booking_date, phone, preferred_time)

@router.get("/appointments/{appointment_id}")
async def get_appointment(
    appointment_id: str,
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    try:
        appt_uuid = uuid.UUID(appointment_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid appointment ID")
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    appt = await service.get_appointment(appt_uuid, tenant_id)
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
    try:
        appt_uuid = uuid.UUID(appointment_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid appointment ID")
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    updated = await service.update_appointment(appt_uuid, tenant_id, body)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await invalidate_worker_cache()
    return updated

@router.post("/appointments/book", status_code=status.HTTP_201_CREATED)
async def create_client_appointment(
    body: Dict[str, Any],
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)

    customer_name = body.get("customerName") or body.get("patientName")
    customer_phone = body.get("customerPhone") or body.get("phone") or body.get("callerPhoneNumber")
    booking_date = body.get("bookingDate") or body.get("appointmentDate") or body.get("date")
    booking_time = body.get("bookingTime") or body.get("appointmentTime") or body.get("time")
    title = body.get("title") or body.get("serviceType") or body.get("reason") or "Consultation"
    resource_name = body.get("resourceName") or body.get("doctorName")
    booked_by = body.get("bookedBy") or ("RECEPTIONIST" if payload.get("role") in ["CLIENT_OWNER", "CLIENT_RECEPTIONIST"] else "MANUAL_CLIENT")
    booked_by_name = body.get("bookedByName") or payload.get("email") or "Client Staff"
    age = body.get("age")
    place = body.get("place") or body.get("location")
    walk_in = body.get("walkIn", True if booked_by == "RECEPTIONIST" else False)
    notes = body.get("notes") or body.get("reason")

    if not customer_name or not customer_phone or not booking_date or not booking_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="customerName, customerPhone, bookingDate, and bookingTime are required."
        )

    try:
        appt = await service.create_appointment(
            tenant_id=tenant_id,
            customer_name=customer_name,
            customer_phone=customer_phone,
            booking_date=booking_date,
            booking_time=booking_time,
            title=title,
            resource_name=resource_name,
            booked_by=booked_by,
            booked_by_name=booked_by_name,
            age=age,
            place=place,
            walk_in=walk_in,
            notes=notes,
            metadata=body.get("metadata", {})
        )
        await invalidate_worker_cache()
        return {"success": True, "appointment": appt}
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(val_err)
        )

@router.post("/appointments/reschedule")
async def reschedule_client_appointment(
    body: Dict[str, Any],
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)

    appointment_id_str = body.get("appointmentId")
    appointment_id = uuid.UUID(appointment_id_str) if appointment_id_str else None
    new_date = body.get("newDate") or body.get("bookingDate")
    new_time = body.get("newTime") or body.get("bookingTime")
    phone = body.get("phone") or body.get("customerPhone")
    reason = body.get("reason")

    if not new_date or not new_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="newDate and newTime are required to reschedule."
        )

    updated = await service.reschedule_appointment(
        tenant_id=tenant_id,
        new_date=new_date,
        new_time=new_time,
        appointment_id=appointment_id,
        phone=phone,
        reason=reason
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found to reschedule")
    await invalidate_worker_cache()
    return {"success": True, "appointment": updated}

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

# Receptionists Staff Management
@router.get("/receptionists")
async def list_receptionists(
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    receptionists = await service.list_receptionists(tenant_id)
    return {"receptionists": receptionists}

@router.post("/receptionists", status_code=status.HTTP_201_CREATED)
async def create_receptionist(
    body: Dict[str, Any],
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)

    name = body.get("name")
    email = body.get("email")
    password = body.get("password")

    if not name or not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name, email, and password are required to create a receptionist credential."
        )

    try:
        new_rec = await service.create_receptionist(tenant_id, name, email, password)
        return {"success": True, "receptionist": new_rec}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.patch("/receptionists/{user_id}")
async def update_receptionist(
    user_id: str,
    body: Dict[str, Any],
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)

    updated = await service.update_receptionist(
        tenant_id=tenant_id,
        user_id=uuid.UUID(user_id),
        name=body.get("name"),
        is_active=body.get("isActive"),
        password=body.get("password")
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receptionist account not found")
    return {"success": True, "receptionist": updated}

@router.delete("/receptionists/{user_id}")
async def delete_receptionist(
    user_id: str,
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)

    success = await service.delete_receptionist(tenant_id, uuid.UUID(user_id))
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receptionist account not found")
    return {"success": True, "message": "Receptionist credential removed successfully."}

@router.post("/reset-data")
async def reset_own_tenant_data(
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    service = CRMService(session)
    return await service.reset_tenant_data(tenant_id)


# Subscription & Usage (Module 2)
from ..services.subscription_service import SubscriptionService

@router.get("/subscription")
async def get_own_subscription_and_usage(
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    sub_service = SubscriptionService(session)
    return await sub_service.get_subscription_with_usage(tenant_id)



