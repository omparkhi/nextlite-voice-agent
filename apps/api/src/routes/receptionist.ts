import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'receptionist-routes' });
const router = Router();

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  opdRoom: string;
  qualification: string;
}

export const SAMPLE_DOCTORS: Doctor[] = [
  {
    id: 'doc-sharma',
    name: 'Dr. Rajesh Sharma',
    specialty: 'General Medicine & Diabetology',
    opdRoom: 'OPD Room 102',
    qualification: 'MBBS, MD (Internal Medicine)',
  },
  {
    id: 'doc-iyer',
    name: 'Dr. Ananya Iyer',
    specialty: 'Cardiology & Heart Health',
    opdRoom: 'OPD Room 205',
    qualification: 'MBBS, MD, DM (Cardiology)',
  },
  {
    id: 'doc-patil',
    name: 'Dr. Sneha Patil',
    specialty: 'Pediatrics & Child Care',
    opdRoom: 'OPD Room 108',
    qualification: 'MBBS, DCH, DNB (Pediatrics)',
  },
  {
    id: 'doc-malhotra',
    name: 'Dr. Vikram Malhotra',
    specialty: 'Orthopedics & Joint Care',
    opdRoom: 'OPD Room 310',
    qualification: 'MBBS, MS (Orthopedics)',
  },
];

export const STANDARD_TIME_SLOTS = [
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '02:00 PM',
  '02:30 PM',
  '03:00 PM',
  '03:30 PM',
  '04:00 PM',
  '04:30 PM',
  '05:00 PM',
];

export interface ReceptionistAppointmentRecord {
  id: string;
  doctorId: string;
  doctorName: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "10:00 AM"
  patientName: string;
  patientPhone: string;
  reason: string;
  status: 'BOOKED' | 'CANCELLED';
  bookedAt: string;
  cancelledAt?: string | null;
}

// In-memory single source of truth store for hospital demo appointments
// Initialized with realistic sample bookings
let appointmentStore: ReceptionistAppointmentRecord[] = [
  {
    id: 'appt-demo-1',
    doctorId: 'doc-sharma',
    doctorName: 'Dr. Rajesh Sharma',
    date: new Date().toISOString().split('T')[0],
    time: '09:30 AM',
    patientName: 'Rahul Sharma',
    patientPhone: '+91 98201 12345',
    reason: 'Routine Health Checkup & Blood Pressure',
    status: 'BOOKED',
    bookedAt: new Date().toISOString(),
  },
  {
    id: 'appt-demo-2',
    doctorId: 'doc-sharma',
    doctorName: 'Dr. Rajesh Sharma',
    date: new Date().toISOString().split('T')[0],
    time: '10:30 AM',
    patientName: 'Priya Patil',
    patientPhone: '+91 98202 54321',
    reason: 'Seasonal Fever & Cold Consultation',
    status: 'BOOKED',
    bookedAt: new Date().toISOString(),
  },
  {
    id: 'appt-demo-3',
    doctorId: 'doc-iyer',
    doctorName: 'Dr. Ananya Iyer',
    date: new Date().toISOString().split('T')[0],
    time: '11:00 AM',
    patientName: 'Amit Verma',
    patientPhone: '+91 98203 98765',
    reason: 'ECG Review & Cardiology Follow-up',
    status: 'BOOKED',
    bookedAt: new Date().toISOString(),
  },
];

// Helper to normalize doctor query (by id or name)
function resolveDoctor(query?: string | null): Doctor {
  if (!query) return SAMPLE_DOCTORS[0];
  const queryLower = query.toLowerCase().trim();
  const matched = SAMPLE_DOCTORS.find(
    (d) =>
      d.id.toLowerCase() === queryLower ||
      d.name.toLowerCase().includes(queryLower) ||
      queryLower.includes(d.name.toLowerCase())
  );
  return matched || SAMPLE_DOCTORS[0];
}

// Helper to normalize time string (e.g. "10:00" -> "10:00 AM", "14:00" -> "02:00 PM")
function normalizeTimeString(timeStr: string): string {
  const trimmed = timeStr.trim();
  if (trimmed.toUpperCase().endsWith('AM') || trimmed.toUpperCase().endsWith('PM')) {
    const parts = trimmed.split(' ');
    const [h, m] = parts[0].split(':');
    const paddedH = h.padStart(2, '0');
    return `${paddedH}:${m || '00'} ${parts[1].toUpperCase()}`;
  }
  // If 24-hour format e.g. "10:00" or "14:30"
  const [hStr, mStr] = trimmed.split(':');
  let hour = parseInt(hStr, 10);
  const min = mStr ? mStr.padStart(2, '0') : '00';
  if (isNaN(hour)) return trimmed;
  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return `${String(hour).padStart(2, '0')}:${min} ${period}`;
}

// 1. GET /api/appointments/doctors
router.get('/doctors', (_req: Request, res: Response) => {
  res.json({
    doctors: SAMPLE_DOCTORS,
  });
});

