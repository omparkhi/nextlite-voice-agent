import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from ..logging import logger
from ..db import get_db
from ..auth import require_worker
from ..schemas import RuntimeAgentConfig
from ..services.runtime_config_service import RuntimeAgentConfigService
from ..services.crm_service import CRMService, to_utc_iso
from ..repositories import CallSessionRepository, AppointmentRepository, KnowledgeRepository
from ..models import CallStatus, CallDirection, Appointment, Lead, AppointmentStatus, LeadStatus, LeadPriority, Deployment, Agent, AgentVersion
from ..domain.indic_normalizers import (
    normalize_indic_age,
    normalize_indic_time,
    sanitize_service_title,
    is_past_slot,
)
from ..domain.dynamic_schedule_engine import is_time_within_shifts, extract_business_schedule_from_version

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

@router.get("/deployments/active")
async def get_active_deployments(
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    """Returns list of active deployment IDs for worker cache pre-warming."""
    from ..models import DeploymentStatus
    stmt = select(Deployment.id).where(Deployment.status == DeploymentStatus.ACTIVE)
    res = await session.execute(stmt)
    active_ids = [str(d_id) for d_id in res.scalars().all()]
    return {"deployments": active_ids}

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
        "startedAt": to_utc_iso(call.startedAt) or to_utc_iso(now),
        "endedAt": to_utc_iso(call.endedAt),
        "transcriptText": call.transcriptText,
        "turnsJson": call.turnsJson or [],
        "toolsUsed": call.toolsUsed or [],
        "metricsJson": call.metricsJson or {},
        "createdAt": to_utc_iso(call.createdAt) or to_utc_iso(now),
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

    # ── Auto-sync CRM Lead for 100% Lead Capture ───────────────────────────
    try:
        existing_lead_res = await session.execute(
            select(Lead).where(Lead.callSessionId == call_uuid)
        )
        existing_lead = existing_lead_res.scalar_one_or_none()

        if not existing_lead and finalized.tenantId:
            # Check if an Appointment was booked during this call
            appt_res = await session.execute(
                select(Appointment).where(
                    Appointment.callSessionId == call_uuid,
                    Appointment.tenantId == finalized.tenantId
                ).order_by(desc(Appointment.createdAt)).limit(1)
            )
            appt = appt_res.scalar_one_or_none()

            raw_phone = finalized.callerNumber or "+910000000000"
            lead_num = f"LEAD-{str(uuid.uuid4())[:6].upper()}"

            if appt:
                # Scenario A: Appointment Booked -> High Priority Qualified Lead
                lead = Lead(
                    tenantId=finalized.tenantId,
                    agentId=finalized.agentId,
                    callSessionId=call_uuid,
                    leadNumber=lead_num,
                    customerName=appt.customerName or "Appointment Patient",
                    customerPhone=appt.customerPhone or raw_phone,
                    requirement=f"Appointment Booked: {appt.title} on {appt.bookingDate} at {appt.bookingTime}",
                    status=LeadStatus.QUALIFIED,
                    priority=LeadPriority.HIGH,
                    notes=appt.notes or (transcript_text[:500] if transcript_text else None)
                )
                session.add(lead)
            elif duration > 0 or transcript_text or (isinstance(transcript, list) and len(transcript) > 0):
                # Scenario B: Inquiry Call -> Capture Lead with inquiry context
                req_summary = "General Voice Inquiry"
                if transcript_text and transcript_text.strip():
                    lines = [ln.strip() for ln in transcript_text.split("\n") if ln.strip()]
                    user_lines = [ln for ln in lines if ln.lower().startswith("user:") or ln.lower().startswith("caller:")]
                    if user_lines:
                        first_q = user_lines[0].split(":", 1)[-1].strip()
                        if len(first_q) >= 4:
                            req_summary = f"Inquiry: {first_q[:200]}"
                    elif len(lines) > 0:
                        first_q = lines[0].split(":", 1)[-1].strip()
                        req_summary = f"Inquiry: {first_q[:200]}"
                elif isinstance(transcript, list) and len(transcript) > 0:
                    user_turns = [t for t in transcript if isinstance(t, dict) and t.get("role") in ("user", "caller")]
                    if user_turns:
                        first_q = str(user_turns[0].get("text") or user_turns[0].get("content") or "").strip()
                        if len(first_q) >= 4:
                            req_summary = f"Inquiry: {first_q[:200]}"

                cust_name = "Inquiry Caller"
                if raw_phone and len(raw_phone) >= 4 and raw_phone != "+910000000000":
                    cust_name = f"Inquiry Caller ({raw_phone[-4:]})"

                lead = Lead(
                    tenantId=finalized.tenantId,
                    agentId=finalized.agentId,
                    callSessionId=call_uuid,
                    leadNumber=lead_num,
                    customerName=cust_name,
                    customerPhone=raw_phone,
                    requirement=req_summary,
                    status=LeadStatus.NEW,
                    priority=LeadPriority.MEDIUM,
                    notes=transcript_text[:500] if transcript_text else None
                )
                session.add(lead)

    except Exception as lead_sync_err:
        logger.warning(f"[Lead Ingestion] Auto-sync CRM lead notice for call {call_id}: {lead_sync_err}")

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
        "startedAt": to_utc_iso(finalized.startedAt) or now_iso,
        "endedAt": to_utc_iso(finalized.endedAt) or now_iso,
        "transcriptText": finalized.transcriptText or transcript_text,
        "turnsJson": finalized.turnsJson or transcript,
        "toolsUsed": finalized.toolsUsed or tools_used,
        "metricsJson": finalized.metricsJson or metrics,
        "createdAt": to_utc_iso(finalized.createdAt) or now_iso,
    }

