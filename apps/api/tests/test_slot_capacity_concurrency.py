import pytest
import uuid
import asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete
from app.main import app
from app.db import get_db, AsyncSessionLocal
from app.config import settings
from app.models import Tenant, User, UserRole, Appointment, Agent, AgentVersion, AgentTemplate, AgentStatus, VersionStatus, TenantAppointmentCounter
from app.services.crm_service import CRMService
from app.domain.dynamic_schedule_engine import extract_business_schedule_from_version, parse_patients_per_slot

AUTH_HEADERS = {
    "x-worker-secret": settings.WORKER_API_SECRET or "dev-worker-api-secret"
}


async def create_test_clinic(session, name: str, patients_per_slot: int = 1):
    # Template
    res = await session.execute(select(AgentTemplate).limit(1))
    tpl = res.scalar_one_or_none()
    if not tpl:
        tpl = AgentTemplate(
            id=uuid.uuid4(),
            name="Test Template",
            description="Test description",
            industry="Medical",
            defaultConfiguration={},
            isSystem=True,
        )
        session.add(tpl)
        await session.flush()

    # Tenant
    tenant = Tenant(id=uuid.uuid4(), name=name, slug=f"slug-{uuid.uuid4().hex[:8]}")
    session.add(tenant)
    await session.flush()

    # User
    user = User(
        id=uuid.uuid4(),
        tenantId=tenant.id,
        email=f"admin-{uuid.uuid4().hex[:6]}@clinic.com",
        passwordHash="test-password-hash",
        role=UserRole.ADMIN,
    )
    session.add(user)
    await session.flush()

    # Agent
    agent = Agent(
        id=uuid.uuid4(),
        tenantId=tenant.id,
        templateId=tpl.id,
        name=f"{name} Voice Agent",
        status=AgentStatus.LIVE,
    )
    session.add(agent)
    await session.flush()

    # AgentVersion
    version = AgentVersion(
        id=uuid.uuid4(),
        agentId=agent.id,
        versionNumber=1,
        createdBy=user.id,
        status=VersionStatus.PUBLISHED,
        configuration={"variables": [{"name": "patientsPerSlot", "value": patients_per_slot}]},
    )
    session.add(version)
    await session.commit()

    return tenant, user, agent, version


async def cleanup_test_clinic(session, tenant_id: uuid.UUID):
    try:
        await session.execute(delete(Appointment).where(Appointment.tenantId == tenant_id))
        res_agents = await session.execute(select(Agent.id).where(Agent.tenantId == tenant_id))
        agent_ids = res_agents.scalars().all()
        if agent_ids:
            await session.execute(delete(AgentVersion).where(AgentVersion.agentId.in_(agent_ids)))
        await session.execute(delete(Agent).where(Agent.tenantId == tenant_id))
        await session.execute(delete(User).where(User.tenantId == tenant_id))
        await session.execute(delete(TenantAppointmentCounter).where(TenantAppointmentCounter.tenantId == tenant_id))
        await session.execute(delete(Tenant).where(Tenant.id == tenant_id))
        await session.commit()
    except Exception:
        await session.rollback()


@pytest.mark.asyncio
async def test_dynamic_schedule_engine_capacity_parsing():
    # 1. Default patientsPerSlot = 1
    assert parse_patients_per_slot(None) == 1
    assert parse_patients_per_slot({}) == 1
    assert parse_patients_per_slot(0) == 1
    assert parse_patients_per_slot(-5) == 1

    # 2. patientsPerSlot = 3
    assert parse_patients_per_slot(3) == 3
    assert parse_patients_per_slot("3") == 3

    # 3. patientsPerSlot = 5
    assert parse_patients_per_slot(5) == 5
    assert parse_patients_per_slot("5") == 5

    # Test extract_business_schedule_from_version with various alias formats
    cfg_default = {"variables": []}
    _, _, cap_default = extract_business_schedule_from_version(cfg_default)
    assert cap_default == 1

    cfg_3 = {"variables": [{"name": "patientsPerSlot", "value": "3"}]}
    _, _, cap_3 = extract_business_schedule_from_version(cfg_3)
    assert cap_3 == 3

    cfg_5 = {"variables": [{"name": "patients_per_slot", "value": 5}]}
    _, _, cap_5 = extract_business_schedule_from_version(cfg_5)
    assert cap_5 == 5


