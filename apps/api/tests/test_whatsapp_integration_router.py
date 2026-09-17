import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import get_db, init_db
from app.models import Tenant, Appointment, AppointmentStatus


@pytest.mark.asyncio
async def test_whatsapp_slots_and_booking_flow():
    test_phone = "+919876543210"
    test_date = "2026-09-30"

    # Cleanup any leftovers from prior runs
    async for db in get_db():
        from sqlalchemy import delete
        await db.execute(delete(Appointment).where(Appointment.customerPhone == test_phone))
        await db.commit()
        break

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Test Slot Checking
        res_slots = await client.get(f"/api/v1/integrations/whatsapp/slots?date={test_date}")
        assert res_slots.status_code == 200
        data_slots = res_slots.json()
        assert data_slots["status"] == "success"
        assert "05:00 PM" in data_slots["availableSlots"]

        # 2. Test Booking via WhatsApp
        book_payload = {
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

        # 3. Test Duplicate Booking Collision (HTTP 409)
        res_dup = await client.post("/api/v1/integrations/whatsapp/appointments/book", json=book_payload)
        assert res_dup.status_code == 409
        data_dup = res_dup.json()
        assert "already booked" in data_dup["detail"].lower()

        # 4. Verify 05:00 PM is now in bookedSlots
        res_slots_after = await client.get(f"/api/v1/integrations/whatsapp/slots?date={test_date}")
        assert res_slots_after.status_code == 200
        assert "05:00 PM" not in res_slots_after.json()["availableSlots"]

        # 5. Test Cancellation via WhatsApp
        cancel_payload = {
            "appointmentId": data_book["appointment"]["id"]
        }
        res_cancel = await client.post("/api/v1/integrations/whatsapp/appointments/cancel", json=cancel_payload)
        assert res_cancel.status_code == 200
        assert res_cancel.json()["appointment"]["status"] == "CANCELLED"