// 2. GET /api/appointments/schedule
// Returns the daily schedule with all time slots and their availability/patient info
router.get('/schedule', (req: Request, res: Response) => {
  try {
    const doctorParam = (req.query.doctor || req.query.doctorId) as string | undefined;
    const dateParam = (req.query.date as string) || new Date().toISOString().split('T')[0];

    const doctor = resolveDoctor(doctorParam);

    // Find active bookings for this doctor & date
    const dailyBookings = appointmentStore.filter(
      (a) =>
        a.doctorId === doctor.id &&
        a.date === dateParam &&
        a.status === 'BOOKED'
    );

    const slots = STANDARD_TIME_SLOTS.map((slotTime) => {
      const booking = dailyBookings.find(
        (b) => normalizeTimeString(b.time) === normalizeTimeString(slotTime)
      );

      if (booking) {
        return {
          time: slotTime,
          status: 'BOOKED' as const,
          appointmentId: booking.id,
          patientName: booking.patientName,
          patientPhone: booking.patientPhone,
          reason: booking.reason,
          bookedAt: booking.bookedAt,
        };
      }

      return {
        time: slotTime,
        status: 'AVAILABLE' as const,
      };
    });

    res.json({
      doctor,
      date: dateParam,
      totalSlots: slots.length,
      bookedSlots: slots.filter((s) => s.status === 'BOOKED').length,
      availableSlots: slots.filter((s) => s.status === 'AVAILABLE').length,
      slots,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error retrieving appointment schedule');
    res.status(500).json({ error: 'Failed to retrieve appointment schedule' });
  }
});

// 3. POST /api/appointments/book
// Receptionist adds an appointment
const bookSchema = z.object({
  patientName: z.string().min(1, 'Patient Name is required').max(255),
  patientPhone: z.string().min(5, 'Valid Patient Phone is required').max(50),
  doctor: z.string().optional(),
  doctorId: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  reason: z.string().min(1, 'Reason / Visit Type is required').max(500),
});

router.post('/book', (req: Request, res: Response): void => {
  try {
    const parsed = bookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid appointment details',
        details: parsed.error.issues,
      });
      return;
    }

    const { patientName, patientPhone, doctor: doctorParam, doctorId, date, time, reason } = parsed.data;
    const doctor = resolveDoctor(doctorId || doctorParam);
    const normalizedTime = normalizeTimeString(time);

    // Check if slot is already booked
    const existingActive = appointmentStore.find(
      (a) =>
        a.doctorId === doctor.id &&
        a.date === date &&
        normalizeTimeString(a.time) === normalizedTime &&
        a.status === 'BOOKED'
    );

    if (existingActive) {
      res.status(409).json({
        error: 'Time slot is already booked',
        reason: 'TIME_SLOT_BOOKED',
        existingPatient: existingActive.patientName,
      });
      return;
    }

    const newAppointment: ReceptionistAppointmentRecord = {
      id: `appt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      doctorId: doctor.id,
      doctorName: doctor.name,
      date,
      time: normalizedTime,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      reason: reason.trim(),
      status: 'BOOKED',
      bookedAt: new Date().toISOString(),
    };

    appointmentStore.push(newAppointment);

    logger.info(
      {
        appointmentId: newAppointment.id,
        doctor: doctor.name,
        date,
        time: normalizedTime,
        patient: patientName,
      },
      'Receptionist booked appointment'
    );

    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment: newAppointment,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error booking appointment');
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// 4. POST /api/appointments/:id/cancel
// Receptionist cancels an appointment
router.post('/:id/cancel', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const index = appointmentStore.findIndex((a) => a.id === id);

    if (index === -1) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    const current = appointmentStore[index];
    current.status = 'CANCELLED';
    current.cancelledAt = new Date().toISOString();

    logger.info(
      {
        appointmentId: id,
        doctor: current.doctorName,
        date: current.date,
        time: current.time,
      },
      'Receptionist cancelled appointment'
    );

    res.json({
      message: 'Appointment cancelled successfully. Time slot is now AVAILABLE.',
      appointment: current,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error cancelling appointment');
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

// 5. GET /api/appointments/availability
// The single source of truth for the AI Voice Agent to check slot availability
router.get('/availability', (req: Request, res: Response): void => {
  try {
    const doctorParam = (req.query.doctor || req.query.doctorId || req.query.doctorName) as string | undefined;
    const dateParam = (req.query.date as string | undefined) || new Date().toISOString().split('T')[0];
    const timeParam = req.query.time as string | undefined;

    if (!timeParam) {
      res.status(400).json({
        error: 'Query parameter "time" is required (e.g. "10:00 AM" or "10:00")',
      });
      return;
    }

    const doctor = resolveDoctor(doctorParam);
    const normalizedTime = normalizeTimeString(timeParam);

    // Check if there is an active booking for this doctor, date, and time
    const activeBooking = appointmentStore.find(
      (a) =>
        a.doctorId === doctor.id &&
        a.date === dateParam &&
        normalizeTimeString(a.time) === normalizedTime &&
        a.status === 'BOOKED'
    );

    if (activeBooking) {
      res.json({
        available: false,
        reason: 'TIME_SLOT_BOOKED',
      });
      return;
    }

    res.json({
      available: true,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error checking availability');
    res.status(500).json({ error: 'Failed to check slot availability' });
  }
});

// Helper to reset store for tests
export function _resetDemoStore(initialRecords?: ReceptionistAppointmentRecord[]) {
  appointmentStore = initialRecords ? [...initialRecords] : [];
}

export default router;
