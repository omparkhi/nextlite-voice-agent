import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import type { Appointment } from '../../types';

const STANDARD_TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM'
];

function formatSlugToName(slug?: string): string {
  if (!slug) return 'Clinic';
  return slug
    .split(/[-_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ReceptionistDashboard() {
  const { clinicSlug } = useParams<{ clinicSlug?: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Appointments State
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');

  // Fast Horizontal Row-Entry Form State
  const [slotTime, setSlotTime] = useState<string>('10:00 AM');
  const [patientName, setPatientName] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [reason, setReason] = useState<string>('General Consultation');
  const [addingRow, setAddingRow] = useState<boolean>(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Resolve Clinic Display Name
  const clinicDisplayName =
    user?.tenantName ||
    (clinicSlug ? formatSlugToName(clinicSlug) : 'VanifyAI Clinic');

  // Staff Name
  const staffName = user?.name || (user?.email ? user.email.split('@')[0] : 'Desk Receptionist');
  const staffInitial = staffName.charAt(0).toUpperCase() || 'D';

  // Load appointments for selected date
  const loadAppointments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setSyncing(true);
    setErrorMsg(null);

    try {
      const res = await api.getClientAppointments({
        bookingDate: selectedDate,
        limit: 100,
        tenantId: user?.tenantId,
      });
      setAppointments(res.appointments || []);
      setLastSyncTime(new Date());
    } catch (err: any) {
      if (!silent) {
        setErrorMsg(err?.message || 'Unable to connect to clinic schedule.');
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [selectedDate, user?.tenantId]);

  // Initial & Date-change load
  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Real-time polling every 4 seconds to sync with phone bookings
  useEffect(() => {
    const timer = setInterval(() => {
      loadAppointments(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [loadAppointments]);

  // Handle Quick Add Horizontal Entry
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) {
      setErrorMsg('Please enter the patient name.');
      nameInputRef.current?.focus();
      return;
    }

    const cleanPhone = phone.trim() ? phone.trim() : '+91 98000 00000';

    setAddingRow(true);
    setErrorMsg(null);

    try {
      const bookedByName = user?.name
        ? `${user.name} (Desk Staff)`
        : 'Front Desk Staff';

      const res = await api.createClientAppointment({
        customerName: patientName.trim(),
        customerPhone: cleanPhone,
        bookingDate: selectedDate,
        bookingTime: slotTime,
        title: reason.trim() || 'General Consultation',
        age: age.trim() || undefined,
        bookedBy: 'RECEPTIONIST',
        bookedByName,
        walkIn: true,
      });

      const apptNum = res.appointment?.appointmentNumber || 'APT';
      setSuccessToast(`Added ${patientName.trim()} (${slotTime}) [${apptNum}] to queue!`);
      setTimeout(() => setSuccessToast(null), 4000);

      // Reset horizontal inputs for next rapid entry
      setPatientName('');
      setAge('');
      setPhone('');
      setReason('General Consultation');

      // Refresh list immediately
      await loadAppointments(true);

      // Re-focus name input for fast consecutive typing
      nameInputRef.current?.focus();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to book appointment. Check if slot is already occupied.');
    } finally {
      setAddingRow(false);
    }
  };

  // Status Actions
  const handleUpdateStatus = async (appointmentId: string, status: string) => {
    try {
      await api.updateClientAppointment(appointmentId, { status });
      await loadAppointments(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to update status');
    }
  };

  // Filtered Appointments
  const filteredAppointments = appointments.filter((appt) => {
    if (sourceFilter === 'AI' && appt.bookedBy !== 'AGENT') return false;
    if (sourceFilter === 'DESK' && appt.bookedBy !== 'RECEPTIONIST' && appt.bookedBy !== 'MANUAL_CLIENT') return false;
    if (sourceFilter === 'WHATSAPP' && appt.bookedBy !== 'WHATSAPP') return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      appt.customerName?.toLowerCase().includes(q) ||
      appt.customerPhone?.toLowerCase().includes(q) ||
      appt.appointmentNumber?.toLowerCase().includes(q) ||
      (appt.title && appt.title.toLowerCase().includes(q))
    );
  });

  // Calculate Metrics
  const totalCount = appointments.length;
  const aiCount = appointments.filter((a) => a.bookedBy === 'AGENT').length;
  const deskCount = appointments.filter((a) => a.bookedBy === 'RECEPTIONIST' || a.bookedBy === 'MANUAL_CLIENT').length;
  const whatsappCount = appointments.filter((a) => a.bookedBy === 'WHATSAPP').length;
  const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;

  return (
    <div className="min-h-screen bg-white text-[#0c0a09] font-sans flex flex-col">
      {/* Top Navbar Header */}
      <header className="h-16 px-6 md:px-8 border-b border-[#e7e5e4] bg-white sticky top-0 z-30 flex items-center justify-between shadow-2xs">
        {/* Business Brand & Desk Identity */}
        <div className="flex items-center gap-3.5">
          <img
            src="/vanifyai-logo.jpg"
            alt="VanifyAI"
            className="w-8 h-8 rounded-lg object-contain bg-black p-1 shadow-xs ring-1 ring-black/5"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg text-[#0c0a09] tracking-tight">
                {clinicDisplayName}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-[#f0efed] text-[#0c0a09] border border-[#e7e5e4]">
                Front Desk
              </span>
            </div>
          </div>
        </div>

        {/* Live CRM Status & User Controls */}
        <div className="flex items-center gap-3">
          {/* Live Sync Status Pill */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#e7e5e4] bg-[#fafafa] text-xs text-[#777169]">
            <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
            <span>
              Synced:{' '}
              {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => loadAppointments(false)}
            disabled={loading || syncing}
            className="px-3.5 py-1.5 rounded-full border border-[#e7e5e4] bg-white hover:bg-[#f0efed] text-[#0c0a09] text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Refresh schedule now"
          >
            <svg
              className={`w-3.5 h-3.5 text-[#777169] ${syncing ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>Refresh</span>
          </button>

          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-[#f0efed]">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#ea580c] to-[#f97316] text-white flex items-center justify-center font-semibold text-xs shadow-xs select-none">
                {staffInitial}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
                className="px-3 py-1.5 rounded-full bg-white hover:bg-[#fef2f2] text-[#dc2626] border border-[#fecaca] text-xs font-medium transition cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="px-4 py-1.5 rounded-full bg-[#0c0a09] text-white text-xs font-medium hover:opacity-90 transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full mx-auto p-6 md:p-8 space-y-6 flex-1">
        {/* Toast / Error alerts */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-[#fef2f2] border border-[#fecaca] text-xs text-[#dc2626] flex items-center justify-between shadow-2xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#dc2626]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-[#dc2626] hover:opacity-80 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {successToast && (
          <div className="p-3.5 rounded-2xl bg-[#f0fdf4] border border-[#bbf7d0] text-xs text-[#166534] flex items-center justify-between shadow-2xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 font-medium">
              <svg className="w-4 h-4 text-[#16a34a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{successToast}</span>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="text-[#16a34a] hover:opacity-80 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header Greeting & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-light text-[#0c0a09] tracking-tight">
              Reception Desk Schedule
            </h1>
            <p className="text-xs text-[#777169] mt-1">
              Live multi-channel queue across AI voice reception, WhatsApp bookings, and front desk walk-ins.
            </p>
          </div>

          {/* Date Selector Control */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition cursor-pointer ${selectedDate === todayStr
                ? 'bg-[#0c0a09] text-white border-[#0c0a09] shadow-2xs'
                : 'bg-white text-[#4e4e4e] border-[#e7e5e4] hover:bg-[#f0efed]'
                }`}
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => {
                const tmr = new Date();
                tmr.setDate(tmr.getDate() + 1);
                setSelectedDate(tmr.toISOString().split('T')[0]);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition cursor-pointer ${selectedDate !== todayStr &&
                selectedDate === new Date(Date.now() + 86400000).toISOString().split('T')[0]
                ? 'bg-[#0c0a09] text-white border-[#0c0a09] shadow-2xs'
                : 'bg-white text-[#4e4e4e] border-[#e7e5e4] hover:bg-[#f0efed]'
                }`}
            >
              Tomorrow
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium border border-[#e7e5e4] rounded-full bg-white text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] cursor-pointer shadow-2xs"
            />
          </div>
        </div>

        {/* 5-Column Overview KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all">
            <span className="text-xs font-medium text-[#777169]">Total Booked</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{totalCount}</p>
          </div>

          <div className="p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all">
            <span className="text-xs font-medium text-[#777169]">AI Phone Bookings</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{aiCount}</p>
          </div>

          <div className="p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all">
            <span className="text-xs font-medium text-[#777169]">Desk Walk-ins</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{deskCount}</p>
          </div>

          <div className="p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all">
            <span className="text-xs font-medium text-[#777169]">WhatsApp Bookings</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{whatsappCount}</p>
          </div>

          <div className="p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all">
            <span className="text-xs font-medium text-[#777169]">Completed Visits</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{completedCount}</p>
          </div>
        </div>

        {/* FAST HORIZONTAL ROW-ENTRY APPOINTMENT REGISTER FORM */}
        <div className="bg-white border border-[#e7e5e4] rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0c0a09]">
                Quick Walk-In Registration
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f0efed] text-[#4e4e4e]">
                Fast Queue Entry
              </span>
            </div>
            <span className="text-[11px] text-[#777169]">
              Press <kbd className="px-1.5 py-0.5 bg-[#f0efed] border border-[#e7e5e4] rounded text-[10px] font-mono">Enter</kbd> to add
            </span>
          </div>

          <form onSubmit={handleQuickAdd} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
            {/* Slot Time */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-medium text-[#777169] uppercase tracking-wider mb-1.5">
                Time Slot
              </label>
              <select
                value={slotTime}
                onChange={(e) => setSlotTime(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] shadow-2xs cursor-pointer h-10"
              >
                {STANDARD_TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>

            {/* Patient Name */}
            <div className="md:col-span-4">
              <label className="block text-[11px] font-medium text-[#777169] uppercase tracking-wider mb-1.5">
                Patient / Customer Name <span className="text-rose-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                type="text"
                required
                placeholder="e.g. Ramesh Kulkarni"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full px-3.5 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#0c0a09] shadow-2xs h-10"
              />
            </div>

            {/* Age */}
            <div className="md:col-span-1">
              <label className="block text-[11px] font-medium text-[#777169] uppercase tracking-wider mb-1.5 text-center">
                Age
              </label>
              <input
                type="text"
                placeholder="32"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-2 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#0c0a09] shadow-2xs text-center h-10"
              />
            </div>

            {/* Phone */}
            <div className="md:col-span-3">
              <label className="block text-[11px] font-medium text-[#777169] uppercase tracking-wider mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#0c0a09] shadow-2xs h-10"
              />
            </div>

            {/* Submit Button */}
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={addingRow}
                className="w-full h-10 bg-[#0c0a09] hover:opacity-90 text-white rounded-xl text-xs font-medium transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {addingRow ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <span>+ Quick Book</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Schedule Queue Table */}
        <div className="bg-white border border-[#e7e5e4] rounded-2xl overflow-hidden shadow-2xs">
          {/* Table Header Controls */}
          <div className="p-4 md:p-5 border-b border-[#f0efed] flex flex-wrap items-center justify-between gap-3 bg-white">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-base text-[#0c0a09] tracking-tight">
                  Appointment Queue ({filteredAppointments.length})
                </h3>
                <p className="text-xs text-[#777169] mt-0.5">Live queue synchronized across AI phone reception and desk</p>
              </div>

              {/* Source Filters */}
              <div className="inline-flex rounded-full bg-[#f0efed] p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setSourceFilter('ALL')}
                  className={`px-3 py-1 rounded-full transition cursor-pointer text-xs ${sourceFilter === 'ALL'
                    ? 'bg-white text-[#0c0a09] font-semibold shadow-2xs'
                    : 'text-[#777169] hover:text-[#0c0a09]'
                    }`}
                >
                  All Sources
                </button>
                <button
                  type="button"
                  onClick={() => setSourceFilter('AI')}
                  className={`px-3 py-1 rounded-full transition cursor-pointer text-xs flex items-center gap-1 ${sourceFilter === 'AI'
                    ? 'bg-white text-[#0c0a09] font-semibold shadow-2xs'
                    : 'text-[#777169] hover:text-[#0c0a09]'
                    }`}
                >
                  <span>AI Calls</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceFilter('DESK')}
                  className={`px-3 py-1 rounded-full transition cursor-pointer text-xs flex items-center gap-1 ${sourceFilter === 'DESK'
                    ? 'bg-white text-[#0c0a09] font-semibold shadow-2xs'
                    : 'text-[#777169] hover:text-[#0c0a09]'
                    }`}
                >
                  <span>Desk Walk-ins</span>
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <svg
                className="w-4 h-4 text-[#777169] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search patient, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-white border border-[#d6d3d1] rounded-full text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#0c0a09] font-medium"
              />
            </div>
          </div>

          {/* Table Body */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-xs text-[#777169] space-y-2">
                <div className="w-6 h-6 border-2 border-[#0c0a09] border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Loading OPD register...</p>
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-[#f0efed] text-[#777169] flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="17" rx="4" ry="4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="font-semibold text-sm text-[#0c0a09]">No appointments scheduled for this date</p>
                <p className="text-xs text-[#777169] max-w-sm mx-auto">
                  Use the quick registration bar above to add a walk-in patient, or incoming AI phone bookings will appear in real time.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#fafafa] border-b border-[#f0efed] text-[11px] font-semibold text-[#777169] uppercase tracking-wider">
                    <th className="py-3.5 px-4 w-16">Token</th>
                    <th className="py-3.5 px-4 w-28">Time Slot</th>
                    <th className="py-3.5 px-4">Patient Name</th>
                    <th className="py-3.5 px-3 w-16 text-center">Age</th>
                    <th className="py-3.5 px-4">Phone Number</th>
                    <th className="py-3.5 px-4">Reason / Notes</th>
                    <th className="py-3.5 px-4">Channel / Origin</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0efed] font-medium text-[#0c0a09]">
                  {filteredAppointments.map((appt, idx) => {
                    const isAi = appt.bookedBy === 'AGENT';
                    const isDesk = appt.bookedBy === 'RECEPTIONIST' || appt.bookedBy === 'MANUAL_CLIENT';
                    const isWhatsapp = appt.bookedBy === 'WHATSAPP';
                    const isCompleted = appt.status === 'COMPLETED';
                    const isCancelled = appt.status === 'CANCELLED';

                    return (
                      <tr
                        key={appt.id}
                        className={`hover:bg-[#fafafa] transition-colors ${isCompleted ? 'bg-[#fafafa] text-[#777169]' : isCancelled ? 'bg-[#fef2f2]/30 text-[#a8a29e] line-through' : ''
                          }`}
                      >
                        {/* Token # */}
                        <td className="py-3.5 px-4 font-mono font-semibold text-[#4e4e4e] text-xs">
                          {appt.appointmentNumber || `#${idx + 1}`}
                        </td>

                        {/* Time Slot */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono font-medium text-xs bg-[#f0efed] text-[#0c0a09] border border-[#e7e5e4]">
                            {appt.bookingTime}
                          </span>
                        </td>

                        {/* Patient Name */}
                        <td className="py-3.5 px-4 font-semibold text-[#0c0a09]">
                          {appt.customerName}
                        </td>

                        {/* Age */}
                        <td className="py-3.5 px-3 text-center text-[#777169] font-mono">
                          {appt.age || '—'}
                        </td>

                        {/* Phone */}
                        <td className="py-3.5 px-4 font-mono text-[#777169] text-xs">
                          {appt.customerPhone}
                        </td>

                        {/* Reason / Title */}
                        <td className="py-3.5 px-4 text-[#777169] text-xs max-w-xs truncate" title={appt.title || 'Consultation'}>
                          {appt.title || 'Consultation'}
                        </td>

                        {/* Origin */}
                        <td className="py-3.5 px-4">
                          {isWhatsapp ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              WhatsApp Bot
                            </span>
                          ) : isAi ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                              AI Voice Call
                            </span>
                          ) : isDesk ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#f0efed] text-[#0c0a09] border border-[#e7e5e4]" title={appt.bookedByName || 'Desk Staff'}>
                              {appt.bookedByName || 'Front Desk'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#f0efed] text-[#4e4e4e]">
                              Clinic Staff
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${isCompleted
                              ? 'bg-[#f0efed] text-[#4e4e4e]'
                              : isCancelled
                                ? 'bg-[#fef2f2] text-[#dc2626]'
                                : 'bg-[#dcfce7] text-[#15803d]'
                              }`}
                          >
                            {appt.status}
                          </span>
                        </td>

                        {/* Quick Actions */}
                        <td className="py-3.5 px-4 text-right space-x-1.5">
                          {!isCompleted && !isCancelled && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(appt.id, 'COMPLETED')}
                                title="Mark as Completed"
                                className="px-2.5 py-1 rounded-full bg-white hover:bg-[#f0fdf4] text-[#15803d] font-medium text-[11px] border border-[#bbf7d0] transition cursor-pointer shadow-2xs"
                              >
                                ✓ Done
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(appt.id, 'CANCELLED')}
                                title="Cancel Appointment"
                                className="px-2.5 py-1 rounded-full bg-white hover:bg-[#fef2f2] text-[#dc2626] font-medium text-[11px] border border-[#fecaca] transition cursor-pointer shadow-2xs"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          )}
                          {isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(appt.id, 'SCHEDULED')}
                              className="px-2.5 py-1 rounded-full bg-[#f0efed] hover:bg-[#e7e5e4] text-[#0c0a09] text-[11px] transition cursor-pointer"
                            >
                              Restore
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[#f0efed] py-4 text-center text-xs text-[#777169]">
        VanifyAI Unified Front Desk &bull; Connected to {clinicDisplayName} CRM &bull; Real-time AI Agent Voice Sync
      </footer>
    </div>
  );
}
