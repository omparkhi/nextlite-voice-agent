import uuid
import re
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..logging import logger
from ..db import get_db
from ..services.crm_service import CRMService
from ..models import Tenant, Agent, Appointment, AppointmentStatus, Lead, LeadStatus

router = APIRouter(prefix="/api/v1/integrations/whatsapp", tags=["whatsapp-integration"])

# Standard Clinic Daily Slots (Fallback list if tenant config not specified)
DEFAULT_CLINIC_SLOTS = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM", "08:00 PM"
]


class WhatsAppBookingRequest(BaseModel):
    tenantId: Optional[str] = Field(None, description="Tenant UUID if provided")
    customerName: str = Field(..., description="Customer full name")
    customerPhone: str = Field(..., description="Customer WhatsApp phone number")
    bookingDate: str = Field(..., description="Date (YYYY-MM-DD or friendly format like Today/Tomorrow)")
    bookingTime: str = Field(..., description="Time slot (e.g. '06:30 PM' or '6:30 PM')")
    title: Optional[str] = Field("WhatsApp Consultation", description="Appointment title/service")
    age: Optional[str] = Field(None, description="Patient age if provided")
    place: Optional[str] = Field(None, description="Patient city/place if provided")
    notes: Optional[str] = Field(None, description="Additional notes or chat transcript")


class WhatsAppCancelRequest(BaseModel):
    tenantId: Optional[str] = None
    appointmentId: Optional[str] = None
    customerPhone: Optional[str] = None


async def resolve_effective_tenant_id(
    db: AsyncSession,
    tenant_id_param: Optional[str] = None,
    x_tenant_key: Optional[str] = Header(None, alias="X-Tenant-Key"),
) -> uuid.UUID:
    """Resolves tenant UUID from request param, header key, or falls back to active clinic tenant with agents."""
    if tenant_id_param:
        try:
            return uuid.UUID(tenant_id_param)
        except ValueError:
            pass

    if x_tenant_key:
        try:
            return uuid.UUID(x_tenant_key)
        except ValueError:
            pass

    # Priority 1: Fallback to the active tenant that has configured voice agents
    res_agent_tenant = await db.execute(select(Agent.tenantId).where(Agent.tenantId.isnot(None)).limit(1))
    agent_tenant_id = res_agent_tenant.scalar_one_or_none()
    if agent_tenant_id:
        return agent_tenant_id

    # Priority 2: Fallback to first tenant in database
    res = await db.execute(select(Tenant).limit(1))
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active tenant found in system")
    return t.id


def norm_slot_time(t: str) -> str:
    """Normalizes time string into standard HH:MM AM/PM format."""
    if not t:
        return ""
    clean = re.sub(r"\s+", " ", t.strip().upper())
    if re.match(r"^\d:\d{2}\s*(AM|PM)$", clean):
        clean = "0" + clean
    return clean


@router.get("/slots")
async def check_whatsapp_slots(
    date: str = Query(..., description="Booking date e.g. 2026-09-16"),
    tenantId: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    x_tenant_key: Optional[str] = Header(None, alias="X-Tenant-Key"),
):
    """Returns available clinic time slots for WhatsApp Bot."""
    effective_tenant_id = await resolve_effective_tenant_id(db, tenantId, x_tenant_key)

    res = await db.execute(
        select(Appointment).where(
            Appointment.tenantId == effective_tenant_id,
            Appointment.bookingDate == date,
            Appointment.status.in_([
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.REQUESTED,
            ]),
        )
    )
    booked_appointments = res.scalars().all()
    booked_times = {norm_slot_time(a.bookingTime) for a in booked_appointments}

    available_slots = [slot for slot in DEFAULT_CLINIC_SLOTS if norm_slot_time(slot) not in booked_times]

    return {
        "status": "success",
        "tenantId": str(effective_tenant_id),
        "date": date,
        "totalSlots": len(DEFAULT_CLINIC_SLOTS),
        "availableSlots": available_slots,
        "bookedSlots": list(booked_times),
    }


