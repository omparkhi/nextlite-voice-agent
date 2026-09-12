import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

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
    "04:00 PM", "04:30 PM", "05:00 PM"
]

appointment_store: List[Dict[str, Any]] = [
    {
        "id": "appt-demo-1",
        "doctorId": "doc-sharma",
        "doctorName": "Dr. Rajesh Sharma",
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "time": "09:30 AM",
        "patientName": "Rahul Sharma",
        "patientPhone": "+91 98201 12345",
        "reason": "Routine Health Checkup & Blood Pressure",
        "status": "BOOKED",
        "bookedAt": datetime.utcnow().isoformat(),
    },
    {
        "id": "appt-demo-2",
        "doctorId": "doc-sharma",
        "doctorName": "Dr. Rajesh Sharma",
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "time": "10:30 AM",
        "patientName": "Priya Patil",
        "patientPhone": "+91 98202 54321",
        "reason": "Seasonal Fever & Cold Consultation",
        "status": "BOOKED",
        "bookedAt": datetime.utcnow().isoformat(),
    },
    {
        "id": "appt-demo-3",
        "doctorId": "doc-iyer",
        "doctorName": "Dr. Ananya Iyer",
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "time": "11:00 AM",
        "patientName": "Amit Verma",
        "patientPhone": "+91 98203 98765",
        "reason": "ECG Review & Cardiology Follow-up",
        "status": "BOOKED",
        "bookedAt": datetime.utcnow().isoformat(),
    },
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
    t = time_str.strip()
    if t.upper().endswith("AM") or t.upper().endswith("PM"):
        parts = t.split(" ")
        h, m = parts[0].split(":")
        return f"{h.zfill(2)}:{m.zfill(2)} {parts[1].upper()}"
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

@router.get("/doctors")
async def list_doctors():
    return {"doctors": SAMPLE_DOCTORS}

@router.get("/schedule")
async def get_schedule(
    doctor: Optional[str] = Query(None),
    doctorId: Optional[str] = Query(None),
    date: Optional[str] = Query(None)
):
    doc = resolve_doctor(doctorId or doctor)
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")

    daily_bookings = [
        b for b in appointment_store
        if b["doctorId"] == doc["id"] and b["date"] == target_date and b["status"] == "BOOKED"
    ]

    slots = []
    for slot_time in STANDARD_TIME_SLOTS:
        booking = next((b for b in daily_bookings if normalize_time(b["time"]) == normalize_time(slot_time)), None)
        if booking:
            slots.append({
                "time": slot_time,
                "status": "BOOKED",
                "appointmentId": booking["id"],
                "patientName": booking["patientName"],
                "patientPhone": booking["patientPhone"],
                "reason": booking["reason"],
                "bookedAt": booking["bookedAt"],
            })
        else:
            slots.append({
                "time": slot_time,
                "status": "AVAILABLE"
            })

    return {
        "doctor": doc,
        "date": target_date,
        "totalSlots": len(slots),
        "bookedSlots": sum(1 for s in slots if s["status"] == "BOOKED"),
        "availableSlots": sum(1 for s in slots if s["status"] == "AVAILABLE"),
        "slots": slots,
    }

class BookAppointmentInput(BaseModel):
    patientName: str
    patientPhone: str
    doctor: Optional[str] = None
    doctorId: Optional[str] = None
    date: str
    time: str
    reason: str

@router.post("/book", status_code=status.HTTP_201_CREATED)
async def book_receptionist_appointment(body: BookAppointmentInput):
    doc = resolve_doctor(body.doctorId or body.doctor)
    norm_time = normalize_time(body.time)

    existing = next(
        (b for b in appointment_store
         if b["doctorId"] == doc["id"] and b["date"] == body.date and normalize_time(b["time"]) == norm_time and b["status"] == "BOOKED"),
        None
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Slot {norm_time} on {body.date} for {doc['name']} is already booked by {existing['patientName']}."
        )

    new_record = {
        "id": f"appt-{uuid.uuid4().hex[:8]}",
        "doctorId": doc["id"],
        "doctorName": doc["name"],
        "date": body.date,
        "time": norm_time,
        "patientName": body.patientName,
        "patientPhone": body.patientPhone,
        "reason": body.reason,
        "status": "BOOKED",
        "bookedAt": datetime.utcnow().isoformat(),
    }
    appointment_store.append(new_record)
    return {
        "success": True,
        "message": f"Appointment booked successfully with {doc['name']} for {body.patientName} at {norm_time} on {body.date}.",
        "appointment": new_record
    }

@router.post("/{appointment_id}/cancel")
async def cancel_receptionist_appointment(appointment_id: str):
    appt = next((b for b in appointment_store if b["id"] == appointment_id), None)
    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    appt["status"] = "CANCELLED"
    appt["cancelledAt"] = datetime.utcnow().isoformat()
    return {
        "success": True,
        "message": f"Appointment {appointment_id} for {appt['patientName']} has been cancelled.",
        "appointment": appt
    }

@router.get("/availability")
async def check_availability(
    doctor: Optional[str] = Query(None),
    doctorId: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    time: Optional[str] = Query(None)
):
    doc = resolve_doctor(doctorId or doctor)
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")

    if time:
        norm_time = normalize_time(time)
        is_booked = any(
            b for b in appointment_store
            if b["doctorId"] == doc["id"] and b["date"] == target_date and normalize_time(b["time"]) == norm_time and b["status"] == "BOOKED"
        )
        return {
            "doctor": doc,
            "date": target_date,
            "time": norm_time,
            "available": not is_booked,
            "status": "BOOKED" if is_booked else "AVAILABLE"
        }

    daily_bookings = [
        b for b in appointment_store
        if b["doctorId"] == doc["id"] and b["date"] == target_date and b["status"] == "BOOKED"
    ]
    available_slots = [
        s for s in STANDARD_TIME_SLOTS
        if not any(normalize_time(b["time"]) == normalize_time(s) for b in daily_bookings)
    ]
    return {
        "doctor": doc,
        "date": target_date,
        "totalSlots": len(STANDARD_TIME_SLOTS),
        "availableSlotsCount": len(available_slots),
        "availableSlots": available_slots,
    }
