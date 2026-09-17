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
  const [place, setPlace] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [reason, setReason] = useState<string>('General Consultation');
  const [addingRow, setAddingRow] = useState<boolean>(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Resolve Clinic Display Name
  const clinicDisplayName =
    user?.tenantName ||
    (clinicSlug ? formatSlugToName(clinicSlug) : 'NextLite Clinic');

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
        ? `${user.name} (Desk Receptionist)`
        : 'Front Desk Receptionist';

      const res = await api.createClientAppointment({
        customerName: patientName.trim(),
        customerPhone: cleanPhone,
        bookingDate: selectedDate,
        bookingTime: slotTime,
        title: reason.trim() || 'General Consultation',
        age: age.trim() || undefined,
        place: place.trim() || undefined,
        bookedBy: 'RECEPTIONIST',
        bookedByName,
        walkIn: true,
      });

      const apptNum = res.appointment?.appointmentNumber || 'APT';
      setSuccessToast(`Added ${patientName.trim()} (${slotTime}) [${apptNum}] to OPD schedule!`);
      setTimeout(() => setSuccessToast(null), 4000);

      // Reset horizontal inputs for next rapid entry
      setPatientName('');
      setAge('');
      setPlace('');
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
      (appt.place && appt.place.toLowerCase().includes(q)) ||
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
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] font-sans flex flex-col">
      {/* Top Professional Header */}
      <header className="bg-white border-b border-[#e2e8f0] px-6 py-3.5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Clinic Brand & Title */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-700 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              🏥
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-gray-900 tracking-tight">
                  {clinicDisplayName}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Reception Desk
                </span>
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                <span>Staff:</span>
                <strong className="text-gray-700">{user?.name || user?.email || 'Desk Receptionist'}</strong>
                <span className="text-gray-300">•</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live CRM Sync
                </span>
              </p>
            </div>
          </div>

          {/* Header Controls & Sign Out */}
          <div className="flex items-center gap-3">
            {/* Quick Live Clock / Last Sync */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600">
              <span className={syncing ? 'animate-spin inline-block text-emerald-600' : 'text-gray-400'}>
                ↻
              </span>
              <span>Sync: {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>

            <button
              type="button"
              onClick={() => loadAppointments(false)}
              disabled={loading || syncing}
              className="px-3 py-1.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Refresh schedule now"
            >
              <span className={syncing ? 'animate-spin' : ''}>🔄</span>
              <span>Refresh</span>
            </button>

            {user ? (
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-gray-100 hover:bg-rose-50 hover:text-rose-600 text-gray-700 text-xs font-medium transition border border-gray-200 cursor-pointer"
              >
                Sign Out
              </button>
            ) : (
              <Link
                to="/login"
                className="px-3.5 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5 flex-1">
        {/* Toast / Error alerts */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between shadow-2xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-400 hover:text-rose-700 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {successToast && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between shadow-2xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 font-medium">
              <span>✅</span>
              <span>{successToast}</span>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="text-emerald-500 hover:text-emerald-800 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Top Summary Bar & Date Picker */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
          {/* Quick Metrics */}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Date Schedule:</span>
              <span className="text-xs font-bold text-gray-900 font-mono">
                {selectedDate === todayStr ? 'Today' : selectedDate}
              </span>
            </div>

            <div className="h-4 w-px bg-gray-200 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Total Booked:</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800 font-mono">
                {totalCount}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">🎙️ AI Phone:</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                {aiCount}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">📋 Desk Walk-ins:</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                {deskCount}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">💬 WhatsApp:</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                {whatsappCount}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Completed:</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                {completedCount}
              </span>
            </div>
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                selectedDate === todayStr
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
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
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                selectedDate !== todayStr &&
                selectedDate === new Date(Date.now() + 86400000).toISOString().split('T')[0]
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Tomorrow
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
            />
          </div>
        </div>

        {/* FAST HORIZONTAL ROW-ENTRY APPOINTMENT REGISTER FORM */}
        <div className="bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-white rounded-2xl border border-emerald-200/90 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                Quick Walk-In Entry (Horizontal Row-Fill)
              </h2>
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">
              Fill details &amp; press <kbd className="px-1.5 py-0.5 bg-white border border-emerald-200 rounded text-[10px] font-mono shadow-2xs">Enter</kbd> to add
            </span>
          </div>

          <form onSubmit={handleQuickAdd} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-2.5 items-center">
            {/* Slot Time */}
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Time Slot</label>
              <select
                value={slotTime}
                onChange={(e) => setSlotTime(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-semibold bg-white border border-emerald-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer"
              >
                {STANDARD_TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>

            {/* Patient Name */}
            <div className="md:col-span-3">
              <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                Patient Name <span className="text-rose-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                type="text"
                required
                placeholder="e.g. Ramesh Kulkarni"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium bg-white border border-emerald-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
            </div>

            {/* Age */}
            <div className="md:col-span-1">
              <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Age</label>
              <input
                type="text"
                placeholder="e.g. 34"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-2 py-2 text-xs font-medium bg-white border border-emerald-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs text-center"
              />
            </div>

            {/* Place (Disconnected for current deployment - preserved for future reuse) */}
            {/* <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Place / City</label>
              <input
                type="text"
                placeholder="e.g. Nagpur"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-medium bg-white border border-emerald-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
            </div> */}

            {/* Phone */}
            <div className="md:col-span-3">
              <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-medium bg-white border border-emerald-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
            </div>

            {/* Submit Button */}
            <div className="md:col-span-3 flex flex-col justify-end">
              <label className="block text-[10px] font-bold text-transparent uppercase mb-1">Action</label>
              <button
                type="submit"
                disabled={addingRow}
                className="w-full h-8.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1 disabled:opacity-50"
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

        {/* Schedule Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h3 className="font-bold text-sm text-gray-900">
                  Scheduled Appointments ({filteredAppointments.length})
                </h3>
                <p className="text-xs text-gray-500">Real-time live queue across AI phone reception and front desk</p>
              </div>

              <div className="inline-flex rounded-xl bg-gray-200/80 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setSourceFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                    sourceFilter === 'ALL' ? 'bg-white text-gray-900 font-bold shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All Sources
                </button>
                <button
                  type="button"
                  onClick={() => setSourceFilter('AI')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] flex items-center gap-1 ${
                    sourceFilter === 'AI' ? 'bg-white text-purple-700 font-bold shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>🎙️</span> AI Calls
                </button>
                <button
                  type="button"
                  onClick={() => setSourceFilter('DESK')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] flex items-center gap-1 ${
                    sourceFilter === 'DESK' ? 'bg-white text-emerald-700 font-bold shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>📋</span> Desk Walk-ins
                </button>
              </div>
            </div>

            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-gray-400">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search patient, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-xs text-gray-400 space-y-2">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Loading clinic OPD register...</p>
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <span className="text-3xl block">📋</span>
                <p className="font-semibold text-xs text-gray-700">No appointments scheduled for this date</p>
                <p className="text-[11px] text-gray-400">
                  Use the quick-fill bar above to add a walk-in patient, or incoming AI phone bookings will appear here in real time.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4 w-16">Token</th>
                    <th className="py-3 px-4 w-28">Time Slot</th>
                    <th className="py-3 px-4">Patient Name</th>
                    <th className="py-3 px-3 w-16 text-center">Age</th>
                    {/* <th className="py-3 px-4">Place / City</th> */}
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Reason / Notes</th>
                    <th className="py-3 px-4">Origin / Booked By</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {filteredAppointments.map((appt, idx) => {
                    const isAi = appt.bookedBy === 'AGENT';
                    const isDesk = appt.bookedBy === 'RECEPTIONIST' || appt.bookedBy === 'MANUAL_CLIENT';
                    const isWhatsapp = appt.bookedBy === 'WHATSAPP';
                    const isCompleted = appt.status === 'COMPLETED';
                    const isCancelled = appt.status === 'CANCELLED';

                    return (
                      <tr
                        key={appt.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isCompleted ? 'bg-gray-50/40 text-gray-400' : isCancelled ? 'bg-rose-50/20 text-gray-400 line-through' : ''
                        }`}
                      >
                        {/* Token # */}
                        <td className="py-3 px-4 font-mono font-bold text-gray-600 text-[11px]">
                          {appt.appointmentNumber || `#${idx + 1}`}
                        </td>

                        {/* Time Slot */}
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-gray-100 text-gray-900 border border-gray-200">
                            🕒 {appt.bookingTime}
                          </span>
                        </td>

                        {/* Patient Name */}
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {appt.customerName}
                        </td>

                        {/* Age */}
                        <td className="py-3 px-3 text-center text-gray-600 font-mono">
                          {appt.age || '—'}
                        </td>

                        {/* Place (Disconnected) */}
                        {/* <td className="py-3 px-4 text-gray-600">
                          {appt.place || '—'}
                        </td> */}

                        {/* Phone */}
                        <td className="py-3 px-4 font-mono text-gray-600 text-[11px]">
                          {appt.customerPhone}
                        </td>

                        {/* Reason / Title */}
                        <td className="py-3 px-4 text-gray-600 text-[11px] max-w-xs truncate" title={appt.title || 'Consultation'}>
                          {appt.title || 'Consultation'}
                        </td>

                        {/* Origin */}
                        <td className="py-3 px-4">
                          {isWhatsapp ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 border border-green-300 shadow-2xs">
                              <span>💬</span> WhatsApp Bot
                            </span>
                          ) : isAi ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                              <span>🎙️</span> AI Phone Agent
                            </span>
                          ) : isDesk ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs" title={appt.bookedByName || 'Desk Staff'}>
                              <span>📋</span> {appt.bookedByName || 'Desk Staff'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <span>👤</span> Clinic Staff
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                              isCompleted
                                ? 'bg-blue-100 text-blue-800'
                                : isCancelled
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {appt.status}
                          </span>
                        </td>

                        {/* Quick Actions */}
                        <td className="py-3 px-4 text-right space-x-1">
                          {!isCompleted && !isCancelled && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(appt.id, 'COMPLETED')}
                                title="Mark as Completed"
                                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium text-[11px] border border-emerald-200 transition cursor-pointer"
                              >
                                ✓ Complete
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(appt.id, 'CANCELLED')}
                                title="Cancel Appointment"
                                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium text-[11px] border border-rose-200 transition cursor-pointer"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          )}
                          {isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(appt.id, 'SCHEDULED')}
                              className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] transition cursor-pointer"
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
      <footer className="bg-white border-t border-gray-200 py-3 text-center text-xs text-gray-400">
        NextLite Unified Clinic Reception Desk &bull; Connected to {clinicDisplayName} CRM &bull; Real-time AI Agent Voice Sync
      </footer>
    </div>
  );
}
