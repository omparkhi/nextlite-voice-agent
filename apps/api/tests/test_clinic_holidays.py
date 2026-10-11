import pytest
import uuid
from datetime import datetime
from app.models import ClinicHoliday, Tenant
from app.schemas import ClinicHolidayCreate, ClinicHolidayUpdate, RuntimeHolidayDefinition, RuntimeAgentConfig
from app.repositories.repositories import ClinicHolidayRepository


@pytest.mark.asyncio
async def test_clinic_holiday_schemas():
    create_dto = ClinicHolidayCreate(
        name="Diwali Holiday",
        start_date="2026-10-24",
        end_date="2026-10-26",
        is_entire_day=True,
        notes="Clinic closed for festival"
    )
    assert create_dto.name == "Diwali Holiday"
    assert create_dto.start_date == "2026-10-24"
    assert create_dto.end_date == "2026-10-26"

    runtime_def = RuntimeHolidayDefinition(
        id=str(uuid.uuid4()),
        name=create_dto.name,
        start_date=create_dto.start_date,
        end_date=create_dto.end_date,
        is_entire_day=True,
        notes=create_dto.notes
    )
    assert runtime_def.name == "Diwali Holiday"


@pytest.mark.asyncio
async def test_clinic_holiday_model_instantiation():
    t_id = uuid.uuid4()
    holiday = ClinicHoliday(
        tenantId=t_id,
        name="Ganpati Festival",
        startDate="2026-09-15",
        endDate="2026-09-17",
        isEntireDay=True,
        notes="Closed all day"
    )
    assert holiday.tenantId == t_id
    assert holiday.name == "Ganpati Festival"
    assert holiday.startDate == "2026-09-15"
    assert holiday.endDate == "2026-09-17"
    assert holiday.isEntireDay is True