@router.post("/appointments", status_code=status.HTTP_201_CREATED)
async def create_internal_appointment(
    payload: Dict[str, Any],
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    dep_id_str = payload.get("deploymentId") or payload.get("deployment_id")
    tenant_id_str = payload.get("tenantId") or payload.get("tenant_id")
    agent_id_str = payload.get("agentId") or payload.get("agent_id")

    effective_tenant_id: Optional[uuid.UUID] = None
    effective_agent_id: Optional[uuid.UUID] = None

    if tenant_id_str:
        effective_tenant_id = uuid.UUID(str(tenant_id_str))
    if agent_id_str:
        effective_agent_id = uuid.UUID(str(agent_id_str))

    if (not effective_tenant_id or not effective_agent_id) and dep_id_str:
        dep_res = await session.execute(select(Deployment).where(Deployment.id == uuid.UUID(str(dep_id_str))))
        dep = dep_res.scalar_one_or_none()
        if dep:
            if not effective_tenant_id:
                effective_tenant_id = dep.tenantId
            if not effective_agent_id:
                effective_agent_id = dep.agentId

    if not effective_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not determine tenantId for appointment")

    customer_name = payload.get("customerName") or payload.get("customer_name") or payload.get("name")
    if not customer_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="customerName is required")

    raw_service = payload.get("title") or payload.get("serviceType") or payload.get("service_type") or payload.get("service")
    service_type = sanitize_service_title(raw_service)
    apt_date = payload.get("bookingDate") or payload.get("booking_date") or payload.get("appointmentDate") or payload.get("date") or "Tomorrow"
    raw_time = payload.get("bookingTime") or payload.get("booking_time") or payload.get("appointmentTime") or payload.get("time") or "10:00 AM"
    apt_time = normalize_indic_time(raw_time)
    phone = payload.get("customerPhone") or payload.get("customer_phone") or payload.get("phone")
    call_session_id = uuid.UUID(str(payload["callSessionId"])) if payload.get("callSessionId") else (uuid.UUID(str(payload["call_session_id"])) if payload.get("call_session_id") else None)

    # Temporal validation: Reject slots in the past
    if is_past_slot(apt_date, apt_time, time_zone="Asia/Kolkata", buffer_minutes=0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot book appointment for past time slot '{apt_time}' on {apt_date}."
        )

    # Shift validation: Reject slots outside operational shifts / during break
    business_hours = payload.get("businessHours")
    if not business_hours and effective_tenant_id:
        biz_hours_query = await session.execute(
            select(AgentVersion.configuration).join(Agent, Agent.id == AgentVersion.agentId)
            .where(Agent.tenantId == effective_tenant_id)
            .order_by(AgentVersion.versionNumber.desc())
            .limit(1)
        )
        cfg_json = biz_hours_query.scalar_one_or_none()
        if cfg_json and isinstance(cfg_json, dict):
            b_h, _, _ = extract_business_schedule_from_version(cfg_json)
            business_hours = b_h

    if business_hours and not is_time_within_shifts(apt_time, business_hours):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Requested slot '{apt_time}' falls during closed/break hours in configured schedule: {business_hours}."
        )

    # Inherit caller phone number from active CallSession if phone is missing or dummy
    if (not phone or phone == "+910000000000") and call_session_id:
        cs_res = await session.execute(select(CallSession).where(CallSession.id == call_session_id))
        cs = cs_res.scalar_one_or_none()
        if cs and cs.callerNumber and cs.callerNumber != "none" and cs.callerNumber != "+910000000000":
            phone = cs.callerNumber

    if not phone:
        phone = "+910000000000"

    # Handle age, place/location details
    raw_age = payload.get("age")
    age = normalize_indic_age(raw_age)
    place = payload.get("place") or payload.get("location")
    raw_notes = payload.get("notes")

    meta = dict(payload.get("metadata") or {})
    detail_notes = []
    if age is not None and str(age).strip():
        meta["age"] = str(age).strip()
        detail_notes.append(f"Age: {str(age).strip()}")
    if place and str(place).strip():
        meta["place"] = str(place).strip()
        meta["location"] = str(place).strip()
        detail_notes.append(f"Place: {str(place).strip()}")
    if raw_notes and str(raw_notes).strip():
        detail_notes.append(str(raw_notes).strip())
    combined_notes = "; ".join(detail_notes) if detail_notes else None

    # Check for session-level deduplication to prevent duplicate rows within the same call session
    if call_session_id:
        existing_cs_res = await session.execute(
            select(Appointment).where(
                Appointment.callSessionId == call_session_id,
                Appointment.tenantId == effective_tenant_id,
                Appointment.status.in_([
                    AppointmentStatus.SCHEDULED,
                    AppointmentStatus.REQUESTED,
                ])
            )
        )
        existing_cs_appt = existing_cs_res.scalars().first()
        if existing_cs_appt:
            existing_cs_appt.customerName = customer_name
            existing_cs_appt.customerPhone = phone
            existing_cs_appt.title = service_type
            existing_cs_appt.bookingDate = apt_date
            existing_cs_appt.bookingTime = apt_time
            if age is not None and str(age).strip():
                existing_cs_appt.age = str(age).strip()
            if place and str(place).strip():
                existing_cs_appt.place = str(place).strip()
            existing_cs_appt.notes = combined_notes
            existing_cs_appt.metadataJson = meta
            existing_cs_appt.updatedAt = datetime.utcnow()
            await session.commit()
            return {
                "success": True,
                "id": str(existing_cs_appt.id),
                "appointmentNumber": existing_cs_appt.appointmentNumber,
                "status": "SCHEDULED",
                "serviceType": service_type,
                "appointmentDate": apt_date,
                "appointmentTime": apt_time,
                "customerName": customer_name,
                "customerPhone": phone,
                "resourceName": existing_cs_appt.resourceName,
                "bookedBy": existing_cs_appt.bookedBy,
                "isUpdated": True
            }

    def _norm_time(t: str) -> str:
        if not t:
            return ""
        return normalize_indic_time(t).strip().upper()

    norm_target_time = _norm_time(apt_time)

    # Resolve dynamic capacity for tenant
    patients_per_slot = payload.get("patientsPerSlot") or payload.get("patients_per_slot") or payload.get("slotCapacity")
    if patients_per_slot is None and effective_tenant_id:
        biz_hours_query = await session.execute(
            select(AgentVersion.configuration).join(Agent, Agent.id == AgentVersion.agentId)
            .where(Agent.tenantId == effective_tenant_id)
            .order_by(AgentVersion.versionNumber.desc())
            .limit(1)
        )
        cfg_json = biz_hours_query.scalar_one_or_none()
        if cfg_json and isinstance(cfg_json, dict):
            _, _, p_s = extract_business_schedule_from_version(cfg_json)
            patients_per_slot = p_s

    effective_capacity = max(1, int(patients_per_slot or 1))

    # =========================================================================
    # ATOMIC CONCURRENCY GUARANTEE: PostgreSQL Transaction-Scoped Advisory Lock
    # Locks strictly the deterministic tuple (tenant_id, booking_date, normalized_slot)
    # Guarantees serialization even when ZERO rows exist for the slot.
    # =========================================================================
    try:
        tenant_key_str = str(effective_tenant_id)
        slot_key_str = f"{apt_date}:{norm_target_time}"
        from sqlalchemy import func
        await session.execute(
            select(func.pg_advisory_xact_lock(
                func.hashtext(tenant_key_str),
                func.hashtext(slot_key_str)
            ))
        )
    except Exception as lock_err:
        logger.debug(f"[InternalAPI] Advisory lock notice: {lock_err}")

    # Slot Capacity Check inside the transaction lock
    existing_slot_res = await session.execute(
        select(Appointment).where(
            Appointment.tenantId == effective_tenant_id,
            Appointment.bookingDate == apt_date,
            Appointment.status.in_([
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.REQUESTED,
            ])
        )
    )
    matching_appts = [
        existing for existing in existing_slot_res.scalars().all()
        if _norm_time(existing.bookingTime) == norm_target_time
    ]

    if len(matching_appts) >= effective_capacity:
        patient_list_str = ", ".join([f"'{a.customerName}' ({a.appointmentNumber})" for a in matching_appts])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Slot {apt_time} on {apt_date} has reached full capacity ({len(matching_appts)}/{effective_capacity} patients: {patient_list_str})."
        )

    apt_repo = AppointmentRepository(session)
    apt_number = await apt_repo.get_next_appointment_number(effective_tenant_id)
    booked_by = payload.get("bookedBy") or "AGENT"
    booked_by_name = payload.get("bookedByName") or ("AI Voice Assistant" if booked_by == "AGENT" else "Receptionist")
    walk_in = bool(payload.get("walkIn", False))

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
        status=AppointmentStatus.SCHEDULED,
        bookedBy=booked_by,
        bookedByName=booked_by_name,
        age=str(age).strip() if (age is not None and str(age).strip()) else None,
        place=str(place).strip() if (place and str(place).strip()) else None,
        walkIn=walk_in,
        notes=combined_notes,
        metadataJson=meta
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
        "bookedBy": booked_by,
        "bookedByName": booked_by_name,
        "resourceName": payload.get("resourceName")
    }


