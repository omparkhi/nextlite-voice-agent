import uuid
import re
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..models import Appointment, AppointmentStatus, Tenant, TenantAppointmentCounter
from ..services.crm_service import CRMService

router = APIRouter(prefix="/api/appointments", tags=["receptionist"])

SAMPLE_DOCTORS = [
    {
        "id": "doc-sharma",
        "name": "Dr. Rajesh Sharma",
        "specialty": "General Medicine & Diabetology",
        "opdRoom": "OPD Room 102",
        "qualification": "MBBS, MD (Internal Medicine)",
    },
    {
        "id": "doc-iyer",
        "name": "Dr. Ananya Iyer",
        "specialty": "Cardiology & Heart Health",
        "opdRoom": "OPD Room 205",
        "qualification": "MBBS, MD, DM (Cardiology)",
    },
    {
        "id": "doc-patil",
        "name": "Dr. Sneha Patil",
        "specialty": "Pediatrics & Child Care",
        "opdRoom": "OPD Room 108",
        "qualification": "MBBS, DCH, DNB (Pediatrics)",
    },
    {
        "id": "doc-malhotra",
        "name": "Dr. Vikram Malhotra",
        "specialty": "Orthopedics & Joint Care",
        "opdRoom": "OPD Room 310",
        "qualification": "MBBS, MS (Orthopedics)",
    },
]

STANDARD_TIME_SLOTS = [
    "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
    "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM",
    "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
    "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
    "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM"
]

def resolve_doctor(query: Optional[str] = None) -> Dict[str, Any]:
    if not query:
        return SAMPLE_DOCTORS[0]
    query_lower = query.lower().strip()
    for d in SAMPLE_DOCTORS:
        if d["id"].lower() == query_lower or query_lower in d["name"].lower() or d["name"].lower() in query_lower:
            return d
    return SAMPLE_DOCTORS[0]

def normalize_time(time_str: str) -> str:
    if not time_str:
        return ""
    t = time_str.strip()
    if t.upper().endswith("AM") or t.upper().endswith("PM"):
        parts = t.split(" ")
        time_part = parts[0]
        period = parts[1].upper()
        if ":" in time_part:
            h, m = time_part.split(":")
            return f"{h.zfill(2)}:{m.zfill(2)} {period}"
        return f"{time_part.zfill(2)}:00 {period}"
    try:
        parts = t.split(":")
        hour = int(parts[0])
        minute = parts[1].zfill(2) if len(parts) > 1 else "00"
        period = "PM" if hour >= 12 else "AM"
        if hour > 12:
            hour -= 12
        elif hour == 0:
            hour = 12
        return f"{str(hour).zfill(2)}:{minute} {period}"
    except Exception:
        return t

async def get_or_create_default_tenant(session: AsyncSession) -> uuid.UUID:
    res = await session.execute(select(Tenant).order_by(Tenant.createdAt.asc()).limit(1))
    t = res.scalar_one_or_none()
    if t:
        return t.id
    new_tenant = Tenant(
        id=uuid.uuid4(),
        name="Apex Multispeciality Clinic",
        slug="apex-clinic",
        status="active"
    )
    session.add(new_tenant)
    await session.commit()
    return new_tenant.id

@router.get("/doctors")
async def list_doctors():
    return {"doctors": SAMPLE_DOCTORS}

