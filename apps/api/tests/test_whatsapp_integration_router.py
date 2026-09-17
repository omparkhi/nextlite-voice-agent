import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete
from app.main import app
from app.db import get_db
from app.models import Tenant, Appointment, Agent


@pytest.mark.asyncio
async def test_whatsapp_slots_and_booking_flow():
    test_phone = "+919876543210"
    test_date = "2026-09-30"

    # Get active tenant and agent from database
    tenant_id = None
    async for db in get_db():
        t_res = await db.execute(select(Tenant).limit(1))
        tenant = t_res.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(id=uuid.uuid4(), name="Test WhatsApp Clinic")
            db.add(tenant)
            await db.commit()
            await db.refresh(tenant)
        tenant_id = str(tenant.id)

        # Cleanup any leftovers from prior runs
        await db.execute(delete(Appointment).where(Appointment.customerPhone == test_phone))
        await db.commit()
        break

    assert tenant_id is not None

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Test Missing Tenant Security Rejection (HTTP 400)
        res_no_tenant = await client.get(f"/api/v1/integrations/whatsapp/slots?date={test_date}")
        assert res_no_tenant.status_code == 400
        assert "tenant id is required" in res_no_tenant.json()["detail"].lower()

        # 2. Test Invalid Tenant UUID (HTTP 400)
        res_invalid_tenant = await client.get(f"/api/v1/integrations/whatsapp/slots?date={test_date}&tenantId=invalid-uuid")
        assert res_invalid_tenant.status_code == 400

        # 3. Test Non-Existent Tenant (HTTP 404)
        random_uuid = str(uuid.uuid4())
        res_nonexistent = await client.get(f"/api/v1/integrations/whatsapp/slots?date={test_date}&tenantId={random_uuid}")
        assert res_nonexistent.status_code == 404

        # 4. Test Slot Checking with Valid Tenant
        res_slots = await client.get(f"/api/v1/integrations/whatsapp/slots?date={test_date}&tenantId={tenant_id}")
        assert res_slots.status_code == 200
        data_slots = res_slots.json()
        assert data_slots["status"] == "success"
        assert "05:00 PM" in data_slots["availableSlots"]

        # 5. Test Booking via WhatsApp with Tenant ID
        book_payload = {
            "tenantId": tenant_id,
            "customerName": "Rohan Deshmukh (WhatsApp Test)",
            "customerPhone": test_phone,
            "bookingDate": test_date,
            "bookingTime": "05:00 PM",
            "title": "Dental Checkup",
            "age": "28",
            "place": "Pune",
            "notes": "Testing WhatsApp integration endpoint"
        }
        res_book = await client.post("/api/v1/integrations/whatsapp/appointments/book", json=book_payload)
        assert res_book.status_code == 201, f"Booking failed with {res_book.status_code}: {res_book.text}"
        data_book = res_book.json()
        assert data_book["status"] == "success"
        assert data_book["appointment"]["bookedBy"] == "WHATSAPP"

        # 6. Test Duplicate Booking Collision (HTTP 409)
        res_dup = await client.post("/api/v1/integrations/whatsapp/appointments/book", json=book_payload)
        assert res_dup.status_code == 409
        data_dup = res_dup.json()
        assert "already booked" in data_dup["detail"].lower()

        # 7. Verify 05:00 PM is now in bookedSlots
        res_slots_after = await client.get(f"/api/v1/integrations/whatsapp/slots?date={test_date}&tenantId={tenant_id}")
        assert res_slots_after.status_code == 200
        assert "05:00 PM" not in res_slots_after.json()["availableSlots"]

        # 8. Test Listing WhatsApp Bookings via Integration Endpoint
        res_list = await client.get(f"/api/v1/integrations/whatsapp/appointments?tenantId={tenant_id}")
        assert res_list.status_code == 200
        assert len(res_list.json()["appointments"]) >= 1

        # 9. Test Cancellation via WhatsApp
        cancel_payload = {
            "tenantId": tenant_id,
            "appointmentId": data_book["appointment"]["id"]
        }
        res_cancel = await client.post("/api/v1/integrations/whatsapp/appointments/cancel", json=cancel_payload)
        assert res_cancel.status_code == 200
        assert res_cancel.json()["appointment"]["status"] == "CANCELLED"