@router.get("/appointments/check-slots")
async def check_internal_appointment_slots(
    request: Request,
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    params = dict(request.query_params)
    effective_dep_id = params.get("deploymentId") or params.get("deployment_id")
    effective_tenant_id_str = params.get("tenantId") or params.get("tenant_id")
    effective_booking_date = params.get("bookingDate") or params.get("booking_date") or params.get("date") or "Tomorrow"
    effective_phone = params.get("phone") or params.get("customerPhone") or params.get("customer_phone")
    effective_pref_time = params.get("preferredTime") or params.get("preferred_time") or params.get("time")
    effective_biz_hours = params.get("businessHours") or params.get("business_hours")
    effective_slot_dur = params.get("slotDuration") or params.get("slot_duration")
    raw_pps = params.get("patientsPerSlot") or params.get("patients_per_slot") or params.get("slotCapacity")
    effective_patients_per_slot = int(raw_pps) if raw_pps is not None and str(raw_pps).strip() else None

    effective_tenant_id = None
    if effective_dep_id:
        dep_res = await session.execute(select(Deployment).where(Deployment.id == uuid.UUID(str(effective_dep_id))))
        dep = dep_res.scalar_one_or_none()
        if dep:
            effective_tenant_id = dep.tenantId
    elif effective_tenant_id_str:
        effective_tenant_id = uuid.UUID(str(effective_tenant_id_str))

    if not effective_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="deploymentId or tenantId required")

    crm_service = CRMService(session)
    return await crm_service.check_slots(
        tenant_id=effective_tenant_id,
        booking_date=effective_booking_date,
        phone=effective_phone,
        preferred_time=effective_pref_time,
        business_hours=effective_biz_hours,
        slot_duration=effective_slot_dur,
        patients_per_slot=effective_patients_per_slot,
    )