@router.get("/schedule")
async def get_schedule(
    doctor: Optional[str] = Query(None),
    doctorId: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None, alias="tenantId"),
    session: AsyncSession = Depends(get_db)
):
    doc = resolve_doctor(doctorId or doctor)
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")

    # Load appointments from DB for target date
    query = select(Appointment).where(
        and_(
            Appointment.bookingDate == target_date,
            Appointment.status.in_([
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.REQUESTED,
            ])
        )
    )
    if tenant_id:
        try:
            query = query.where(Appointment.tenantId == uuid.UUID(tenant_id))
        except Exception:
            pass

    res = await session.execute(query)
    db_appts = res.scalars().all()

    # Determine tenant
    if tenant_id:
        try:
            tenant_uuid = uuid.UUID(tenant_id)
        except Exception:
            tenant_uuid = await get_or_create_default_tenant(session)
    else:
        tenant_uuid = await get_or_create_default_tenant(session)

    # Resolve dynamic capacity for tenant
    crm_service = CRMService(session)
    b_h, s_d, p_s = await crm_service._resolve_tenant_schedule_config(tenant_uuid)
    effective_capacity = max(1, int(p_s or 1))

    # Filter for doctor if resourceName matches or general
    daily_bookings = []
    for a in db_appts:
        if a.resourceName and doc["name"] not in a.resourceName and doc["id"] not in a.resourceName:
            continue
        daily_bookings.append({
            "id": str(a.id),
            "appointmentNumber": a.appointmentNumber,
            "doctorId": doc["id"],
            "doctorName": a.resourceName or doc["name"],
            "date": a.bookingDate,
            "time": normalize_time(a.bookingTime),
            "patientName": a.customerName,
            "patientPhone": a.customerPhone,
            "age": a.age or (a.metadataJson or {}).get("age"),
            "place": a.place or (a.metadataJson or {}).get("place") or (a.metadataJson or {}).get("location"),
            "reason": a.title,
            "status": a.status.value if hasattr(a.status, "value") else str(a.status),
            "bookedBy": a.bookedBy or "AGENT",
            "bookedByName": a.bookedByName or ("AI Voice Assistant" if (a.bookedBy or "AGENT") == "AGENT" else "Desk Receptionist"),
            "walkIn": bool(a.walkIn),
            "bookedAt": a.createdAt.isoformat() if a.createdAt else datetime.utcnow().isoformat(),
        })

    slots = []
    for slot_time in STANDARD_TIME_SLOTS:
        matching_bookings = [
            b for b in daily_bookings
            if normalize_time(b["time"]) == normalize_time(slot_time)
        ]
        booked_count = len(matching_bookings)
        is_full = booked_count >= effective_capacity
        slot_status = "BOOKED" if is_full else ("PARTIAL" if booked_count > 0 else "AVAILABLE")

        primary = matching_bookings[0] if matching_bookings else None

        slots.append({
            "time": slot_time,
            "status": "BOOKED" if is_full else ("AVAILABLE" if booked_count == 0 else "PARTIAL"),
            "capacity": effective_capacity,
            "bookedCount": booked_count,
            "remainingCapacity": max(0, effective_capacity - booked_count),
            "isFull": is_full,
            "appointments": matching_bookings,
            # Backwards compatibility fields for legacy clients
            "appointmentId": primary["id"] if primary else None,
            "appointmentNumber": primary["appointmentNumber"] if primary else None,
            "patientName": primary["patientName"] if primary else None,
            "patientPhone": primary["patientPhone"] if primary else None,
            "age": primary.get("age") if primary else None,
            "place": primary.get("place") if primary else None,
            "reason": primary["reason"] if primary else None,
            "bookedBy": primary["bookedBy"] if primary else None,
            "bookedByName": primary["bookedByName"] if primary else None,
            "walkIn": primary["walkIn"] if primary else False,
            "bookedAt": primary["bookedAt"] if primary else None,
        })

    return {
        "doctor": doc,
        "date": target_date,
        "capacity": effective_capacity,
        "totalSlots": len(slots),
        "bookedSlots": sum(1 for s in slots if s.get("isFull")),
        "availableSlots": sum(1 for s in slots if not s.get("isFull")),
        "slots": slots,
    }

class BookAppointmentInput(BaseModel):
    patientName: str
    patientPhone: Optional[str] = ""
    doctor: Optional[str] = None
    doctorId: Optional[str] = None
    date: str
    time: str
    reason: Optional[str] = "General Consultation"
    age: Optional[str] = None
    place: Optional[str] = None
    bookedBy: Optional[str] = "RECEPTIONIST"
    bookedByName: Optional[str] = "Walk-in Desk Receptionist"
    walkIn: Optional[bool] = True
    tenantId: Optional[str] = None
    patientsPerSlot: Optional[int] = None

