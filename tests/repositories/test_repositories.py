import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock
from apps.api.app.models import (
    Tenant, User, Agent, AgentVersion, Deployment, Appointment,
    CallSession, TenantAppointmentCounter, UserRole, VersionStatus,
    DeploymentStatus, DeploymentEnvironment, CallStatus
)
from apps.api.app.repositories import (
    BaseRepository, TenantRepository, UserRepository,
    AgentRepository, AppointmentRepository, CallSessionRepository
)

def test_models_instantiation():
    t_id = uuid.uuid4()
    tenant = Tenant(id=t_id, name="Dental Care Clinic", slug="dental-care")
    assert tenant.id == t_id
    assert tenant.name == "Dental Care Clinic"
    assert tenant.slug == "dental-care"

    user = User(
        tenantId=t_id,
        email="doctor@dentalcare.com",
        passwordHash="argon2_hashed_secret",
        role=UserRole.CLIENT_OWNER
    )
    assert user.email == "doctor@dentalcare.com"
    assert user.role == UserRole.CLIENT_OWNER

@pytest.mark.asyncio
async def test_appointment_number_generation_logic():
    mock_session = AsyncMock()
    repo = AppointmentRepository(mock_session)

    t_id = uuid.uuid4()
    
    # Simulate first counter creation
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    num1 = await repo.get_next_appointment_number(t_id)
    assert num1 == "APT-1001"
    assert mock_session.add.called
    assert mock_session.flush.called

    # Simulate subsequent increment
    existing_counter = TenantAppointmentCounter(tenantId=t_id, lastNumber=1042)
    mock_result.scalar_one_or_none.return_value = existing_counter
    num2 = await repo.get_next_appointment_number(t_id)
    assert num2 == "APT-1043"
    assert existing_counter.lastNumber == 1043

@pytest.mark.asyncio
async def test_tenant_isolation_scoping():
    mock_session = AsyncMock()
    repo = BaseRepository(Agent, mock_session)

    agent_id = uuid.uuid4()
    tenant_a = uuid.uuid4()
    
    mock_agent = Agent(id=agent_id, tenantId=tenant_a, name="Front Desk Bot")
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_agent
    mock_session.execute.return_value = mock_result

    fetched = await repo.get_by_id_scoped(agent_id, tenant_a)
    assert fetched is not None
    assert fetched.tenantId == tenant_a
