import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from ..db import get_db
from ..auth import get_current_user_payload
from ..models import ClinicHoliday
from ..schemas import ClinicHolidayCreate, ClinicHolidayUpdate, ClinicHolidayResponse
from ..repositories.repositories import ClinicHolidayRepository
from ..services.cache_service import invalidate_worker_cache

router = APIRouter(prefix="/api/clinic/holidays", tags=["clinic-holidays"])


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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")


@router.get("/schedule-config")
async def get_clinic_schedule_config(
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    from ..services.crm_service import CRMService
    from ..domain.dynamic_schedule_engine import parse_business_shifts, format_minutes_to_12h

    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    crm_svc = CRMService(session)
    biz_hours, slot_dur, patients_per_slot = await crm_svc._resolve_tenant_schedule_config(tenant_id)

    shifts_raw = parse_business_shifts(biz_hours)
    formatted_shifts = [
        {
            "start": format_minutes_to_12h(s[0]),
            "end": format_minutes_to_12h(s[1]),
            "label": f"{format_minutes_to_12h(s[0])} – {format_minutes_to_12h(s[1])}"
        }
        for s in shifts_raw
    ]

    return {
        "businessHours": biz_hours or "Monday to Saturday: 10:00 AM - 01:00 PM and 06:00 PM - 09:00 PM (Sunday Closed)",
        "slotDuration": slot_dur or "30 mins",
        "patientsPerSlot": patients_per_slot or 1,
        "shifts": formatted_shifts,
        "timezone": "Asia/Kolkata",
    }


@router.get("", response_model=List[ClinicHolidayResponse])
async def list_clinic_holidays(
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    tenant_id = resolve_tenant_id(payload, tenant_id_param)
    repo = ClinicHolidayRepository(session)
    holidays = await repo.list_for_tenant(tenant_id)
    return [
        ClinicHolidayResponse(
            id=str(h.id),
            tenant_id=str(h.tenantId),
            name=h.name,
            start_date=h.startDate,
            end_date=h.endDate,
            is_entire_day=h.isEntireDay,
            notes=h.notes,
            created_at=h.createdAt,
            updated_at=h.updatedAt
        )
        for h in holidays
    ]


@router.post("", response_model=ClinicHolidayResponse, status_code=status.HTTP_201_CREATED)
async def create_clinic_holiday(
    data: ClinicHolidayCreate,
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)

    # Basic ISO date format validation (YYYY-MM-DD)
    if len(data.start_date.strip()) < 10 or len(data.end_date.strip()) < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dates must be in YYYY-MM-DD format")

    holiday = ClinicHoliday(
        tenantId=tenant_id,
        name=data.name.strip(),
        startDate=data.start_date.strip()[:10],
        endDate=data.end_date.strip()[:10],
        isEntireDay=data.is_entire_day,
        notes=data.notes.strip() if data.notes else None
    )
    session.add(holiday)
    await session.commit()
    await session.refresh(holiday)

    # Invalidate runtime config cache so voice worker picks up new holidays immediately
    await invalidate_worker_cache(tenant_id)

    return ClinicHolidayResponse(
        id=str(holiday.id),
        tenant_id=str(holiday.tenantId),
        name=holiday.name,
        start_date=holiday.startDate,
        end_date=holiday.endDate,
        is_entire_day=holiday.isEntireDay,
        notes=holiday.notes,
        created_at=holiday.createdAt,
        updated_at=holiday.updatedAt
    )


@router.put("/{holiday_id}", response_model=ClinicHolidayResponse)
async def update_clinic_holiday(
    holiday_id: str,
    data: ClinicHolidayUpdate,
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)

    repo = ClinicHolidayRepository(session)
    holiday = await repo.get_by_id(uuid.UUID(holiday_id))
    if not holiday or holiday.tenantId != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday closure not found")

    if data.name is not None:
        holiday.name = data.name.strip()
    if data.start_date is not None:
        holiday.startDate = data.start_date.strip()[:10]
    if data.end_date is not None:
        holiday.endDate = data.end_date.strip()[:10]
    if data.is_entire_day is not None:
        holiday.isEntireDay = data.is_entire_day
    if data.notes is not None:
        holiday.notes = data.notes.strip() if data.notes else None

    await session.commit()
    await session.refresh(holiday)

    await invalidate_worker_cache(tenant_id)

    return ClinicHolidayResponse(
        id=str(holiday.id),
        tenant_id=str(holiday.tenantId),
        name=holiday.name,
        start_date=holiday.startDate,
        end_date=holiday.endDate,
        is_entire_day=holiday.isEntireDay,
        notes=holiday.notes,
        created_at=holiday.createdAt,
        updated_at=holiday.updatedAt
    )


@router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_clinic_holiday(
    holiday_id: str,
    tenant_id_param: Optional[str] = Query(None, alias="tenantId"),
    payload: Dict[str, Any] = Depends(get_current_user_payload),
    session: AsyncSession = Depends(get_db)
):
    require_mutation_role(payload)
    tenant_id = resolve_tenant_id(payload, tenant_id_param)

    repo = ClinicHolidayRepository(session)
    holiday = await repo.get_by_id(uuid.UUID(holiday_id))
    if not holiday or holiday.tenantId != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday closure not found")

    await repo.delete(holiday)
    await session.commit()

    await invalidate_worker_cache(tenant_id)
    return None