@router.post("/book", status_code=status.HTTP_201_CREATED)
async def book_receptionist_appointment(
    body: BookAppointmentInput,
    session: AsyncSession = Depends(get_db)
):
    doc = resolve_doctor(body.doctorId or body.doctor)
    norm_time = normalize_time(body.time)

    # Determine tenant
    if body.tenantId:
        try:
            tenant_uuid = uuid.UUID(body.tenantId)
        except Exception:
            tenant_uuid = await get_or_create_default_tenant(session)
    else:
        tenant_uuid = await get_or_create_default_tenant(session)

    try:
        crm = CRMService(session)
        appt = await crm.create_appointment(
            tenant_id=tenant_uuid,
            customer_name=body.patientName,
            customer_phone=body.patientPhone,
            booking_date=body.date,
            booking_time=norm_time,
            title=body.reason or "General Consultation",
            resource_name=doc["name"],
            booked_by=body.bookedBy or "RECEPTIONIST",
            booked_by_name=body.bookedByName or "Walk-in Desk Receptionist",
            age=body.age,
            place=body.place,
            walk_in=body.walkIn if body.walkIn is not None else True,
            notes=body.reason,
            patients_per_slot=body.patientsPerSlot,
        )
    except ValueError as e:
        err_msg = str(e)
        if "capacity" in err_msg.lower() or "already booked" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=err_msg
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg
        )

    return {
        "success": True,
        "message": f"Appointment {appt.get('appointmentNumber')} booked successfully with {doc['name']} for {body.patientName} at {norm_time} on {body.date}.",
        "appointment": {
            "id": appt["id"],
            "appointmentNumber": appt.get("appointmentNumber"),
            "doctorId": doc["id"],
            "doctorName": doc["name"],
            "date": body.date,
            "time": norm_time,
            "patientName": body.patientName,
            "patientPhone": body.patientPhone,
            "age": body.age,
            "place": body.place,
            "reason": body.reason,
            "status": "SCHEDULED",
            "bookedBy": appt.get("bookedBy", "RECEPTIONIST"),
            "bookedByName": appt.get("bookedByName", "Walk-in Desk Receptionist"),
            "walkIn": appt.get("walkIn", True),
            "bookedAt": appt.get("createdAt", datetime.utcnow().isoformat()),
        }
    }

@router.patch("/{appointment_id}")
@router.patch("/appointments/{appointment_id}")
async def update_receptionist_appointment(
    appointment_id: str,
    body: Dict[str, Any],
    session: AsyncSession = Depends(get_db)
):
    try:
        appt_uuid = uuid.UUID(appointment_id)
        res = await session.execute(select(Appointment).where(Appointment.id == appt_uuid))
        appt = res.scalar_one_or_none()
        if not appt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
        
        crm = CRMService(session)
        updated = await crm.update_appointment(appt_uuid, appt.tenantId, body)
        return {
            "success": True,
            "message": "Appointment updated successfully",
            "appointment": updated
        }
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid appointment ID format")

@router.post("/{appointment_id}/cancel")
async def cancel_receptionist_appointment(
    appointment_id: str,
    session: AsyncSession = Depends(get_db)
):
    try:
        appt_uuid = uuid.UUID(appointment_id)
        res = await session.execute(select(Appointment).where(Appointment.id == appt_uuid))
        appt = res.scalar_one_or_none()
        if not appt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
        appt.status = AppointmentStatus.CANCELLED
        appt.updatedAt = datetime.utcnow()
        await session.commit()
        return {
            "success": True,
            "message": f"Appointment {appt.appointmentNumber or appointment_id} for {appt.customerName} has been cancelled.",
            "appointment": {
                "id": str(appt.id),
                "appointmentNumber": appt.appointmentNumber,
                "status": "CANCELLED",
                "patientName": appt.customerName
            }
        }
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid appointment ID format")

@router.get("/availability")
async def check_availability(
    doctor: Optional[str] = Query(None),
    doctorId: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    time: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None, alias="tenantId"),
    session: AsyncSession = Depends(get_db)
):
    doc = resolve_doctor(doctorId or doctor)
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")

    query = select(Appointment).where(
        and_(
            Appointment.bookingDate == target_date,
            Appointment.status.in_([
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.REQUESTED,
            ])
        )
    )
    if tenant_id:
        try:
            query = query.where(Appointment.tenantId == uuid.UUID(tenant_id))
        except Exception:
            pass

    res = await session.execute(query)
    db_appts = res.scalars().all()
    booked_times = {normalize_time(a.bookingTime) for a in db_appts}

    if time:
        norm_time = normalize_time(time)
        is_booked = norm_time in booked_times
        return {
            "doctor": doc,
            "date": target_date,
            "time": norm_time,
            "available": not is_booked,
            "status": "BOOKED" if is_booked else "AVAILABLE"
        }

    available_slots = [
        s for s in STANDARD_TIME_SLOTS
        if normalize_time(s) not in booked_times
    ]
    return {
        "doctor": doc,
        "date": target_date,
        "totalSlots": len(STANDARD_TIME_SLOTS),
        "availableSlotsCount": len(available_slots),
        "availableSlots": available_slots,
    }

