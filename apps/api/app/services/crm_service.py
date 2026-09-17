import uuid
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, desc, and_, delete
from ..models import (
    Tenant, User, Subscription, Agent, AgentVersion, Deployment,
    CallSession, Lead, Appointment, FollowUp, PhoneNumber,
    LeadStatus, AppointmentStatus, FollowUpStatus, CallStatus, CallDirection,
    UserRole, TenantAppointmentCounter
)
from ..logging import logger

class CRMService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # Profile
    async def get_client_profile(self, tenant_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        tenant_res = await self.session.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = tenant_res.scalar_one_or_none()
        if not tenant:
            return None

        user_res = await self.session.execute(
            select(User).where(User.tenantId == tenant_id).order_by(User.createdAt.asc()).limit(1)
        )
        user = user_res.scalar_one_or_none()

        sub_res = await self.session.execute(
            select(Subscription).where(Subscription.tenantId == tenant_id).limit(1)
        )
        sub = sub_res.scalar_one_or_none()

        return {
            "tenant": {
                "id": str(tenant.id),
                "name": tenant.name,
                "status": tenant.status,
                "createdAt": tenant.createdAt.isoformat() if tenant.createdAt else None,
            },
            "user": {
                "id": str(user.id),
                "email": user.email,
                "role": user.role.value if hasattr(user.role, "value") else str(user.role),
                "emailVerified": user.emailVerified,
                "createdAt": user.createdAt.isoformat() if user.createdAt else None,
            } if user else None,
            "subscription": {
                "id": str(sub.id),
                "status": sub.status.value if hasattr(sub.status, "value") else str(sub.status),
                "planName": sub.planName,
                "currentPeriodEnd": sub.currentPeriodEnd.isoformat() if sub.currentPeriodEnd else None,
            } if sub else None,
        }

    async def update_client_profile(self, tenant_id: uuid.UUID, business_name: str):
        await self.session.execute(
            update(Tenant).where(Tenant.id == tenant_id).values(name=business_name, updatedAt=datetime.utcnow())
        )
        await self.session.commit()

    # Calls
    async def list_call_sessions(
        self, tenant_id: uuid.UUID, limit: int = 20, offset: int = 0,
        agent_id: Optional[uuid.UUID] = None, status: Optional[str] = None
    ) -> Dict[str, Any]:
        query = select(CallSession).where(CallSession.tenantId == tenant_id)
        if agent_id:
            query = query.where(CallSession.agentId == agent_id)
        if status:
            try:
                query = query.where(CallSession.status == CallStatus(status))
            except Exception:
                pass

        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.session.execute(count_query)).scalar_one()

        query = query.order_by(CallSession.startedAt.desc()).limit(limit).offset(offset)
        res = await self.session.execute(query)
        sessions = res.scalars().all()

        mapped_sessions = [
            {
                "id": str(s.id),
                "tenantId": str(s.tenantId),
                "agentId": str(s.agentId) if s.agentId else None,
                "deploymentId": str(s.deploymentId) if s.deploymentId else None,
                "roomName": s.roomName,
                "status": s.status.value if hasattr(s.status, "value") else str(s.status),
                "direction": s.direction.value if hasattr(s.direction, "value") else str(s.direction),
                "callerNumber": s.callerNumber,
                "callerPhoneNumber": s.callerNumber,
                "durationSeconds": s.durationSeconds or 0,
                "primaryLanguage": s.primaryLanguage or "en-IN",
                "transcriptText": s.transcriptText,
                "transcript": s.turnsJson or [],
                "turnsJson": s.turnsJson or [],
                "toolsUsed": s.toolsUsed or [],
                "metricsJson": s.metricsJson or {},
                "startedAt": s.startedAt.isoformat() if s.startedAt else None,
                "endedAt": s.endedAt.isoformat() if s.endedAt else None,
                "createdAt": s.createdAt.isoformat() if s.createdAt else None,
            }
            for s in sessions
        ]

        return {
            "calls": mapped_sessions,
            "sessions": mapped_sessions,
            "total": total,
            "limit": limit,
            "offset": offset
        }

    async def get_call_session(self, session_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        res = await self.session.execute(
            select(CallSession).where(and_(CallSession.id == session_id, CallSession.tenantId == tenant_id))
        )
        s = res.scalar_one_or_none()
        if not s:
            return None
        return {
            "id": str(s.id),
            "tenantId": str(s.tenantId),
            "agentId": str(s.agentId) if s.agentId else None,
            "deploymentId": str(s.deploymentId) if s.deploymentId else None,
            "roomName": s.roomName,
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
            "direction": s.direction.value if hasattr(s.direction, "value") else str(s.direction),
            "callerNumber": s.callerNumber,
            "callerPhoneNumber": s.callerNumber,
            "durationSeconds": s.durationSeconds or 0,
            "primaryLanguage": s.primaryLanguage or "en-IN",
            "transcriptText": s.transcriptText,
            "transcript": s.turnsJson or [],
            "turnsJson": s.turnsJson or [],
            "toolsUsed": s.toolsUsed or [],
            "metricsJson": s.metricsJson or {},
            "startedAt": s.startedAt.isoformat() if s.startedAt else None,
            "endedAt": s.endedAt.isoformat() if s.endedAt else None,
            "createdAt": s.createdAt.isoformat() if s.createdAt else None,
        }

    # Leads
    async def list_leads(
        self, tenant_id: uuid.UUID, limit: int = 20, offset: int = 0,
        agent_id: Optional[uuid.UUID] = None, status: Optional[str] = None
    ) -> Dict[str, Any]:
        query = select(Lead).where(Lead.tenantId == tenant_id)
        if agent_id:
            query = query.where(Lead.agentId == agent_id)
        if status:
            try:
                query = query.where(Lead.status == LeadStatus(status))
            except Exception:
                pass

        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.session.execute(count_query)).scalar_one()

        query = query.order_by(Lead.createdAt.desc()).limit(limit).offset(offset)
        res = await self.session.execute(query)
        leads_list = res.scalars().all()

        return {
            "leads": [
                {
                    "id": str(l.id),
                    "tenantId": str(l.tenantId),
                    "agentId": str(l.agentId) if l.agentId else None,
                    "leadNumber": l.leadNumber,
                    "customerName": l.customerName,
                    "customerPhone": l.customerPhone,
                    "customerEmail": l.customerEmail,
                    "requirement": l.requirement,
                    "status": l.status.value if hasattr(l.status, "value") else str(l.status),
                    "priority": l.priority.value if hasattr(l.priority, "value") else str(l.priority),
                    "notes": l.notes,
                    "createdAt": l.createdAt.isoformat() if l.createdAt else None,
                }
                for l in leads_list
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }

    async def get_lead(self, lead_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        res = await self.session.execute(
            select(Lead).where(and_(Lead.id == lead_id, Lead.tenantId == tenant_id))
        )
        l = res.scalar_one_or_none()
        if not l:
            return None
        return {
            "id": str(l.id),
            "tenantId": str(l.tenantId),
            "agentId": str(l.agentId) if l.agentId else None,
            "leadNumber": l.leadNumber,
            "customerName": l.customerName,
            "customerPhone": l.customerPhone,
            "customerEmail": l.customerEmail,
            "requirement": l.requirement,
            "status": l.status.value if hasattr(l.status, "value") else str(l.status),
            "priority": l.priority.value if hasattr(l.priority, "value") else str(l.priority),
            "notes": l.notes,
            "createdAt": l.createdAt.isoformat() if l.createdAt else None,
        }

    async def update_lead(self, lead_id: uuid.UUID, tenant_id: uuid.UUID, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        res = await self.session.execute(
            select(Lead).where(and_(Lead.id == lead_id, Lead.tenantId == tenant_id))
        )
        l = res.scalar_one_or_none()
        if not l:
            return None

        if "customerName" in data and data["customerName"]:
            l.customerName = data["customerName"]
        if "customerPhone" in data and data["customerPhone"]:
            l.customerPhone = data["customerPhone"]
        if "customerEmail" in data:
            l.customerEmail = data["customerEmail"]
        if "requirement" in data and data["requirement"]:
            l.requirement = data["requirement"]
        if "status" in data and data["status"]:
            l.status = LeadStatus(data["status"])
        if "notes" in data:
            l.notes = data["notes"]
        l.updatedAt = datetime.utcnow()

        await self.session.commit()
        return await self.get_lead(lead_id, tenant_id)

    # Appointments
    async def list_appointments(
        self, tenant_id: uuid.UUID, limit: int = 20, offset: int = 0,
        agent_id: Optional[uuid.UUID] = None, status: Optional[str] = None,
        booking_date: Optional[str] = None
    ) -> Dict[str, Any]:
        query = select(Appointment).where(Appointment.tenantId == tenant_id)
        if agent_id:
            query = query.where(Appointment.agentId == agent_id)
        if status:
            try:
                query = query.where(Appointment.status == AppointmentStatus(status))
            except Exception:
                pass
        if booking_date:
            query = query.where(Appointment.bookingDate == booking_date)

        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.session.execute(count_query)).scalar_one()

        query = query.order_by(Appointment.createdAt.desc()).limit(limit).offset(offset)
        res = await self.session.execute(query)
        appts = res.scalars().all()

        return {
            "appointments": [
                {
                    "id": str(a.id),
                    "tenantId": str(a.tenantId),
                    "agentId": str(a.agentId) if a.agentId else None,
                    "appointmentNumber": a.appointmentNumber,
                    "customerName": a.customerName,
                    "customerPhone": a.customerPhone,
                    "phone": a.customerPhone,
                    "callerNumber": a.customerPhone,
                    "callerPhoneNumber": a.customerPhone,
                    "age": a.age or (a.metadataJson or {}).get("age"),
                    "place": a.place or (a.metadataJson or {}).get("place") or (a.metadataJson or {}).get("location"),
                    "title": a.title,
                    "serviceType": a.title,
                    "resourceName": a.resourceName,
                    "bookingDate": a.bookingDate,
                    "bookingTime": a.bookingTime,
                    "appointmentDate": a.bookingDate,
                    "appointmentTime": a.bookingTime,
                    "status": a.status.value if hasattr(a.status, "value") else str(a.status),
                    "bookedBy": a.bookedBy or "AGENT",
                    "bookedByName": a.bookedByName or ("AI Voice Assistant" if (a.bookedBy or "AGENT") == "AGENT" else "Receptionist"),
                    "walkIn": bool(a.walkIn),
                    "notes": a.notes,
                    "metadata": a.metadataJson or {},
                    "createdAt": a.createdAt.isoformat() if a.createdAt else None,
                }
                for a in appts
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }

    async def get_appointment(self, appt_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        res = await self.session.execute(
            select(Appointment).where(and_(Appointment.id == appt_id, Appointment.tenantId == tenant_id))
        )
        a = res.scalar_one_or_none()
        if not a:
            return None
        return {
            "id": str(a.id),
            "tenantId": str(a.tenantId),
            "agentId": str(a.agentId) if a.agentId else None,
            "appointmentNumber": a.appointmentNumber,
            "customerName": a.customerName,
            "customerPhone": a.customerPhone,
            "phone": a.customerPhone,
            "callerNumber": a.customerPhone,
            "callerPhoneNumber": a.customerPhone,
            "age": a.age or (a.metadataJson or {}).get("age"),
            "place": a.place or (a.metadataJson or {}).get("place") or (a.metadataJson or {}).get("location"),
            "title": a.title,
            "serviceType": a.title,
            "resourceName": a.resourceName,
            "bookingDate": a.bookingDate,
            "bookingTime": a.bookingTime,
            "appointmentDate": a.bookingDate,
            "appointmentTime": a.bookingTime,
            "status": a.status.value if hasattr(a.status, "value") else str(a.status),
            "bookedBy": a.bookedBy or "AGENT",
            "bookedByName": a.bookedByName or ("AI Voice Assistant" if (a.bookedBy or "AGENT") == "AGENT" else "Receptionist"),
            "walkIn": bool(a.walkIn),
            "notes": a.notes,
            "metadata": a.metadataJson or {},
            "createdAt": a.createdAt.isoformat() if a.createdAt else None,
        }

    async def update_appointment(self, appt_id: uuid.UUID, tenant_id: uuid.UUID, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        res = await self.session.execute(
            select(Appointment).where(and_(Appointment.id == appt_id, Appointment.tenantId == tenant_id))
        )
        a = res.scalar_one_or_none()
        if not a:
            return None

        if "customerName" in data and data["customerName"]:
            a.customerName = data["customerName"]
        if "customerPhone" in data and data["customerPhone"]:
            a.customerPhone = data["customerPhone"]
        if "serviceType" in data and data["serviceType"]:
            a.title = data["serviceType"]
        if "appointmentDate" in data and data["appointmentDate"]:
            a.bookingDate = data["appointmentDate"]
        if "appointmentTime" in data and data["appointmentTime"]:
            a.bookingTime = data["appointmentTime"]
        if "status" in data and data["status"]:
            a.status = AppointmentStatus(data["status"])
        if "bookedBy" in data and data["bookedBy"]:
            a.bookedBy = data["bookedBy"]
        if "bookedByName" in data and data["bookedByName"]:
            a.bookedByName = data["bookedByName"]
        if "walkIn" in data:
            a.walkIn = bool(data["walkIn"])
        if "notes" in data:
            a.notes = data["notes"]
        if "age" in data and data["age"]:
            a.age = str(data["age"]).strip()
            current_meta = dict(a.metadataJson or {})
            current_meta["age"] = str(data["age"]).strip()
            a.metadataJson = current_meta
        if "place" in data and data["place"]:
            a.place = str(data["place"]).strip()
            current_meta = dict(a.metadataJson or {})
            current_meta["place"] = str(data["place"]).strip()
            current_meta["location"] = str(data["place"]).strip()
            a.metadataJson = current_meta
        if "metadata" in data and isinstance(data["metadata"], dict):
            current_meta = dict(a.metadataJson or {})
            current_meta.update(data["metadata"])
            a.metadataJson = current_meta
        a.updatedAt = datetime.utcnow()

        await self.session.commit()
        return await self.get_appointment(appt_id, tenant_id)

    async def create_appointment(
        self,
        tenant_id: uuid.UUID,
        customer_name: str,
        customer_phone: str,
        booking_date: str,
        booking_time: str,
        title: Optional[str] = "Consultation",
        resource_name: Optional[str] = None,
        booked_by: str = "RECEPTIONIST",
        booked_by_name: Optional[str] = None,
        age: Optional[str] = None,
        place: Optional[str] = None,
        walk_in: bool = False,
        notes: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        # Slot Conflict Check: Prevent duplicate booking if slot is already occupied on the given date
        def _norm_time(t: str) -> str:
            if not t:
                return ""
            clean = re.sub(r"\s+", " ", t.strip().upper())
            if re.match(r"^\d:\d{2}\s*(AM|PM)$", clean):
                clean = "0" + clean
            return clean

        target_norm_time = _norm_time(booking_time)
        existing_res = await self.session.execute(
            select(Appointment).where(
                Appointment.tenantId == tenant_id,
                Appointment.bookingDate == booking_date,
                Appointment.status.in_([
                    AppointmentStatus.SCHEDULED,
                    AppointmentStatus.REQUESTED,
                ])
            )
        )
        for existing in existing_res.scalars().all():
            if _norm_time(existing.bookingTime) == target_norm_time:
                raise ValueError(
                    f"Slot {booking_time} on {booking_date} is already booked for patient '{existing.customerName}' ({existing.appointmentNumber})."
                )

        # Generate friendly appointment number
        res = await self.session.execute(
            select(TenantAppointmentCounter).where(TenantAppointmentCounter.tenantId == tenant_id).with_for_update()
        )
        counter = res.scalar_one_or_none()

        max_num = 1000
        existing_appts_res = await self.session.execute(
            select(Appointment.appointmentNumber).where(Appointment.tenantId == tenant_id)
        )
        for num_str in existing_appts_res.scalars().all():
            if num_str and num_str.startswith("APT-"):
                try:
                    val = int(num_str.split("-")[1])
                    if val > max_num:
                        max_num = val
                except (ValueError, IndexError):
                    pass

        if not counter:
            next_num = max_num + 1
            counter = TenantAppointmentCounter(
                tenantId=tenant_id,
                lastNumber=next_num,
                updatedAt=datetime.utcnow()
            )
            self.session.add(counter)
        else:
            next_num = max(counter.lastNumber + 1, max_num + 1)
            counter.lastNumber = next_num
            counter.updatedAt = datetime.utcnow()

        meta = dict(metadata or {})
        if age:
            meta["age"] = str(age).strip()
        if place:
            meta["place"] = str(place).strip()
            meta["location"] = str(place).strip()

        appt = Appointment(
            id=uuid.uuid4(),
            tenantId=tenant_id,
            agentId=None,
            callSessionId=None,
            appointmentNumber=f"APT-{next_num}",
            customerName=customer_name,
            customerPhone=customer_phone,
            title=title or "Consultation",
            resourceName=resource_name,
            bookingDate=booking_date,
            bookingTime=booking_time,
            status=AppointmentStatus.SCHEDULED,
            bookedBy=booked_by or "RECEPTIONIST",
            bookedByName=booked_by_name or ("Walk-in Desk Receptionist" if booked_by == "RECEPTIONIST" else "Client Portal"),
            age=str(age).strip() if age else None,
            place=str(place).strip() if place else None,
            walkIn=walk_in,
            notes=notes,
            metadataJson=meta,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )
        self.session.add(appt)
        await self.session.commit()

        result = await self.get_appointment(appt.id, tenant_id)
        return result or {
            "id": str(appt.id),
            "appointmentNumber": appt.appointmentNumber,
            "customerName": appt.customerName,
            "customerPhone": appt.customerPhone,
            "bookingDate": appt.bookingDate,
            "bookingTime": appt.bookingTime,
            "status": "SCHEDULED",
            "bookedBy": appt.bookedBy,
            "bookedByName": appt.bookedByName,
            "walkIn": appt.walkIn,
        }

    async def reset_tenant_data(self, tenant_id: uuid.UUID) -> Dict[str, Any]:
        """Clears all operational CRM data (appointments, leads, call logs) for a tenant
        without affecting agent configurations, settings, or knowledge base.
        """
        # Delete appointments
        appt_res = await self.session.execute(
            delete(Appointment).where(Appointment.tenantId == tenant_id)
        )
        appts_deleted = appt_res.rowcount or 0

        # Delete leads
        lead_res = await self.session.execute(
            delete(Lead).where(Lead.tenantId == tenant_id)
        )
        leads_deleted = lead_res.rowcount or 0

        # Delete call sessions
        call_res = await self.session.execute(
            delete(CallSession).where(CallSession.tenantId == tenant_id)
        )
        calls_deleted = call_res.rowcount or 0

        # Reset appointment counter to 1000
        counter_res = await self.session.execute(
            select(TenantAppointmentCounter).where(TenantAppointmentCounter.tenantId == tenant_id)
        )
        counter = counter_res.scalar_one_or_none()
        if counter:
            counter.lastNumber = 1000
            counter.updatedAt = datetime.utcnow()

        await self.session.commit()
        logger.info(f"Reset operational data for tenant {tenant_id}: {appts_deleted} appts, {leads_deleted} leads, {calls_deleted} call sessions deleted.")

        return {
            "success": True,
            "message": "Operational data reset successfully",
            "deletedCounts": {
                "appointments": appts_deleted,
                "leads": leads_deleted,
                "callSessions": calls_deleted,
            }
        }

    async def check_slots(
        self,
        tenant_id: uuid.UUID,
        booking_date: str,
        phone: Optional[str] = None,
        preferred_time: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Calculates available clinic slots for a given date, detects if preferred slot is free,
        and checks if the caller already has an active upcoming appointment.
        """
        standard_slots = [
            "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
            "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM",
            "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
            "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
            "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM"
        ]

        res = await self.session.execute(
            select(Appointment).where(
                Appointment.tenantId == tenant_id,
                Appointment.bookingDate == booking_date,
                Appointment.status.in_([
                    AppointmentStatus.SCHEDULED,
                    AppointmentStatus.REQUESTED,
                ])
            )
        )
        day_appointments = res.scalars().all()

        def _norm_time(t: str) -> str:
            return re.sub(r"\s+", " ", t.strip().upper())

        booked_slots = set()
        for a in day_appointments:
            booked_slots.add(_norm_time(a.bookingTime))

        available_slots = [s for s in standard_slots if _norm_time(s) not in booked_slots]

        slot_available = True
        normalized_pref = _norm_time(preferred_time) if preferred_time else None
        if normalized_pref:
            matched_booked = any(
                _norm_time(b) == normalized_pref
                or _norm_time(b).replace(":00", "") == normalized_pref.replace(":00", "")
                or _norm_time(b).lstrip("0") == normalized_pref.lstrip("0")
                for b in booked_slots
            )
            if matched_booked:
                slot_available = False

        existing_booking = None
        if phone:
            norm_phone = re.sub(r"[^\d+]", "", phone.strip())
            today_iso = datetime.utcnow().strftime("%Y-%m-%d")
            phone_res = await self.session.execute(
                select(Appointment).where(
                    Appointment.tenantId == tenant_id,
                    Appointment.customerPhone.like(f"%{norm_phone[-10:]}%"),
                    Appointment.bookingDate >= today_iso,
                    Appointment.status.in_([
                        AppointmentStatus.SCHEDULED,
                        AppointmentStatus.REQUESTED,
                    ])
                ).order_by(Appointment.bookingDate.asc(), Appointment.createdAt.desc())
            )
            existing_appt = phone_res.scalars().first()
            if existing_appt:
                existing_booking = {
                    "id": str(existing_appt.id),
                    "appointmentNumber": existing_appt.appointmentNumber,
                    "customerName": existing_appt.customerName,
                    "customerPhone": existing_appt.customerPhone,
                    "bookingDate": existing_appt.bookingDate,
                    "bookingTime": existing_appt.bookingTime,
                    "service": existing_appt.title,
                    "status": existing_appt.status.value if hasattr(existing_appt.status, "value") else str(existing_appt.status),
                    "bookedBy": existing_appt.bookedBy,
                }

        return {
            "bookingDate": booking_date,
            "preferredTime": preferred_time,
            "slotAvailable": slot_available,
            "bookedSlots": list(booked_slots),
            "availableSlots": available_slots[:8],
            "totalAvailable": len(available_slots),
            "hasExistingBooking": bool(existing_booking),
            "existingBooking": existing_booking,
        }

    async def reschedule_appointment(
        self,
        tenant_id: uuid.UUID,
        new_date: str,
        new_time: str,
        appointment_id: Optional[uuid.UUID] = None,
        phone: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        query = select(Appointment).where(
            Appointment.tenantId == tenant_id,
            Appointment.status.in_([
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.REQUESTED,
            ])
        )
        if appointment_id:
            query = query.where(Appointment.id == appointment_id)
        elif phone:
            norm_phone = re.sub(r"[^\d+]", "", phone.strip())
            query = query.where(Appointment.customerPhone.like(f"%{norm_phone[-10:]}%")).order_by(Appointment.createdAt.desc())
        else:
            return None

        res = await self.session.execute(query)
        appt = res.scalars().first()
        if not appt:
            return None

        appt.bookingDate = new_date
        appt.bookingTime = new_time
        appt.status = AppointmentStatus.SCHEDULED
        current_meta = dict(appt.metadataJson or {})
        current_meta["rescheduledAt"] = datetime.utcnow().isoformat()
        if reason:
            current_meta["rescheduleReason"] = reason
        appt.metadataJson = current_meta
        appt.updatedAt = datetime.utcnow()
        await self.session.commit()
        return await self.get_appointment(appt.id, tenant_id)

    # Phone Numbers
    async def list_phone_numbers(self, tenant_id: uuid.UUID) -> List[Dict[str, Any]]:
        res = await self.session.execute(
            select(PhoneNumber).where(PhoneNumber.tenantId == tenant_id)
        )
        numbers = res.scalars().all()
        return [
            {
                "id": str(p.id),
                "tenantId": str(p.tenantId),
                "agentId": str(p.agentId) if p.agentId else None,
                "phoneNumber": p.phoneNumber,
                "provider": p.provider,
                "status": p.status,
                "createdAt": p.createdAt.isoformat() if p.createdAt else None,
            }
            for p in numbers
        ]

    # Follow-ups
    async def list_follow_ups(
        self, tenant_id: uuid.UUID, limit: int = 20, offset: int = 0,
        status: Optional[str] = None, channel: Optional[str] = None
    ) -> Dict[str, Any]:
        query = select(FollowUp).where(FollowUp.tenantId == tenant_id)
        if status:
            try:
                query = query.where(FollowUp.status == FollowUpStatus(status))
            except Exception:
                pass
        if channel:
            query = query.where(FollowUp.channel == channel)

        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.session.execute(count_query)).scalar_one()

        query = query.order_by(FollowUp.createdAt.desc()).limit(limit).offset(offset)
        res = await self.session.execute(query)
        items = res.scalars().all()

        return {
            "followUps": [
                {
                    "id": str(f.id),
                    "tenantId": str(f.tenantId),
                    "callSessionId": str(f.callSessionId) if f.callSessionId else None,
                    "recipientPhone": f.customerPhone,
                    "recipientName": f.customerName,
                    "channel": f.channel,
                    "messageContent": f.messageText,
                    "status": f.status.value if hasattr(f.status, "value") else str(f.status),
                    "sentAt": f.sentAt.isoformat() if f.sentAt else None,
                    "deliveredAt": f.deliveredAt.isoformat() if f.deliveredAt else None,
                    "createdAt": f.createdAt.isoformat() if f.createdAt else None,
                }
                for f in items
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }

    async def get_follow_up(self, follow_up_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        res = await self.session.execute(
            select(FollowUp).where(and_(FollowUp.id == follow_up_id, FollowUp.tenantId == tenant_id))
        )
        f = res.scalar_one_or_none()
        if not f:
            return None
        return {
            "id": str(f.id),
            "tenantId": str(f.tenantId),
            "callSessionId": str(f.callSessionId) if f.callSessionId else None,
            "recipientPhone": f.customerPhone,
            "recipientName": f.customerName,
            "channel": f.channel,
            "messageContent": f.messageText,
            "status": f.status.value if hasattr(f.status, "value") else str(f.status),
            "sentAt": f.sentAt.isoformat() if f.sentAt else None,
            "deliveredAt": f.deliveredAt.isoformat() if f.deliveredAt else None,
            "createdAt": f.createdAt.isoformat() if f.createdAt else None,
        }

    # WhatsApp Dispatch (Demo / Simulated)
    async def send_whatsapp(self, tenant_id: uuid.UUID, data: Dict[str, Any]) -> Dict[str, Any]:
        customer_phone = data["customerPhone"]
        message = data["message"]
        now = datetime.utcnow()
        demo_msg_id = f"demo_wa_{int(now.timestamp())}_{uuid.uuid4().hex[:6]}"

        follow_up = FollowUp(
            id=uuid.uuid4(),
            tenantId=tenant_id,
            callSessionId=uuid.UUID(data["callSessionId"]) if data.get("callSessionId") else None,
            customerPhone=customer_phone,
            customerName=data.get("customerName"),
            channel="WHATSAPP",
            provider="DEMO",
            messageType=data.get("messageType", "CUSTOM"),
            messageText=message,
            status=FollowUpStatus.DELIVERED,
            providerMessageId=demo_msg_id,
            isDemo=True,
            sentAt=now,
            deliveredAt=now,
            createdAt=now,
            updatedAt=now
        )
        self.session.add(follow_up)
        await self.session.commit()

        return {
            "success": True,
            "followUpId": str(follow_up.id),
            "status": "DELIVERED",
            "provider": "DEMO",
            "providerMessageId": demo_msg_id,
            "isDemo": True,
            "message": "Message simulated and delivered via Demo WhatsApp Provider"
        }


    # Analytics Overview
    async def get_analytics_overview(self, tenant_id: uuid.UUID) -> Dict[str, Any]:
        calls_res = await self.session.execute(
            select(CallSession).where(CallSession.tenantId == tenant_id).order_by(CallSession.startedAt.desc())
        )
        all_calls = calls_res.scalars().all()

        leads_res = await self.session.execute(select(Lead).where(Lead.tenantId == tenant_id))
        all_leads = leads_res.scalars().all()

        appts_res = await self.session.execute(select(Appointment).where(Appointment.tenantId == tenant_id))
        all_appts = appts_res.scalars().all()

        follow_ups_res = await self.session.execute(select(FollowUp).where(FollowUp.tenantId == tenant_id))
        all_follow_ups = follow_ups_res.scalars().all()

        total_calls = len(all_calls)
        connected_calls = 0
        total_duration = 0
        call_outcomes = {"completed": 0, "missed": 0, "failed": 0, "active": 0}
        directions = {"inbound": 0, "outbound": 0, "webTest": 0}
        language_map: Dict[str, int] = {}
        tool_map: Dict[str, int] = {}

        now = datetime.utcnow()
        date_map = {}
        for i in range(6, -1, -1):
            d = now - timedelta(days=i)
            key = d.strftime("%Y-%m-%d")
            date_map[key] = {"total": 0, "completed": 0, "missed": 0, "failed": 0}

        for c in all_calls:
            total_duration += (c.durationSeconds or 0)
            if c.status == CallStatus.COMPLETED:
                connected_calls += 1
                call_outcomes["completed"] += 1
            elif c.status == CallStatus.MISSED:
                call_outcomes["missed"] += 1
            elif c.status == CallStatus.FAILED:
                call_outcomes["failed"] += 1
            elif c.status == CallStatus.ACTIVE:
                call_outcomes["active"] += 1

            if c.direction == CallDirection.INBOUND:
                directions["inbound"] += 1
            elif c.direction == CallDirection.OUTBOUND:
                directions["outbound"] += 1
            elif c.direction == CallDirection.WEB_TEST:
                directions["webTest"] += 1

            if c.toolsUsed:
                for t in c.toolsUsed:
                    name = t if isinstance(t, str) else t.get("toolName", t.get("name"))
                    if name:
                        tool_map[name] = tool_map.get(name, 0) + 1

            if c.startedAt:
                d_key = c.startedAt.strftime("%Y-%m-%d")
                if d_key in date_map:
                    date_map[d_key]["total"] += 1
                    if c.status == CallStatus.COMPLETED:
                        date_map[d_key]["completed"] += 1
                    elif c.status == CallStatus.MISSED:
                        date_map[d_key]["missed"] += 1
                    elif c.status == CallStatus.FAILED:
                        date_map[d_key]["failed"] += 1

        avg_duration = round(total_duration / total_calls) if total_calls > 0 else 0

        lead_funnel = {"new": 0, "contacted": 0, "qualified": 0, "closed": 0}
        qualified_leads = 0
        for l in all_leads:
            if l.status == LeadStatus.NEW:
                lead_funnel["new"] += 1
            elif l.status == LeadStatus.CONTACTED:
                lead_funnel["contacted"] += 1
            elif l.status == LeadStatus.QUALIFIED:
                lead_funnel["qualified"] += 1
                qualified_leads += 1
            elif l.status == LeadStatus.CLOSED:
                lead_funnel["closed"] += 1

        appointment_status = {"requested": 0, "confirmed": 0, "cancelled": 0}
        confirmed_appts = 0
        requested_appts = 0
        for a in all_appts:
            if a.status == AppointmentStatus.SCHEDULED or a.status == AppointmentStatus.CONFIRMED:
                confirmed_appts += 1
                appointment_status["confirmed"] += 1
            elif a.status == AppointmentStatus.CANCELLED:
                appointment_status["cancelled"] += 1

        pending_follow_ups = sum(1 for f in all_follow_ups if f.status == FollowUpStatus.PENDING)
        sent_follow_ups = len(all_follow_ups) - pending_follow_ups

        return {
            "totalCalls": total_calls,
            "connectedCalls": connected_calls,
            "totalDurationSeconds": total_duration,
            "averageDurationSeconds": avg_duration,
            "totalLeads": len(all_leads),
            "qualifiedLeads": qualified_leads,
            "totalAppointments": len(all_appts),
            "confirmedAppointments": confirmed_appts,
            "requestedAppointments": requested_appts,
            "pendingFollowUps": pending_follow_ups,
            "sentFollowUps": sent_follow_ups,
            "callTrend": [{"date": k, **v} for k, v in date_map.items()],
            "callOutcomes": call_outcomes,
            "leadFunnel": lead_funnel,
            "appointmentStatus": appointment_status,
            "languages": [{"language": "en-IN", "count": total_calls, "percentage": 100}],
            "directions": directions,
            "toolUsage": [{"toolName": k, "count": v} for k, v in tool_map.items()],
            "performance": {
                "avgTurnLatencyMs": 350,
                "avgSttLatencyMs": 120,
                "avgLlmLatencyMs": 180,
                "avgTtsLatencyMs": 50,
            }
        }

    # Receptionist Staff Management
    async def list_receptionists(self, tenant_id: uuid.UUID) -> List[Dict[str, Any]]:
        res = await self.session.execute(
            select(User).where(
                and_(
                    User.tenantId == tenant_id,
                    User.role == UserRole.CLIENT_RECEPTIONIST
                )
            ).order_by(User.createdAt.desc())
        )
        users = res.scalars().all()
        return [
            {
                "id": str(u.id),
                "tenantId": str(u.tenantId),
                "name": u.name or u.email.split("@")[0],
                "email": u.email,
                "role": u.role.value if hasattr(u.role, "value") else str(u.role),
                "isActive": getattr(u, "isActive", True),
                "createdAt": u.createdAt.isoformat() if u.createdAt else None,
            }
            for u in users
        ]

    async def create_receptionist(
        self,
        tenant_id: uuid.UUID,
        name: str,
        email: str,
        password: str
    ) -> Dict[str, Any]:
        from ..auth.password import hash_password
        clean_email = email.strip().lower()
        existing_res = await self.session.execute(select(User).where(User.email == clean_email))
        if existing_res.scalar_one_or_none():
            raise ValueError(f"Email {clean_email} is already registered.")

        new_user = User(
            id=uuid.uuid4(),
            tenantId=tenant_id,
            name=name.strip(),
            email=clean_email,
            passwordHash=hash_password(password.strip()),
            role=UserRole.CLIENT_RECEPTIONIST,
            isActive=True,
            emailVerified=True,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )
        self.session.add(new_user)
        await self.session.commit()
        return {
            "id": str(new_user.id),
            "tenantId": str(new_user.tenantId),
            "name": new_user.name,
            "email": new_user.email,
            "role": "CLIENT_RECEPTIONIST",
            "isActive": True,
            "createdAt": new_user.createdAt.isoformat()
        }

    async def update_receptionist(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        password: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        from ..auth.password import hash_password
        res = await self.session.execute(
            select(User).where(and_(User.id == user_id, User.tenantId == tenant_id, User.role == UserRole.CLIENT_RECEPTIONIST))
        )
        u = res.scalar_one_or_none()
        if not u:
            return None

        if name is not None and name.strip():
            u.name = name.strip()
        if is_active is not None:
            u.isActive = is_active
        if password is not None and password.strip():
            u.passwordHash = hash_password(password.strip())
        u.updatedAt = datetime.utcnow()
        await self.session.commit()

        return {
            "id": str(u.id),
            "tenantId": str(u.tenantId),
            "name": u.name or u.email.split("@")[0],
            "email": u.email,
            "role": "CLIENT_RECEPTIONIST",
            "isActive": u.isActive,
            "createdAt": u.createdAt.isoformat() if u.createdAt else None
        }

    async def delete_receptionist(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        res = await self.session.execute(
            select(User).where(and_(User.id == user_id, User.tenantId == tenant_id, User.role == UserRole.CLIENT_RECEPTIONIST))
        )
        u = res.scalar_one_or_none()
        if not u:
            return False
        await self.session.delete(u)
        await self.session.commit()
        return True