@pytest.mark.asyncio
async def test_slot_availability_progression_0_to_3():
    """
    Tests:
    4. 0/3 availability
    5. 1/3 availability
    6. 2/3 availability
    7. 3/3 full
    8. Fourth booking rejected
    15. Existing single-patient regression
    """
    test_date = "2026-10-15"
    target_slot = "10:00 AM"

    async with AsyncSessionLocal() as session:
        tenant, _, _, _ = await create_test_clinic(session, "Progression Clinic", patients_per_slot=3)
        tenant_id = str(tenant.id)

        crm = CRMService(session)

        # 4. 0/3 Availability Check
        slots_0 = await crm.check_slots(tenant_id=tenant_id, booking_date=test_date, patients_per_slot=3)
        assert target_slot in slots_0["availableSlots"]
        meta_0 = next(m for m in slots_0["slotMetadata"] if m["slot"] == target_slot)
        assert meta_0["capacity"] == 3
        assert meta_0["bookedCount"] == 0
        assert meta_0["remainingCapacity"] == 3
        assert meta_0["available"] is True

        # Book 1st patient
        appt1 = await crm.create_appointment(
            tenant_id=tenant_id,
            customer_name="Patient 1",
            customer_phone="+919111111111",
            booking_date=test_date,
            booking_time=target_slot,
            patients_per_slot=3,
        )
        assert appt1.get("id") or appt1.get("appointmentNumber")

        # 5. 1/3 Availability Check
        slots_1 = await crm.check_slots(tenant_id=tenant_id, booking_date=test_date, patients_per_slot=3)
        assert target_slot in slots_1["availableSlots"]
        meta_1 = next(m for m in slots_1["slotMetadata"] if m["slot"] == target_slot)
        assert meta_1["capacity"] == 3
        assert meta_1["bookedCount"] == 1
        assert meta_1["remainingCapacity"] == 2
        assert meta_1["available"] is True

        # Book 2nd patient
        appt2 = await crm.create_appointment(
            tenant_id=tenant_id,
            customer_name="Patient 2",
            customer_phone="+919222222222",
            booking_date=test_date,
            booking_time=target_slot,
            patients_per_slot=3,
        )
        assert appt2.get("id") or appt2.get("appointmentNumber")

        # 6. 2/3 Availability Check
        slots_2 = await crm.check_slots(tenant_id=tenant_id, booking_date=test_date, patients_per_slot=3)
        assert target_slot in slots_2["availableSlots"]
        meta_2 = next(m for m in slots_2["slotMetadata"] if m["slot"] == target_slot)
        assert meta_2["capacity"] == 3
        assert meta_2["bookedCount"] == 2
        assert meta_2["remainingCapacity"] == 1
        assert meta_2["available"] is True

        # Book 3rd patient
        appt3 = await crm.create_appointment(
            tenant_id=tenant_id,
            customer_name="Patient 3",
            customer_phone="+919333333333",
            booking_date=test_date,
            booking_time=target_slot,
            patients_per_slot=3,
        )
        assert appt3.get("id") or appt3.get("appointmentNumber")

        # 7. 3/3 Full Check
        slots_3 = await crm.check_slots(tenant_id=tenant_id, booking_date=test_date, patients_per_slot=3)
        assert target_slot not in slots_3["availableSlots"]
        assert target_slot in slots_3["bookedSlots"]
        meta_3 = next(m for m in slots_3["slotMetadata"] if m["slot"] == target_slot)
        assert meta_3["capacity"] == 3
        assert meta_3["bookedCount"] == 3
        assert meta_3["remainingCapacity"] == 0
        assert meta_3["available"] is False

        # 8. 4th Booking Rejected
        with pytest.raises(ValueError) as excinfo:
            await crm.create_appointment(
                tenant_id=tenant_id,
                customer_name="Patient 4 (Should Fail)",
                customer_phone="+919444444444",
                booking_date=test_date,
                booking_time=target_slot,
                patients_per_slot=3,
            )
        assert "already booked" in str(excinfo.value).lower() or "maximum capacity" in str(excinfo.value).lower()

        # 15. Single patient regression: test tenant with capacity = 1
        tenant_single, _, _, _ = await create_test_clinic(session, "Single Capacity Clinic", patients_per_slot=1)
        single_tenant_id = str(tenant_single.id)

        single_slots_0 = await crm.check_slots(tenant_id=single_tenant_id, booking_date=test_date, patients_per_slot=1)
        assert single_slots_0["capacity"] == 1
        assert target_slot in single_slots_0["availableSlots"]

        await crm.create_appointment(
            tenant_id=single_tenant_id,
            customer_name="Single Patient",
            customer_phone="+919555555555",
            booking_date=test_date,
            booking_time=target_slot,
            patients_per_slot=1,
        )

        single_slots_1 = await crm.check_slots(tenant_id=single_tenant_id, booking_date=test_date, patients_per_slot=1)
        assert target_slot not in single_slots_1["availableSlots"]
        assert target_slot in single_slots_1["bookedSlots"]

        # Cleanup
        await cleanup_test_clinic(session, tenant.id)
        await cleanup_test_clinic(session, tenant_single.id)