@router.post("/appointments/book", status_code=status.HTTP_201_CREATED)
async def book_whatsapp_appointment(
    payload: WhatsAppBookingRequest,
    db: AsyncSession = Depends(get_db),
    x_tenant_key: Optional[str] = Header(None, alias="X-Tenant-Key"),
):
    """Books an appointment coming from the WhatsApp Bot and registers it into NextLite CRM."""
    effective_tenant_id = await resolve_effective_tenant_id(db, payload.tenantId, x_tenant_key)

    crm = CRMService(db)
    try:
        # Fetch active agent for tenant (required by DB foreign key constraint on leads.agent_id)
        res_agent = await db.execute(select(Agent).where(Agent.tenantId == effective_tenant_id).limit(1))
        agent_obj = res_agent.scalar_one_or_none()
        effective_agent_id = agent_obj.id if agent_obj else None

        # Create/Update Lead record with source = WHATSAPP
        res_lead = await db.execute(
            select(Lead).where(
                Lead.tenantId == effective_tenant_id,
                Lead.customerPhone == payload.customerPhone,
            )
        )
        lead = res_lead.scalar_one_or_none()
        if not lead and effective_agent_id:
            lead = Lead(
                id=uuid.uuid4(),
                tenantId=effective_tenant_id,
                agentId=effective_agent_id,
                customerName=payload.customerName,
                customerPhone=payload.customerPhone,
                interestCategory=payload.title or "WhatsApp Appointment",
                status=LeadStatus.NEW,
                notes=f"Booked via WhatsApp for {payload.bookingDate} at {payload.bookingTime}",
            )
            lead.leadNumber = f"LEAD-{str(uuid.uuid4())[:6].upper()}"
            lead.metadataJson = {"source": "WHATSAPP", "whatsappBooking": True}
            db.add(lead)
        elif lead:
            meta = dict(lead.metadataJson or {})
            meta["source"] = "WHATSAPP"
            meta["lastWhatsAppBooking"] = datetime.utcnow().isoformat()
            lead.metadataJson = meta

        appt = await crm.create_appointment(
            tenant_id=effective_tenant_id,
            customer_name=payload.customerName,
            customer_phone=payload.customerPhone,
            booking_date=payload.bookingDate,
            booking_time=payload.bookingTime,
            title=payload.title or "WhatsApp Consultation",
            booked_by="WHATSAPP",
            booked_by_name="WhatsApp Bot",
            age=payload.age,
            place=payload.place,
            notes=payload.notes,
        )

        return {
            "status": "success",
            "message": f"Appointment {appt.get('appointmentNumber')} booked successfully via WhatsApp",
            "tenantId": str(effective_tenant_id),
            "appointment": appt,
        }
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(val_err),
        )
    except Exception as err:
        logger.opt(exception=err).error(f"WHATSAPP BOOKING EXCEPTION: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to book WhatsApp appointment: {str(err)}",
        )


@router.post("/appointments/cancel")
async def cancel_whatsapp_appointment(
    payload: WhatsAppCancelRequest,
    db: AsyncSession = Depends(get_db),
    x_tenant_key: Optional[str] = Header(None, alias="X-Tenant-Key"),
):
    """Cancels an existing appointment via WhatsApp."""
    effective_tenant_id = await resolve_effective_tenant_id(db, payload.tenantId, x_tenant_key)
    crm = CRMService(db)

    appt_to_cancel: Optional[Appointment] = None

    if payload.appointmentId:
        try:
            appt_uuid = uuid.UUID(payload.appointmentId)
            appt_to_cancel = await crm.get_appointment(appt_uuid, effective_tenant_id)
        except ValueError:
            pass

    if not appt_to_cancel and payload.customerPhone:
        active = await crm.get_active_appointment_by_phone(effective_tenant_id, payload.customerPhone)
        if active:
            appt_to_cancel = active

    if not appt_to_cancel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active appointment found for cancellation",
        )

    target_id = uuid.UUID(appt_to_cancel["id"]) if isinstance(appt_to_cancel, dict) else appt_to_cancel.id
    target_number = (appt_to_cancel.get("appointmentNumber") if isinstance(appt_to_cancel, dict) else appt_to_cancel.appointmentNumber) or "APT"

    updated = await crm.update_appointment(
        target_id,
        effective_tenant_id,
        {"status": "CANCELLED", "notes": "Cancelled via WhatsApp message"},
    )

    return {
        "status": "success",
        "message": f"Appointment {target_number} has been cancelled",
        "appointment": updated,
    }
