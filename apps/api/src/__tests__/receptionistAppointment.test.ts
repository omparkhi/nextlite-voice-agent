import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { _resetDemoStore, SAMPLE_DOCTORS } from '../routes/receptionist';

describe('Hospital Receptionist Appointment Attendance & Availability System (Demo)', () => {
  const today = new Date().toISOString().split('T')[0];

  beforeEach(() => {
    _resetDemoStore();
  });

  describe('1. Doctors & Initial Schedule', () => {
    it('should return the list of hospital doctors with specialties', async () => {
      const res = await request(app).get('/api/appointments/doctors');
      expect(res.status).toBe(200);
      expect(res.body.doctors).toBeDefined();
      expect(res.body.doctors.length).toBe(SAMPLE_DOCTORS.length);
      expect(res.body.doctors[0].name).toBe('Dr. Rajesh Sharma');
    });

    it('should return empty/available schedule when no appointments are booked', async () => {
      const res = await request(app)
        .get('/api/appointments/schedule')
        .query({ doctorId: 'doc-sharma', date: today });

      expect(res.status).toBe(200);
      expect(res.body.doctor.id).toBe('doc-sharma');
      expect(res.body.date).toBe(today);
      expect(res.body.bookedSlots).toBe(0);
      expect(res.body.availableSlots).toBe(res.body.totalSlots);

      const slot9 = res.body.slots.find((s: any) => s.time === '09:00 AM');
      expect(slot9).toBeDefined();
      expect(slot9.status).toBe('AVAILABLE');
    });
  });

  describe('2. Booking an Appointment (Receptionist Action)', () => {
    it('should allow receptionist to book a time slot', async () => {
      const payload = {
        patientName: 'Rahul Sharma',
        patientPhone: '+91 98201 12345',
        doctorId: 'doc-sharma',
        date: today,
        time: '10:00 AM',
        reason: 'General OPD Checkup',
      };

      const res = await request(app)
        .post('/api/appointments/book')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Appointment booked successfully');
      expect(res.body.appointment.patientName).toBe('Rahul Sharma');
      expect(res.body.appointment.time).toBe('10:00 AM');
      expect(res.body.appointment.status).toBe('BOOKED');

      // Check that schedule now reflects the booked slot
      const scheduleRes = await request(app)
        .get('/api/appointments/schedule')
        .query({ doctorId: 'doc-sharma', date: today });

      expect(scheduleRes.status).toBe(200);
      expect(scheduleRes.body.bookedSlots).toBe(1);

      const bookedSlot = scheduleRes.body.slots.find((s: any) => s.time === '10:00 AM');
      expect(bookedSlot.status).toBe('BOOKED');
      expect(bookedSlot.patientName).toBe('Rahul Sharma');
      expect(bookedSlot.patientPhone).toBe('+91 98201 12345');
    });

    it('should reject duplicate booking for the same doctor, date, and time', async () => {
      const payload = {
        patientName: 'Rahul Sharma',
        patientPhone: '+91 98201 12345',
        doctorId: 'doc-sharma',
        date: today,
        time: '10:00 AM',
        reason: 'General OPD Checkup',
      };

      // First booking
      await request(app).post('/api/appointments/book').send(payload);

      // Second booking attempt on same slot
      const res = await request(app)
        .post('/api/appointments/book')
        .send({
          patientName: 'Priya Patil',
          patientPhone: '+91 98202 54321',
          doctorId: 'doc-sharma',
          date: today,
          time: '10:00 AM',
          reason: 'Fever consultation',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Time slot is already booked');
      expect(res.body.reason).toBe('TIME_SLOT_BOOKED');
    });

    it('should validate required booking fields', async () => {
      const res = await request(app)
        .post('/api/appointments/book')
        .send({
          patientName: '',
          date: today,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid appointment details');
    });
  });

  describe('3. AI Voice Agent Single Source of Truth Availability API', () => {
    it('should return available: false with reason: TIME_SLOT_BOOKED for an occupied slot', async () => {
      // Book 10:00 AM
      await request(app).post('/api/appointments/book').send({
        patientName: 'Rahul Sharma',
        patientPhone: '+91 98201 12345',
        doctorId: 'doc-sharma',
        date: today,
        time: '10:00 AM',
        reason: 'General OPD Checkup',
      });

      const res = await request(app)
        .get('/api/appointments/availability')
        .query({
          doctorId: 'doc-sharma',
          date: today,
          time: '10:00 AM',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        available: false,
        reason: 'TIME_SLOT_BOOKED',
      });
    });

    it('should return available: true for an unbooked slot', async () => {
      const res = await request(app)
        .get('/api/appointments/availability')
        .query({
          doctorId: 'doc-sharma',
          date: today,
          time: '10:30 AM',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        available: true,
      });
    });

    it('should support checking availability by doctor name substring', async () => {
      await request(app).post('/api/appointments/book').send({
        patientName: 'Priya Patil',
        patientPhone: '+91 98202 54321',
        doctor: 'Dr. Ananya Iyer',
        date: today,
        time: '11:00 AM',
        reason: 'Cardio checkup',
      });

      const checkOccupied = await request(app)
        .get('/api/appointments/availability')
        .query({
          doctor: 'Ananya',
          date: today,
          time: '11:00 AM',
        });

      expect(checkOccupied.status).toBe(200);
      expect(checkOccupied.body).toEqual({
        available: false,
        reason: 'TIME_SLOT_BOOKED',
      });

      const checkFree = await request(app)
        .get('/api/appointments/availability')
        .query({
          doctor: 'Ananya',
          date: today,
          time: '11:30 AM',
        });

      expect(checkFree.status).toBe(200);
      expect(checkFree.body).toEqual({
        available: true,
      });
    });
  });

  describe('4. Cancelling an Appointment (Releases the Slot)', () => {
    it('should allow receptionist to cancel an appointment and free the time slot', async () => {
      // 1. Book 10:00 AM
      const bookRes = await request(app).post('/api/appointments/book').send({
        patientName: 'Rahul Sharma',
        patientPhone: '+91 98201 12345',
        doctorId: 'doc-sharma',
        date: today,
        time: '10:00 AM',
        reason: 'General OPD Checkup',
      });

      const appointmentId = bookRes.body.appointment.id;

      // 2. Verify availability API returns false
      const availBefore = await request(app)
        .get('/api/appointments/availability')
        .query({ doctorId: 'doc-sharma', date: today, time: '10:00 AM' });
      expect(availBefore.body.available).toBe(false);

      // 3. Cancel the appointment
      const cancelRes = await request(app).post(`/api/appointments/${appointmentId}/cancel`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.appointment.status).toBe('CANCELLED');

      // 4. Verify schedule shows 10:00 AM is now AVAILABLE again
      const scheduleRes = await request(app)
        .get('/api/appointments/schedule')
        .query({ doctorId: 'doc-sharma', date: today });
      const slot = scheduleRes.body.slots.find((s: any) => s.time === '10:00 AM');
      expect(slot.status).toBe('AVAILABLE');

      // 5. Verify availability API returns true
      const availAfter = await request(app)
        .get('/api/appointments/availability')
        .query({ doctorId: 'doc-sharma', date: today, time: '10:00 AM' });
      expect(availAfter.body).toEqual({ available: true });
    });
  });
});