@router.post("/appointments/reschedule")
async def reschedule_internal_appointment(
    payload: Dict[str, Any],
    authenticated: bool = Depends(require_worker),
    session: AsyncSession = Depends(get_db)
):
    dep_id_str = payload.get("deploymentId")
    tenant_id_str = payload.get("tenantId")
    effective_tenant_id = None
    if dep_id_str:
        dep_res = await session.execute(select(Deployment).where(Deployment.id == uuid.UUID(dep_id_str)))
        dep = dep_res.scalar_one_or_none()
        if dep:
            effective_tenant_id = dep.tenantId
    elif tenant_id_str:
        effective_tenant_id = uuid.UUID(tenant_id_str)

    if not effective_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="deploymentId or tenantId required")

    new_date = payload.get("newBookingDate") or payload.get("bookingDate") or payload.get("date")
    new_time = payload.get("newBookingTime") or payload.get("bookingTime") or payload.get("time")
    if not new_date or not new_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="newBookingDate and newBookingTime are required")

    phone = payload.get("customerPhone") or payload.get("phone")
    appt_id_str = payload.get("appointmentId")
    appt_uuid = uuid.UUID(appt_id_str) if appt_id_str else None
    reason = payload.get("reason")

    crm_service = CRMService(session)
    updated = await crm_service.reschedule_appointment(
        tenant_id=effective_tenant_id,
        new_date=new_date,
        new_time=new_time,
        appointment_id=appt_uuid,
        phone=phone,
        reason=reason,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active appointment found to reschedule")

    return {
        "success": True,
        "appointment": updated,
        "message": f"Appointment rescheduled to {new_date} at {new_time}"
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
    threshold = float(payload.get("scoreThreshold", 0.20))

    service = KnowledgeService(session)
    chunks = await service.retrieve_relevant_chunks(
        tenant_id=effective_tenant_id,
        agent_id=effective_agent_id,
        query=query,
        top_k=top_k,
        threshold=threshold
    )
    return {"results": chunks, "count": len(chunks)}
