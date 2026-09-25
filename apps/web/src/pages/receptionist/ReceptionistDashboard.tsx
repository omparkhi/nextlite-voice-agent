import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import type { Appointment } from '../../types';

import { TimeSlotInput } from '../../components/client/TimeSlotInput';
import { generateTimeSlots, getNearestUpcomingSlot, normalizeTimeString } from '../../utils/timeSlots';
import { AppointmentDetailsDrawer } from '../../components/client/AppointmentDetailsDrawer';
import { areEntitiesEqual } from '../../utils/fastDiff';

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

  // Mobile Navigation & View Tab State
  const [mobileTab, setMobileTab] = useState<'queue' | 'analytics'>('queue');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Appointments State
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'TABLE' | 'SLOTS'>('TABLE');

  // Fast Row-Entry Form State (auto-defaults to nearest upcoming slot)
  const [slotTime, setSlotTime] = useState<string>(() => getNearestUpcomingSlot(generateTimeSlots()));
  const [patientName, setPatientName] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [reason, setReason] = useState<string>('General Consultation');
  const [addingRow, setAddingRow] = useState<boolean>(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Dynamic slot capacity resolution (default 1, dynamically updated from backend clinic configuration)
  const [dynamicCapacity, setDynamicCapacity] = useState<number>(() => (user as any)?.patientsPerSlot || 1);
  const defaultCapacity = dynamicCapacity || (user as any)?.patientsPerSlot || 1;

  // Compute slot occupancy and active appointments per slot
  const slotOccupancy = React.useMemo(() => {
    const counts: Record<string, { booked: number; capacity: number; appts: Appointment[] }> = {};
    const activeAppts = appointments.filter(a => a.status !== 'CANCELLED');
    
    for (const appt of activeAppts) {
      const norm = normalizeTimeString(appt.bookingTime) || appt.bookingTime;
      if (!counts[norm]) {
        counts[norm] = { booked: 0, capacity: defaultCapacity, appts: [] };
      }
      counts[norm].booked += 1;
      counts[norm].appts.push(appt);
      if (counts[norm].booked > counts[norm].capacity) {
        counts[norm].capacity = counts[norm].booked;
      }
    }
    return counts;
  }, [appointments, defaultCapacity]);

  const normSlotTime = normalizeTimeString(slotTime) || slotTime;
  const currentSlotOcc = slotOccupancy[normSlotTime] || { booked: 0, capacity: defaultCapacity, appts: [] };
  const isSelectedSlotFull = currentSlotOcc.booked >= currentSlotOcc.capacity && currentSlotOcc.capacity > 0 && currentSlotOcc.booked > 0;

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
    setErrorMsg(null);

    try {
      const res = await api.getClientAppointments({
        bookingDate: selectedDate,
        limit: 100,
        tenantId: user?.tenantId,
      });
      const incoming = res.appointments || [];
      setAppointments((prev) => (areEntitiesEqual(prev, incoming) ? prev : incoming));

      if (res.patientsPerSlot || res.capacity) {
        const newCap = res.patientsPerSlot || res.capacity || 1;
        setDynamicCapacity((prev) => (prev === newCap ? prev : newCap));
      }
      setLastSyncTime(new Date());
    } catch (err: any) {
      if (!silent) {
        setErrorMsg(err?.message || 'Unable to connect to clinic schedule.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedDate, user?.tenantId]);

  // Initial & Date-change load
  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Real-time background sync polling every 5 seconds (silent diffing prevents flickering)
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadAppointments(true);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [loadAppointments]);

  // Handle Quick Add Entry
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) {
      setErrorMsg('Please enter the patient name.');
      nameInputRef.current?.focus();
      return;
    }

    const cleanPhone = phone.trim() ? phone.trim() : '';

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
        bookedBy: 'RECEPTIONIST',
        bookedByName: bookedByName,
        age: age.trim() || undefined,
        walkIn: true,
        patientsPerSlot: defaultCapacity,
      });

      if (res) {
        setSuccessToast(`Patient "${patientName.trim()}" booked for ${slotTime}!`);
        setPatientName('');
        setAge('');
        setPhone('');
        setReason('General Consultation');
        await loadAppointments(true);
        setTimeout(() => setSuccessToast(null), 3500);
        nameInputRef.current?.focus();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to add appointment. Please retry.');
    } finally {
      setAddingRow(false);
    }
  };

  // Status Change Handler
  const handleUpdateStatus = async (appointmentId: string, status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED') => {
    try {
      await api.updateClientAppointment(appointmentId, { status });
      await loadAppointments(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to update status');
    }
  };

  // Filtered Appointments (Memoized to avoid layout shifts)
  const filteredAppointments = React.useMemo(() => {
    return appointments.filter((appt) => {
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
  }, [appointments, sourceFilter, searchQuery]);

  // Calculate Metrics (Memoized)
  const { totalCount, aiCount, deskCount, whatsappCount, completedCount } = React.useMemo(() => {
    return {
      totalCount: appointments.length,
      aiCount: appointments.filter((a) => a.bookedBy === 'AGENT').length,
      deskCount: appointments.filter((a) => a.bookedBy === 'RECEPTIONIST' || a.bookedBy === 'MANUAL_CLIENT').length,
      whatsappCount: appointments.filter((a) => a.bookedBy === 'WHATSAPP').length,
      completedCount: appointments.filter((a) => a.status === 'COMPLETED').length,
    };
  }, [appointments]);

  return (
    <div className="min-h-screen bg-white text-[#0c0a09] font-sans flex flex-col">
      {/* Top Navbar Header */}
      <header className="h-16 px-4 sm:px-6 md:px-8 border-b border-[#e7e5e4] bg-white sticky top-0 z-40 flex items-center justify-between shadow-2xs">
        {/* Business Brand & Desk Identity */}
        <div className="flex items-center gap-3">
          <img
            src="/vanifyai-logo.jpg"
            alt="VanifyAI"
            className="w-8 h-8 rounded-lg object-contain bg-black p-1 shadow-xs ring-1 ring-black/5 shrink-0"
          />
          <div className="truncate">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-semibold text-base sm:text-lg text-[#0c0a09] tracking-tight truncate max-w-[160px] sm:max-w-[260px] md:max-w-none">
                {clinicDisplayName}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-[#f0efed] text-[#0c0a09] border border-[#e7e5e4] shrink-0">
                Front Desk
              </span>
            </div>
          </div>
        </div>

        {/* Desktop Controls (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-3">
          {/* Live Sync Status Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#e7e5e4] bg-[#fafafa] text-xs text-[#777169]">
            <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
            <span>
              Synced:{' '}
              {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => loadAppointments(false)}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-full border border-[#e7e5e4] bg-white hover:bg-[#f0efed] text-[#0c0a09] text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Refresh schedule now"
          >
            <svg
              className={`w-3.5 h-3.5 text-[#777169] ${loading ? 'animate-spin' : ''}`}
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

        {/* Mobile Controls (Refresh + Hamburger) */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => loadAppointments(false)}
            disabled={loading}
            className="p-2 rounded-full border border-[#e7e5e4] bg-white hover:bg-[#f0efed] text-[#0c0a09] transition shadow-2xs"
            title="Refresh Schedule"
          >
            <svg
              className={`w-4 h-4 text-[#777169] ${loading ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl border border-[#e7e5e4] bg-white hover:bg-[#f0efed] text-[#0c0a09] transition shadow-2xs"
            aria-label="Toggle Navigation Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Dropdown Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 z-30 bg-white/95 backdrop-blur-md border-b border-[#e7e5e4] shadow-xl p-4 space-y-4 animate-in slide-in-from-top-2 duration-150">
          {/* User Profile Bar */}
          {user && (
            <div className="p-3 bg-[#fafafa] rounded-2xl border border-[#e7e5e4] flex items-center justify-between">
              <div className="flex items-center gap-3 truncate">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#ea580c] to-[#f97316] text-white flex items-center justify-center font-semibold text-sm shadow-xs shrink-0 select-none">
                  {staffInitial}
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-[#0c0a09] truncate">{staffName}</p>
                  <p className="text-[11px] text-[#777169] truncate">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setIsMobileMenuOpen(false);
                  await logout();
                  navigate('/login');
                }}
                className="px-3 py-1.5 rounded-full bg-white hover:bg-[#fef2f2] text-[#dc2626] border border-[#fecaca] text-xs font-medium transition cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          )}

          {/* Sync Status Info */}
          <div className="flex items-center justify-between text-xs text-[#777169] px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
              Live Phone Sync Active
            </span>
            <span className="font-mono text-[11px]">
              {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Tab Navigation in Mobile Menu */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#f0efed]">
            <button
              type="button"
              onClick={() => {
                setMobileTab('queue');
                setIsMobileMenuOpen(false);
              }}
              className={`p-3 rounded-2xl text-xs font-medium text-center transition flex flex-col items-center gap-1.5 ${
                mobileTab === 'queue'
                  ? 'bg-[#0c0a09] text-white shadow-xs'
                  : 'bg-[#fafafa] border border-[#e7e5e4] text-[#4e4e4e]'
              }`}
            >
              <svg className={`w-4 h-4 ${mobileTab === 'queue' ? 'text-white' : 'text-[#777169]'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M9 12h6M9 16h6" />
              </svg>
              <span>Live Queue ({totalCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileTab('analytics');
                setIsMobileMenuOpen(false);
              }}
              className={`p-3 rounded-2xl text-xs font-medium text-center transition flex flex-col items-center gap-1.5 ${
                mobileTab === 'analytics'
                  ? 'bg-[#0c0a09] text-white shadow-xs'
                  : 'bg-[#fafafa] border border-[#e7e5e4] text-[#4e4e4e]'
              }`}
            >
              <svg className={`w-4 h-4 ${mobileTab === 'analytics' ? 'text-white' : 'text-[#777169]'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Clinic Analytics</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="w-full mx-auto p-4 sm:p-6 md:p-8 space-y-5 md:space-y-6 flex-1">
        {/* Toast / Error alerts */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-[#fef2f2] border border-[#fecaca] text-xs text-[#dc2626] flex items-center justify-between shadow-2xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#dc2626] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-[#dc2626] hover:opacity-80 text-sm font-bold cursor-pointer p-1"
            >
              ✕
            </button>
          </div>
        )}

        {successToast && (
          <div className="p-3.5 rounded-2xl bg-[#f0fdf4] border border-[#bbf7d0] text-xs text-[#166534] flex items-center justify-between shadow-2xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 font-medium">
              <svg className="w-4 h-4 text-[#16a34a] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{successToast}</span>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="text-[#16a34a] hover:opacity-80 text-sm font-bold cursor-pointer p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Mobile Top Segmented Tab Switcher */}
        <div className="flex md:hidden bg-[#f0efed] p-1 rounded-2xl border border-[#e7e5e4]">
          <button
            type="button"
            onClick={() => setMobileTab('queue')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer leading-none ${
              mobileTab === 'queue'
                ? 'bg-white text-[#0c0a09] font-semibold shadow-xs'
                : 'text-[#777169] hover:text-[#0c0a09]'
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 12h6M9 16h6" />
            </svg>
            <span className="text-xs">Live Queue</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none ${
              mobileTab === 'queue' ? 'bg-[#0c0a09] text-white' : 'bg-[#e7e5e4] text-[#4e4e4e]'
            }`}>
              {filteredAppointments.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('analytics')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer leading-none ${
              mobileTab === 'analytics'
                ? 'bg-white text-[#0c0a09] font-semibold shadow-xs'
                : 'text-[#777169] hover:text-[#0c0a09]'
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span className="text-xs">Analytics & Stats</span>
          </button>
        </div>

        {/* Header Greeting & Date Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-2xl md:text-3xl font-light text-[#0c0a09] tracking-tight leading-tight">
              Reception Desk Schedule
            </h1>
            <p className="text-[11px] sm:text-xs text-[#777169] mt-0.5 leading-normal">
              Live multi-channel queue across AI voice reception, WhatsApp bookings, and front desk walk-ins.
            </p>
          </div>

          {/* Date Selector Control */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition cursor-pointer leading-none ${
                selectedDate === todayStr
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
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition cursor-pointer leading-none ${
                selectedDate !== todayStr &&
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
              className="px-2.5 py-1.5 text-xs font-medium border border-[#e7e5e4] rounded-full bg-white text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] cursor-pointer shadow-2xs leading-none"
            />
          </div>
        </div>

        {/* 5-Column Overview KPI Cards (Desktop Always Visible, Mobile Only on 'analytics' Tab) */}
        <div
          className={`${
            mobileTab === 'analytics' ? 'grid' : 'hidden'
          } md:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4`}
        >
          <div className="p-4 sm:p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all">
            <span className="text-xs font-medium text-[#777169]">Total Booked</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{totalCount}</p>
          </div>

          <div className="p-4 sm:p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all">
            <span className="text-xs font-medium text-[#777169]">AI Phone Bookings</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{aiCount}</p>
          </div>

          <div className="p-4 sm:p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all">
            <span className="text-xs font-medium text-[#777169]">Desk Walk-ins</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{deskCount}</p>
          </div>

          <div className="p-4 sm:p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all">
            <span className="text-xs font-medium text-[#777169]">WhatsApp Bookings</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{whatsappCount}</p>
          </div>

          <div className="p-4 sm:p-5 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between shadow-2xs hover:bg-[#f0efed]/80 transition-all col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-[#777169]">Completed Visits</span>
            <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">{completedCount}</p>
          </div>
        </div>

        {/* Extra Analytics Breakdown (shown on mobile Analytics tab) */}
        {mobileTab === 'analytics' && (
          <div className="md:hidden bg-white border border-[#e7e5e4] rounded-2xl p-4 shadow-2xs space-y-3">
            <h3 className="text-xs font-semibold text-[#0c0a09] uppercase tracking-wider">
              Booking Channel Breakdown
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-[#f0efed]">
                <span className="text-[#777169] flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  AI Voice Calls
                </span>
                <span className="font-semibold text-[#0c0a09]">{aiCount}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[#f0efed]">
                <span className="text-[#777169] flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  WhatsApp Inbound
                </span>
                <span className="font-semibold text-[#0c0a09]">{whatsappCount}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[#f0efed]">
                <span className="text-[#777169] flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  Front Desk Walk-ins
                </span>
                <span className="font-semibold text-[#0c0a09]">{deskCount}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileTab('queue')}
              className="w-full mt-3 py-2.5 rounded-xl bg-[#0c0a09] text-white text-xs font-medium hover:opacity-90 transition"
            >
              ← Back to Live Queue
            </button>
          </div>
        )}

        {/* MAIN QUEUE SECTION (Visible on Desktop always, or Mobile on 'queue' tab) */}
        <div className={`${mobileTab === 'queue' ? 'block' : 'hidden'} md:block space-y-5 md:space-y-6`}>
          {/* FAST ROW-ENTRY APPOINTMENT REGISTER FORM */}
          <div className="bg-white border border-[#e7e5e4] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0c0a09] leading-none">
                  Quick Walk-In Registration
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f0efed] text-[#4e4e4e] leading-none">
                  Fast Entry
                </span>
              </div>
              <span className="hidden sm:inline text-[11px] text-[#777169] leading-none">
                Press <kbd className="px-1.5 py-0.5 bg-[#f0efed] border border-[#e7e5e4] rounded text-[10px] font-mono leading-none">Enter</kbd> to add
              </span>
            </div>

            <form onSubmit={handleQuickAdd} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
              {/* Slot Time */}
              <div className="sm:col-span-1 md:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] sm:text-[11px] font-medium text-[#777169] uppercase tracking-wider leading-none">
                    Time Slot (Pick or Type)
                  </label>
                  {isSelectedSlotFull ? (
                    <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                      FULL ({currentSlotOcc.booked}/{currentSlotOcc.capacity})
                    </span>
                  ) : currentSlotOcc.booked > 0 ? (
                    <span className="text-[10px] text-amber-700 font-medium">
                      {currentSlotOcc.booked}/{currentSlotOcc.capacity} booked
                    </span>
                  ) : null}
                </div>
                <TimeSlotInput
                  value={slotTime}
                  onChange={setSlotTime}
                  slotOccupancy={slotOccupancy}
                />
              </div>

              {/* Patient Name */}
              <div className="sm:col-span-1 md:col-span-3">
                <label className="block text-[10px] sm:text-[11px] font-medium text-[#777169] uppercase tracking-wider mb-1 leading-none">
                  Patient Name <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kulkarni"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#0c0a09] shadow-2xs h-10 leading-normal"
                />
              </div>

              {/* Age */}
              <div className="sm:col-span-1 md:col-span-1">
                <label className="block text-[10px] sm:text-[11px] font-medium text-[#777169] uppercase tracking-wider mb-1 sm:text-center leading-none">
                  Age
                </label>
                <input
                  type="text"
                  placeholder="32"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full px-2 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#0c0a09] shadow-2xs sm:text-center h-10 leading-normal"
                />
              </div>

              {/* Phone */}
              <div className="sm:col-span-1 md:col-span-3">
                <label className="block text-[10px] sm:text-[11px] font-medium text-[#777169] uppercase tracking-wider mb-1 leading-none">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210 (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#0c0a09] shadow-2xs h-10 leading-normal"
                />
              </div>

              {/* Submit Button */}
              <div className="sm:col-span-2 md:col-span-2">
                <button
                  type="submit"
                  disabled={addingRow || isSelectedSlotFull}
                  className={`w-full h-10 rounded-xl text-xs font-medium transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer leading-none ${
                    isSelectedSlotFull
                      ? 'bg-rose-100 text-rose-700 border border-rose-200 cursor-not-allowed opacity-80'
                      : 'bg-[#0c0a09] hover:opacity-90 text-white disabled:opacity-50'
                  }`}
                >
                  {addingRow ? (
                    <span>Saving...</span>
                  ) : isSelectedSlotFull ? (
                    <span>Slot FULL ({currentSlotOcc.booked}/{currentSlotOcc.capacity})</span>
                  ) : (
                    <span>+ Quick Book</span>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Schedule Queue Card */}
          <div className="bg-white border border-[#e7e5e4] rounded-2xl overflow-hidden shadow-2xs">
            {/* Table Header / Filters */}
            <div className="p-3.5 sm:p-5 border-b border-[#f0efed] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div>
                  <h3 className="font-semibold text-sm sm:text-base text-[#0c0a09] tracking-tight leading-snug">
                    Appointment Queue ({filteredAppointments.length})
                  </h3>
                  <p className="text-[11px] sm:text-xs text-[#777169] mt-0.5 leading-normal">
                    Live queue synchronized across AI phone reception and desk
                  </p>
                </div>

                {/* Source Filters */}
                <div className="inline-flex rounded-full bg-[#f0efed] p-0.5 text-xs font-medium self-start sm:self-auto overflow-x-auto max-w-full">
                  <button
                    type="button"
                    onClick={() => setSourceFilter('ALL')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer text-xs shrink-0 leading-none ${
                      sourceFilter === 'ALL'
                        ? 'bg-white text-[#0c0a09] font-semibold shadow-2xs'
                        : 'text-[#777169] hover:text-[#0c0a09]'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('AI')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer text-xs flex items-center gap-1 shrink-0 leading-none ${
                      sourceFilter === 'AI'
                        ? 'bg-white text-[#0c0a09] font-semibold shadow-2xs'
                        : 'text-[#777169] hover:text-[#0c0a09]'
                    }`}
                  >
                    <span>AI Calls</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('DESK')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer text-xs flex items-center gap-1 shrink-0 leading-none ${
                      sourceFilter === 'DESK'
                        ? 'bg-white text-[#0c0a09] font-semibold shadow-2xs'
                        : 'text-[#777169] hover:text-[#0c0a09]'
                    }`}
                  >
                    <span>Desk</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('WHATSAPP')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer text-xs flex items-center gap-1 shrink-0 leading-none ${
                      sourceFilter === 'WHATSAPP'
                        ? 'bg-white text-[#0c0a09] font-semibold shadow-2xs'
                        : 'text-[#777169] hover:text-[#0c0a09]'
                    }`}
                  >
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* View Switcher & Search Input */}
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <div className="inline-flex rounded-full bg-[#f0efed] p-0.5 text-xs font-medium shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode('TABLE')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer text-xs leading-none ${
                      viewMode === 'TABLE'
                        ? 'bg-white text-[#0c0a09] font-semibold shadow-2xs'
                        : 'text-[#777169] hover:text-[#0c0a09]'
                    }`}
                  >
                    Register View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('SLOTS')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer text-xs flex items-center gap-1.5 leading-none ${
                      viewMode === 'SLOTS'
                        ? 'bg-white text-[#0c0a09] font-semibold shadow-2xs'
                        : 'text-[#777169] hover:text-[#0c0a09]'
                    }`}
                  >
                    <span>Slot Schedule</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#0c0a09] text-white">
                      {Object.keys(slotOccupancy).length}
                    </span>
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative flex-1 sm:w-56">
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
                    className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-white border border-[#d6d3d1] rounded-full text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#0c0a09] font-medium leading-normal"
                  />
                </div>
              </div>
            </div>

            {/* QUEUE CONTENT */}
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
                  Use the quick registration form above to add a walk-in patient, or incoming AI phone bookings will appear in real time.
                </p>
              </div>
            ) : viewMode === 'SLOTS' ? (
              <div className="p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {generateTimeSlots().map((slot) => {
                    const norm = normalizeTimeString(slot) || slot;
                    const occ = slotOccupancy[norm] || { booked: 0, capacity: defaultCapacity, appts: [] };
                    const isFull = occ.booked >= occ.capacity && occ.capacity > 0 && occ.booked > 0;

                    // Filter appointments inside this slot if searching or filtering by source
                    const slotAppts = occ.appts.filter((appt) => {
                      if (sourceFilter === 'AI' && appt.bookedBy !== 'AGENT') return false;
                      if (sourceFilter === 'DESK' && appt.bookedBy !== 'RECEPTIONIST' && appt.bookedBy !== 'MANUAL_CLIENT') return false;
                      if (sourceFilter === 'WHATSAPP' && appt.bookedBy !== 'WHATSAPP') return false;
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        appt.customerName?.toLowerCase().includes(q) ||
                        appt.customerPhone?.toLowerCase().includes(q) ||
                        appt.appointmentNumber?.toLowerCase().includes(q)
                      );
                    });

                    // Hide empty slots if search query is active
                    if (occ.booked === 0 && searchQuery) return null;

                    return (
                      <div
                        key={slot}
                        className={`p-4 rounded-2xl border transition-all ${
                          isFull
                            ? 'bg-[#fef2f2]/40 border-[#fecaca]'
                            : occ.booked > 0
                            ? 'bg-white border-[#e7e5e4] shadow-2xs'
                            : 'bg-[#fafafa]/50 border-[#f0efed]'
                        }`}
                      >
                        {/* Slot Header */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-[#f0efed]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-xs text-[#0c0a09]">{slot}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${
                                isFull
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : occ.booked > 0
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : 'bg-[#f0efed] text-[#777169]'
                              }`}
                            >
                              {isFull ? `FULL (${occ.booked}/${occ.capacity})` : `${occ.booked} / ${occ.capacity} booked`}
                            </span>
                          </div>

                          {!isFull ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSlotTime(slot);
                                nameInputRef.current?.focus();
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#0c0a09] text-white hover:opacity-90 text-[10px] font-semibold transition cursor-pointer shadow-2xs"
                            >
                              + Add Patient
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 uppercase tracking-wider">
                              FULL
                            </span>
                          )}
                        </div>

                        {/* Patients in this slot */}
                        <div className="mt-3 space-y-2">
                          {slotAppts.length === 0 ? (
                            <p className="text-[11px] text-[#a8a29e] italic py-1 text-center">
                              {occ.booked === 0 ? 'No patients booked' : 'No matching patients'}
                            </p>
                          ) : (
                            slotAppts.map((appt) => (
                              <div
                                key={appt.id}
                                onClick={() => {
                                  setSelectedAppointment(appt);
                                  setIsDetailsOpen(true);
                                }}
                                className="p-2.5 rounded-xl bg-white border border-[#e7e5e4] hover:border-[#0c0a09] transition flex items-center justify-between cursor-pointer shadow-2xs text-xs"
                              >
                                <div className="truncate mr-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-[#0c0a09] truncate">{appt.customerName}</span>
                                    {appt.appointmentNumber && (
                                      <span className="font-mono text-[10px] text-[#777169]">({appt.appointmentNumber})</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-[#777169] truncate">
                                    {appt.customerPhone} &bull; {appt.title || 'Consultation'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                                      appt.status === 'COMPLETED'
                                        ? 'bg-[#f0efed] text-[#4e4e4e]'
                                        : appt.status === 'CANCELLED'
                                        ? 'bg-[#fef2f2] text-[#dc2626]'
                                        : 'bg-[#dcfce7] text-[#15803d]'
                                    }`}
                                  >
                                    {appt.status}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                {/* Unified Table View (Identical to Laptop Screen, Horizontally Scrollable on Mobile) */}
                <div className="overflow-x-auto w-full scrollbar-thin">
                  <table className="w-full min-w-[920px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#fafafa] border-b border-[#f0efed] text-[10px] sm:text-[11px] font-semibold text-[#777169] uppercase tracking-wider whitespace-nowrap leading-tight">
                        <th className="py-3 px-3 w-20 text-center align-middle">Sr. No.</th>
                        <th className="py-3 px-3 w-28 text-center align-middle">Time Slot</th>
                        <th className="py-3 px-4 min-w-[140px] text-center align-middle">Patient Name</th>
                        <th className="py-3 px-2 w-14 text-center align-middle">Age</th>
                        <th className="py-3 px-3 w-32 text-center align-middle">Phone Number</th>
                        <th className="py-3 px-4 min-w-[140px] text-center align-middle">Reason / Notes</th>
                        <th className="py-3 px-3 w-28 text-center align-middle">Channel / Origin</th>
                        <th className="py-3 px-3 w-28 text-center align-middle">Status</th>
                        <th className="py-3 px-3 w-36 text-center align-middle">Actions</th>
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
                            onClick={() => {
                              setSelectedAppointment(appt);
                              setIsDetailsOpen(true);
                            }}
                            className={`hover:bg-[#fafafa] transition-colors whitespace-nowrap cursor-pointer ${
                              isCompleted
                                ? 'bg-[#fafafa] text-[#777169]'
                                : isCancelled
                                ? 'bg-[#fef2f2]/30 text-[#a8a29e] line-through'
                                : ''
                            }`}
                          >
                            {/* Token # */}
                            <td className="py-3 px-3 font-mono font-semibold text-[#4e4e4e] text-xs text-center align-middle whitespace-nowrap leading-normal">
                              {appt.appointmentNumber || `#${idx + 1}`}
                            </td>

                            {/* Time Slot */}
                            <td className="py-3 px-3 text-center align-middle whitespace-nowrap leading-normal">
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md font-mono font-medium text-xs bg-[#f0efed] text-[#0c0a09] border border-[#e7e5e4] whitespace-nowrap leading-none">
                                {appt.bookingTime}
                              </span>
                            </td>

                            {/* Patient Name */}
                            <td className="py-3 px-4 font-semibold text-[#0c0a09] text-center align-middle whitespace-nowrap leading-normal">
                              {appt.customerName}
                            </td>

                            {/* Age */}
                            <td className="py-3 px-2 text-center align-middle text-[#777169] text-xs whitespace-nowrap leading-normal">
                              {appt.age || '—'}
                            </td>

                            {/* Phone */}
                            <td className="py-3 px-3 text-center align-middle text-[#777169] text-xs font-mono whitespace-nowrap leading-normal">
                              {appt.customerPhone && appt.customerPhone !== '+91 98000 00000' && appt.customerPhone !== '+910000000000' ? appt.customerPhone : '—'}
                            </td>

                            {/* Reason / Title */}
                            <td className="py-3 px-4 text-[#777169] text-xs text-center align-middle max-w-[200px] truncate whitespace-nowrap leading-normal" title={appt.title || 'Consultation'}>
                              {appt.title || 'Consultation'}
                            </td>

                            {/* Origin */}
                            <td className="py-3 px-3 text-center align-middle whitespace-nowrap leading-normal">
                              {isWhatsapp ? (
                                <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap leading-none">
                                  WhatsApp Bot
                                </span>
                              ) : isAi ? (
                                <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap leading-none">
                                  AI Voice Call
                                </span>
                              ) : isDesk ? (
                                <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#f0efed] text-[#0c0a09] border border-[#e7e5e4] whitespace-nowrap leading-none" title={appt.bookedByName || 'Desk Staff'}>
                                  {appt.bookedByName || 'Front Desk'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#f0efed] text-[#4e4e4e] whitespace-nowrap leading-none">
                                  Clinic Staff
                                </span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-3 text-center align-middle whitespace-nowrap leading-normal">
                              <span
                                className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap leading-none ${
                                  isCompleted
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
                            <td className="py-3 px-3 text-center align-middle whitespace-nowrap leading-normal" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAppointment(appt);
                                    setIsDetailsOpen(true);
                                  }}
                                  title="Edit Appointment Details"
                                  className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-white hover:bg-[#fafafa] text-[#0c0a09] font-medium text-[11px] border border-[#d6d3d1] transition cursor-pointer shadow-2xs gap-1 leading-none"
                                >
                                  <svg className="w-3 h-3 text-[#777169]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  <span>Edit</span>
                                </button>

                                {!isCompleted && !isCancelled && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateStatus(appt.id, 'COMPLETED');
                                      }}
                                      title="Mark as Done"
                                      className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-white hover:bg-[#f0fdf4] text-[#15803d] font-medium text-[11px] border border-[#bbf7d0] transition cursor-pointer shadow-2xs whitespace-nowrap leading-none"
                                    >
                                      ✓ Done
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateStatus(appt.id, 'CANCELLED');
                                      }}
                                      title="Cancel Appointment"
                                      className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-white hover:bg-[#fef2f2] text-[#dc2626] font-medium text-[11px] border border-[#fecaca] transition cursor-pointer shadow-2xs whitespace-nowrap leading-none"
                                    >
                                      ✕ Cancel
                                    </button>
                                  </>
                                )}
                                {isCancelled && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateStatus(appt.id, 'SCHEDULED');
                                    }}
                                    className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-[#f0efed] hover:bg-[#e7e5e4] text-[#0c0a09] text-[11px] transition cursor-pointer whitespace-nowrap leading-none"
                                  >
                                    Restore
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Appointment Details & Edit Drawer */}
      <AppointmentDetailsDrawer
        appointment={selectedAppointment}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedAppointment(null);
        }}
        onUpdated={async (updated) => {
          setIsDetailsOpen(false);
          setSelectedAppointment(null);
          setSuccessToast(`Appointment ${updated.appointmentNumber || ''} for ${updated.customerName} updated successfully.`);
          setTimeout(() => setSuccessToast(null), 4000);
          await loadAppointments(true);
        }}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-[#f0efed] py-4 text-center text-xs text-[#777169] px-4">
        VanifyAI Unified Front Desk &bull; Connected to {clinicDisplayName} CRM &bull; Real-time AI Agent Voice Sync
      </footer>
    </div>
  );
}
