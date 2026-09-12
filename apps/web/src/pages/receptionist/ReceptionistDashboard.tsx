import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  opdRoom: string;
  qualification: string;
}

export interface ScheduleSlot {
  time: string;
  status: 'AVAILABLE' | 'BOOKED' | 'CANCELLED';
  appointmentId?: string;
  patientName?: string;
  patientPhone?: string;
  reason?: string;
  bookedAt?: string;
}

export interface ScheduleResponse {
  doctor: Doctor;
  date: string;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  slots: ScheduleSlot[];
}

export const FALLBACK_DOCTORS: Doctor[] = [
  {
    id: 'doc-sharma',
    name: 'Dr. Rajesh Sharma',
    specialty: 'General Medicine & Diabetology',
    opdRoom: 'OPD Room 102 (Ground Floor)',
    qualification: 'MBBS, MD (Internal Medicine)',
  },
  {
    id: 'doc-iyer',
    name: 'Dr. Ananya Iyer',
    specialty: 'Cardiology & Heart Care',
    opdRoom: 'OPD Room 205 (2nd Floor)',
    qualification: 'MBBS, MD, DM (Cardiology)',
  },
  {
    id: 'doc-patil',
    name: 'Dr. Sneha Patil',
    specialty: 'Pediatrics & Child Health',
    opdRoom: 'OPD Room 108 (Ground Floor)',
    qualification: 'MBBS, DCH, DNB (Pediatrics)',
  },
  {
    id: 'doc-malhotra',
    name: 'Dr. Vikram Malhotra',
    specialty: 'Orthopedics & Joint Surgery',
    opdRoom: 'OPD Room 310 (3rd Floor)',
    qualification: 'MBBS, MS (Orthopedics)',
  },
];