@pytest.mark.asyncio
async def test_ai_internal_and_receptionist_booking_paths():
    """
    Tests:
    9. AI booking path (Internal API)
    10. Receptionist booking path (Client API)
    """
    test_date = "2026-10-16"
    target_slot = "11:00 AM"

    async with AsyncSessionLocal() as session:
        tenant, _, _, _ = await create_test_clinic(session, "Channel Test Clinic", patients_per_slot=2)
        tenant_id = str(tenant.id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 9. AI Internal API Booking (Slot 1 of 2)
        ai_payload = {
            "tenant_id": tenant_id,
            "customer_name": "AI Booked Patient",
            "customer_phone": "+919888811111",
            "booking_date": test_date,
            "booking_time": target_slot,
            "patients_per_slot": 2,
            "booked_by": "AGENT",
        }
        res_ai = await client.post("/api/internal/appointments", json=ai_payload, headers=AUTH_HEADERS)
        assert res_ai.status_code == 201, f"AI Booking failed: {res_ai.text}"
        assert res_ai.json().get("id") or res_ai.json().get("appointmentNumber")

        # 10. Check internal slots endpoint
        res_slots = await client.get(
            f"/api/internal/appointments/check-slots?tenant_id={tenant_id}&booking_date={test_date}&patients_per_slot=2",
            headers=AUTH_HEADERS,
        )
        assert res_slots.status_code == 200
        assert target_slot in res_slots.json()["availableSlots"]

        # Book 2nd slot via receptionist
        res_rec = await client.post(
            "/api/internal/appointments",
            json={
                "tenant_id": tenant_id,
                "customer_name": "Receptionist Walk-In Patient",
                "customer_phone": "+919888822222",
                "booking_date": test_date,
                "booking_time": target_slot,
                "patients_per_slot": 2,
                "booked_by": "RECEPTIONIST",
            },
            headers=AUTH_HEADERS,
        )
        assert res_rec.status_code == 201
        assert res_rec.json().get("id") or res_rec.json().get("appointmentNumber")

        # Now slot is 2/2 -> Third booking must fail with 409 Conflict
        res_full = await client.post(
            "/api/internal/appointments",
            json={
                "tenant_id": tenant_id,
                "customer_name": "Rejected 3rd Patient",
                "customer_phone": "+919888833333",
                "booking_date": test_date,
                "booking_time": target_slot,
                "patients_per_slot": 2,
                "booked_by": "AGENT",
            },
            headers=AUTH_HEADERS,
        )
        assert res_full.status_code == 409
        assert "booked" in res_full.json()["detail"].lower() or "capacity" in res_full.json()["detail"].lower()

    # Cleanup
    async with AsyncSessionLocal() as session:
        await cleanup_test_clinic(session, uuid.UUID(tenant_id))


@pytest.mark.asyncio
async def test_tenant_isolation():
    """
    Test 14: Tenant Isolation.
    Tenant A: patientsPerSlot = 1
    Tenant B: patientsPerSlot = 3
    Tenant C: patientsPerSlot = 5
    Ensure configs and bookings in one tenant never leak into another.
    """
    test_date = "2026-10-17"
    target_slot = "10:00 AM"

    async with AsyncSessionLocal() as session:
        t_a, _, _, _ = await create_test_clinic(session, "Tenant A Clinic", patients_per_slot=1)
        t_b, _, _, _ = await create_test_clinic(session, "Tenant B Clinic", patients_per_slot=3)
        t_c, _, _, _ = await create_test_clinic(session, "Tenant C Clinic", patients_per_slot=5)

        crm = CRMService(session)

        # Tenant A: 1 booking fills it up (1/1)
        await crm.create_appointment(
            tenant_id=str(t_a.id),
            customer_name="User A1",
            customer_phone="+919000000001",
            booking_date=test_date,
            booking_time=target_slot,
            patients_per_slot=1,
        )

        # Tenant B: 2 bookings (2/3 -> still available)
        await crm.create_appointment(
            tenant_id=str(t_b.id),
            customer_name="User B1",
            customer_phone="+919000000002",
            booking_date=test_date,
            booking_time=target_slot,
            patients_per_slot=3,
        )
        await crm.create_appointment(
            tenant_id=str(t_b.id),
            customer_name="User B2",
            customer_phone="+919000000003",
            booking_date=test_date,
            booking_time=target_slot,
            patients_per_slot=3,
        )

        # Check Tenant A: full (0 remaining)
        slots_a = await crm.check_slots(tenant_id=str(t_a.id), booking_date=test_date, patients_per_slot=1)
        assert target_slot not in slots_a["availableSlots"]

        # Check Tenant B: available (1 remaining)
        slots_b = await crm.check_slots(tenant_id=str(t_b.id), booking_date=test_date, patients_per_slot=3)
        assert target_slot in slots_b["availableSlots"]
        meta_b = next(m for m in slots_b["slotMetadata"] if m["slot"] == target_slot)
        assert meta_b["remainingCapacity"] == 1
        assert meta_b["bookedCount"] == 2
        assert meta_b["capacity"] == 3

        # Check Tenant C: available (5 remaining)
        slots_c = await crm.check_slots(tenant_id=str(t_c.id), booking_date=test_date, patients_per_slot=5)
        assert target_slot in slots_c["availableSlots"]
        meta_c = next(m for m in slots_c["slotMetadata"] if m["slot"] == target_slot)
        assert meta_c["remainingCapacity"] == 5
        assert meta_c["bookedCount"] == 0
        assert meta_c["capacity"] == 5

        # Cleanup
        await cleanup_test_clinic(session, t_a.id)
        await cleanup_test_clinic(session, t_b.id)
        await cleanup_test_clinic(session, t_c.id)


@pytest.mark.asyncio
async def test_critical_concurrency_capacity_3_existing_2():
    """
    CRITICAL CONCURRENCY TEST 1:
    Capacity = 3, Existing = 2
    Launch 10 simultaneous concurrent booking requests.
    Expected:
    Exactly 1 succeeds, 9 fail with SLOT_CAPACITY_FULL / conflict.
    Active appointments count MUST remain exactly 3 (never 4/3).
    """
    test_date = "2026-10-18"
    target_slot = "10:00 AM"
    capacity = 3

    async with AsyncSessionLocal() as session:
        tenant, _, _, _ = await create_test_clinic(session, "Concurrency Clinic 1", patients_per_slot=capacity)
        tenant_id = str(tenant.id)

        crm = CRMService(session)
        # Pre-populate 2 existing bookings
        for i in [1, 2]:
            await crm.create_appointment(
                tenant_id=tenant_id,
                customer_name=f"Existing Patient {i}",
                customer_phone=f"+9190000000{i}0",
                booking_date=test_date,
                booking_time=target_slot,
                patients_per_slot=capacity,
            )

    async def attempt_booking(client: AsyncClient, patient_idx: int):
        payload = {
            "tenant_id": tenant_id,
            "customer_name": f"Concurrent Racer {patient_idx}",
            "customer_phone": f"+9198000000{patient_idx:02d}",
            "booking_date": test_date,
            "booking_time": target_slot,
            "patients_per_slot": capacity,
            "booked_by": "AGENT",
        }
        res = await client.post("/api/internal/appointments", json=payload, headers=AUTH_HEADERS)
        return res.status_code, res.json()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Launch 10 simultaneous requests
        tasks = [attempt_booking(client, i) for i in range(1, 11)]
        results = await asyncio.gather(*tasks)

    success_count = sum(1 for status, _ in results if status == 201)
    conflict_count = sum(1 for status, _ in results if status == 409)

    assert success_count == 1, f"Expected exactly 1 success, got {success_count} (results: {results})"
    assert conflict_count == 9, f"Expected 9 conflicts, got {conflict_count}"

    # Verify final database count is exactly 3
    async with AsyncSessionLocal() as session:
        crm = CRMService(session)
        slots = await crm.check_slots(tenant_id=tenant_id, booking_date=test_date, patients_per_slot=capacity)
        meta = next(m for m in slots["slotMetadata"] if m["slot"] == target_slot)
        assert meta["bookedCount"] == 3
        assert meta["remainingCapacity"] == 0
        assert meta["available"] is False

        # Cleanup
        await cleanup_test_clinic(session, uuid.UUID(tenant_id))


@pytest.mark.asyncio
async def test_critical_concurrency_capacity_3_existing_0():
    """
    CRITICAL CONCURRENCY TEST 2:
    Capacity = 3, Existing = 0 (empty slot locking)
    Launch 10 simultaneous concurrent booking requests.
    Expected:
    Exactly 3 succeed, 7 fail with SLOT_CAPACITY_FULL / conflict.
    Active appointments count MUST remain exactly 3 (never 4/3).
    """
    test_date = "2026-10-19"
    target_slot = "10:00 AM"
    capacity = 3

    async with AsyncSessionLocal() as session:
        tenant, _, _, _ = await create_test_clinic(session, "Concurrency Clinic 2", patients_per_slot=capacity)
        tenant_id = str(tenant.id)

    async def attempt_booking(client: AsyncClient, patient_idx: int):
        payload = {
            "tenant_id": tenant_id,
            "customer_name": f"Concurrent Racer {patient_idx}",
            "customer_phone": f"+9198111111{patient_idx:02d}",
            "booking_date": test_date,
            "booking_time": target_slot,
            "patients_per_slot": capacity,
            "booked_by": "AGENT",
        }
        res = await client.post("/api/internal/appointments", json=payload, headers=AUTH_HEADERS)
        return res.status_code, res.json()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Launch 10 simultaneous requests into completely empty slot
        tasks = [attempt_booking(client, i) for i in range(1, 11)]
        results = await asyncio.gather(*tasks)

    success_count = sum(1 for status, _ in results if status == 201)
    conflict_count = sum(1 for status, _ in results if status == 409)

    assert success_count == 3, f"Expected exactly 3 successes, got {success_count} (results: {results})"
    assert conflict_count == 7, f"Expected 7 conflicts, got {conflict_count}"

    # Verify final database count is exactly 3
    async with AsyncSessionLocal() as session:
        crm = CRMService(session)
        slots = await crm.check_slots(tenant_id=tenant_id, booking_date=test_date, patients_per_slot=capacity)
        meta = next(m for m in slots["slotMetadata"] if m["slot"] == target_slot)
        assert meta["bookedCount"] == 3
        assert meta["remainingCapacity"] == 0
        assert meta["available"] is False

        # Cleanup
        await cleanup_test_clinic(session, uuid.UUID(tenant_id))