const STANDARD_TIMES = [
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

export function ReceptionistDashboard() {
  const todayStr = new Date().toISOString().split('T')[0];

  const [doctors, setDoctors] = useState<Doctor[]>(FALLBACK_DOCTORS);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('doc-sharma');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalTime, setModalTime] = useState<string>('10:00 AM');
  const [modalPatientName, setModalPatientName] = useState<string>('');
  const [modalPatientPhone, setModalPatientPhone] = useState<string>('');
  const [modalReason, setModalReason] = useState<string>('General Consultation');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Live AI Voice Agent Availability Simulator State
  const [simSlotTime, setSimSlotTime] = useState<string>('10:00 AM');
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState<boolean>(false);

  // Current live clock
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch doctors list
  useEffect(() => {
    fetch('/api/appointments/doctors')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (data.doctors && data.doctors.length > 0) {
          setDoctors(data.doctors);
        }
      })
      .catch(() => {
        setDoctors(FALLBACK_DOCTORS);
      });
  }, []);

  // Fetch schedule
  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/appointments/schedule?doctorId=${selectedDoctorId}&date=${selectedDate}`);
      if (!res.ok) throw new Error('Failed to load schedule');
      const data: ScheduleResponse = await res.json();
      setScheduleData(data);
    } catch (err: any) {
      setErrorMsg('Could not load appointment schedule. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [selectedDoctorId, selectedDate]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // Check Availability API for Voice Agent simulator
  const checkAvailability = useCallback(
    async (timeToTest: string) => {
      setSimLoading(true);
      try {
        const res = await fetch(
          `/api/appointments/availability?doctorId=${selectedDoctorId}&date=${selectedDate}&time=${encodeURIComponent(
            timeToTest
          )}`
        );
        const data = await res.json();
        setSimResult(data);
      } catch (e) {
        setSimResult({ error: 'Failed to query availability API' });
      } finally {
        setSimLoading(false);
      }
    },
    [selectedDoctorId, selectedDate]
  );

  useEffect(() => {
    if (simSlotTime) {
      checkAvailability(simSlotTime);
    }
  }, [simSlotTime, selectedDoctorId, selectedDate, checkAvailability]);

  // Open modal for booking
  const handleOpenAddModal = (presetTime?: string) => {
    if (presetTime) {
      setModalTime(presetTime);
    }
    setModalPatientName('');
    setModalPatientPhone('+91 ');
    setModalReason('General Consultation');
    setErrorMsg(null);
    setModalOpen(true);
  };

  // Submit appointment
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalPatientName.trim() || !modalPatientPhone.trim()) {
      setErrorMsg('Please enter Patient Name and Contact Phone.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: modalPatientName.trim(),
          patientPhone: modalPatientPhone.trim(),
          doctorId: selectedDoctorId,
          date: selectedDate,
          time: modalTime,
          reason: modalReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to book slot');
      }

      setSuccessMsg(`Appointment booked for ${modalPatientName} at ${modalTime}! Slot is now BOOKED.`);
      setTimeout(() => setSuccessMsg(null), 5000);
      setModalOpen(false);

      // Refresh schedule and simulator
      await fetchSchedule();
      checkAvailability(modalTime);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to book appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel appointment
  const handleCancelAppointment = async (appointmentId: string, slotTime: string, patientName?: string) => {
    if (!window.confirm(`Are you sure you want to cancel the ${slotTime} appointment for ${patientName || 'patient'}? This will make the slot AVAILABLE again.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/appointments/${appointmentId}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel appointment');

      setSuccessMsg(`Appointment at ${slotTime} cancelled. Time slot is now AVAILABLE.`);
      setTimeout(() => setSuccessMsg(null), 5000);

      // Refresh schedule and simulator
      await fetchSchedule();
      checkAvailability(slotTime);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel appointment.');
    }
  };

  const activeDoctor = doctors.find((d) => d.id === selectedDoctorId) || doctors[0];

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-stone-900 flex flex-col font-sans selection:bg-stone-900 selection:text-white">
      {/* Top Hospital Reception Header in Product White Theme */}
      <header className="bg-white/95 border-b border-stone-200/90 backdrop-blur sticky top-0 z-20 px-6 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center font-bold shadow-xs group-hover:bg-emerald-700 transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-stone-900">City Care Super-Specialty Hospital</h1>
                <span className="bg-emerald-50 text-emerald-800 text-[11px] px-2.5 py-0.5 rounded-full font-semibold border border-emerald-200">
                  Receptionist Desk
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Doctor OPD Appointment Schedule & Real-Time Availability Hub
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch md:self-auto justify-between md:justify-end">
            <div className="bg-stone-100 border border-stone-200/90 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] uppercase font-bold tracking-wider text-stone-500">Reception Shift</div>
              <div className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {currentTime}
              </div>
            </div>

            <button
              onClick={() => handleOpenAddModal()}
              className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>+ Add Appointment</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Alerts */}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-medium shadow-xs animate-fade-in">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 text-sm">
              ✕
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-medium shadow-xs">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-700 hover:text-rose-900 text-sm">
              ✕
            </button>
          </div>
        )}

        {/* Doctor & Date Selection Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Doctor Selection Card in Clean White */}
          <div className="lg:col-span-2 bg-white border border-stone-200 rounded-xl p-5 shadow-xs">
            <div className="text-[11px] uppercase tracking-wider text-stone-500 font-bold mb-3 flex items-center justify-between">
              <span>Select Doctor / Department</span>
              <span className="text-stone-400 font-normal">OPD Schedule Active</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {doctors.map((doc) => {
                const isSelected = doc.id === selectedDoctorId;
                return (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDoctorId(doc.id)}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-50/50 border-emerald-500 shadow-xs ring-1 ring-emerald-500/80'
                        : 'bg-stone-50/70 border-stone-200/90 hover:border-stone-300 hover:bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-stone-900 flex items-center justify-between">
                        <span>{doc.name}</span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                        )}
                      </div>
                      <div className="text-xs text-emerald-700 font-medium mt-0.5">{doc.specialty}</div>
                    </div>
                    <div className="text-[11px] text-stone-500 mt-2 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-stone-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span>{doc.opdRoom}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Picker & Quick Filter Card in Clean White */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-stone-500 font-bold mb-3">
                Appointment Date
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-stone-900 text-sm focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600 font-medium"
              />

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayStr)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    selectedDate === todayStr
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setSelectedDate(tomorrow.toISOString().split('T')[0]);
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Tomorrow
                </button>
              </div>
            </div>

            {scheduleData && (
              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                <div className="text-stone-600">
                  Occupancy: <strong className="text-stone-900">{scheduleData.bookedSlots}</strong> / {scheduleData.totalSlots} Booked
                </div>
                <div className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                  {scheduleData.availableSlots} Available
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Schedule Grid & AI Simulator Split */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main Appointment Schedule Column (2 cols) */}
          <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center justify-between bg-white border border-stone-200 rounded-xl px-5 py-3.5 shadow-xs">
              <div>
                <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <span>Appointment Schedule</span>
                  <span className="text-xs font-medium text-stone-500">
                    — {activeDoctor?.name} ({selectedDate})
                  </span>
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Single source of truth for time slot occupancy and AI voice availability checks
                </p>
              </div>

              <button
                onClick={fetchSchedule}
                className="text-xs text-stone-600 hover:text-stone-900 border border-stone-200 bg-stone-50 hover:bg-stone-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer font-medium"
                title="Refresh Schedule"
              >
                <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>

            {loading ? (
              <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-stone-500 text-sm shadow-xs">
                <div className="inline-block w-7 h-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p>Loading OPD appointment schedule...</p>
              </div>
            ) : !scheduleData || scheduleData.slots.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-stone-500 text-sm shadow-xs">
                No slots configured for this date.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Morning Header */}
                <div className="bg-white border border-stone-200/90 rounded-xl p-4 shadow-xs space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2 border-b border-stone-100 pb-2">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span>Morning Session (09:00 AM – 01:00 PM)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {scheduleData.slots.slice(0, 8).map((slot) => (
                      <ScheduleSlotCard
                        key={slot.time}
                        slot={slot}
                        onBook={() => handleOpenAddModal(slot.time)}
                        onCancel={(id) => handleCancelAppointment(id, slot.time, slot.patientName)}
                        onCheckSim={() => setSimSlotTime(slot.time)}
                      />
                    ))}
                  </div>
                </div>

                {/* Afternoon Header */}
                <div className="bg-white border border-stone-200/90 rounded-xl p-4 shadow-xs space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-2 border-b border-stone-100 pb-2">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    <span>Afternoon Session (02:00 PM – 05:30 PM)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {scheduleData.slots.slice(8).map((slot) => (
                      <ScheduleSlotCard
                        key={slot.time}
                        slot={slot}
                        onBook={() => handleOpenAddModal(slot.time)}
                        onCancel={(id) => handleCancelAppointment(id, slot.time, slot.patientName)}
                        onCheckSim={() => setSimSlotTime(slot.time)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI Voice Agent Integration Preview Column (1 col) in White Theme */}
          <div className="space-y-4">
            <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-stone-900">AI Voice Agent Integration</h3>
                    <span className="text-[11px] text-stone-500">Live Availability Verification</span>
                  </div>
                </div>

                <p className="text-xs text-stone-600 leading-relaxed">
                  When a caller asks the AI Voice Agent for an appointment, the agent queries this exact live endpoint:
                </p>

                {/* Query Endpoint Box */}
                <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 my-3 font-mono text-[11px] text-stone-800 break-all">
                  <div className="text-stone-400 text-[10px] uppercase font-sans font-bold mb-1">Live Endpoint</div>
                  <span className="text-emerald-700 font-bold">GET</span> /api/appointments/availability?doctorId={selectedDoctorId}&amp;date={selectedDate}&amp;time={encodeURIComponent(simSlotTime)}
                </div>

                {/* Slot Selector */}
                <div className="mb-3">
                  <label className="text-xs text-stone-700 font-semibold block mb-1">
                    Select Slot to Test Live:
                  </label>
                  <select
                    value={simSlotTime}
                    onChange={(e) => setSimSlotTime(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                  >
                    {STANDARD_TIMES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* API Response Preview */}
                <div className="bg-stone-900 text-stone-100 border border-stone-800 rounded-lg p-3.5 font-mono text-xs shadow-inner">
                  <div className="flex items-center justify-between text-stone-400 text-[10px] uppercase font-sans font-bold mb-1.5">
                    <span>API Response</span>
                    {simLoading && <span className="text-indigo-400 animate-pulse font-normal">Querying...</span>}
                  </div>
                  <pre className="text-[12px] text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                    {simResult ? JSON.stringify(simResult, null, 2) : 'Loading response...'}
                  </pre>
                </div>

                {/* Interactive Explanation */}
                <div className="mt-4 p-3.5 rounded-xl bg-stone-50 border border-stone-200/90 text-xs space-y-2">
                  <div className="font-semibold text-stone-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                    <span>Voice Agent Behavior</span>
                  </div>
                  {simResult?.available ? (
                    <p className="text-emerald-800 text-[11px] leading-relaxed">
                      ✅ <strong>Slot is Available:</strong> The AI Voice Agent can immediately confirm or reserve{' '}
                      <strong>{simSlotTime}</strong> for the caller.
                    </p>
                  ) : (
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      ⚠️ <strong>Slot is Booked:</strong> The AI Voice Agent detects the receptionist&apos;s booking and informs the caller:
                      <em> &ldquo;I&apos;m sorry, {simSlotTime} is already occupied. May I offer you another slot?&rdquo;</em>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-stone-100 text-[11px] text-stone-400 text-center font-medium">
                Client & Doctor Presentation Module
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Add Appointment Modal in Clean White Theme */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-stone-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900">Book Patient Appointment</h3>
                <p className="text-xs text-stone-500">Receptionist OPD Scheduling</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg text-lg cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBookAppointment} className="space-y-4">
              {/* Doctor */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">Doctor</label>
                <input
                  type="text"
                  disabled
                  value={activeDoctor.name + ' (' + activeDoctor.specialty + ')'}
                  className="w-full bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-700 cursor-not-allowed font-medium"
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-700 block mb-1">Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-700 block mb-1">Time Slot</label>
                  <select
                    value={modalTime}
                    onChange={(e) => setModalTime(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-emerald-600 focus:bg-white font-medium"
                  >
                    {STANDARD_TIMES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Patient Name */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">
                  Patient Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={modalPatientName}
                  onChange={(e) => setModalPatientName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  required
                  autoFocus
                />
              </div>

              {/* Patient Phone */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">
                  Patient Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +91 98201 12345"
                  value={modalPatientPhone}
                  onChange={(e) => setModalPatientPhone(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  required
                />
              </div>

              {/* Reason / Visit Type */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">Reason / Visit Type</label>
                <input
                  type="text"
                  placeholder="e.g. General OPD Checkup / Fever & Cough"
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {submitting ? 'Saving...' : 'Confirm & Book Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual Slot Card Component in White Theme
function ScheduleSlotCard({
  slot,
  onBook,
  onCancel,
  onCheckSim,
}: {
  slot: ScheduleSlot;
  onBook: () => void;
  onCancel: (id: string) => void;
  onCheckSim: () => void;
}) {
  const isBooked = slot.status === 'BOOKED';

  return (
    <div
      className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
        isBooked
          ? 'bg-indigo-50/40 border-indigo-200 shadow-xs'
          : 'bg-stone-50/60 border-stone-200/80 hover:border-stone-300 hover:bg-white'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`w-18 text-center px-2 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
            isBooked
              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
          }`}
        >
          {slot.time}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                isBooked
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {slot.status}
            </span>

            {isBooked && (
              <span className="text-[11px] text-stone-500 font-medium truncate">
                {slot.patientPhone}
              </span>
            )}
          </div>

          {isBooked ? (
            <div className="mt-1">
              <div className="font-semibold text-sm text-stone-900 truncate flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{slot.patientName}</span>
              </div>
              <div className="text-xs text-stone-600 truncate mt-0.5">{slot.reason}</div>
            </div>
          ) : (
            <div className="text-xs text-stone-500 mt-1">Available for patient booking</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 self-center">
        {isBooked ? (
          <>
            <button
              onClick={() => onCancel(slot.appointmentId!)}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              title="Cancel Appointment (Frees the slot)"
            >
              Cancel
            </button>
            <button
              onClick={onCheckSim}
              className="text-xs text-stone-500 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg border border-stone-200 transition-colors cursor-pointer"
              title="Test API Availability"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        ) : (
          <button
            onClick={onBook}
            className="text-xs font-semibold text-emerald-800 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-300 hover:border-emerald-600 px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-xs"
          >
            <span>+ Book</span>
          </button>
        )}
      </div>
    </div>
  );
}
