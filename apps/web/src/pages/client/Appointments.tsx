import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import type { Appointment } from '../../types';
import { TableSkeleton } from '../../components/client/LoadingSkeleton';
import { EmptyState } from '../../components/client/EmptyState';
import { AppointmentDetailsDrawer } from '../../components/client/AppointmentDetailsDrawer';
import { WhatsAppComposer } from '../../components/client/WhatsAppComposer';
import { formatDateDDMMYYYY } from '../../utils/dateFormatters';

import { useAuth } from '../../contexts/AuthContext';
import { TimeSlotInput } from '../../components/client/TimeSlotInput';

export function ClientAppointments() {
  const { isViewer, profile } = useOutletContext<{ isViewer: boolean; profile?: any }>() || {};
  const { user } = useAuth();

  const resolvedDoctorName =
    profile?.doctorName?.trim() ||
    profile?.user?.name?.trim() ||
    user?.name?.trim() ||
    '';

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 15;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [bookedByFilter, setBookedByFilter] = useState<string>('ALL');

  const [loading, setLoading] = useState(true);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [whatsAppTargetAppt, setWhatsAppTargetAppt] = useState<Appointment | null>(null);

  // Quick Book Modal
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newPlace, setNewPlace] = useState('');
  const [newBookingDate, setNewBookingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newBookingTime, setNewBookingTime] = useState('10:00 AM');
  const [newTitle, setNewTitle] = useState('General Consultation');
  const [newResourceName, setNewResourceName] = useState(resolvedDoctorName);
  const [newNotes, setNewNotes] = useState('');
  const [newIsWalkIn, setNewIsWalkIn] = useState(true);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (resolvedDoctorName && !newResourceName) {
      setNewResourceName(resolvedDoctorName);
    }
  }, [resolvedDoctorName]);

  // Live Slot Availability Check inside Modal
  const [slotChecking, setSlotChecking] = useState(false);
  const [slotDetails, setSlotDetails] = useState<{
    slotAvailable: boolean;
    isOccupied?: boolean;
    isPast?: boolean;
    isOutsideShift?: boolean;
  } | null>(null);
  const [existingBookingInfo, setExistingBookingInfo] = useState<any>(null);

  const loadAppointments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.getClientAppointments({
        limit,
        offset: page * limit,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      setAppointments(res.appointments || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadAppointments();

    const handleRefresh = () => loadAppointments(false);
    const handleRefreshSilent = () => loadAppointments(true);
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefreshSilent);

    // Live sync polling every 10s
    const pollInterval = setInterval(() => {
      loadAppointments(true);
    }, 10000);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefreshSilent);
      clearInterval(pollInterval);
    };
  }, [loadAppointments]);

  // Check slot availability when date/time/phone changes in modal
  useEffect(() => {
    if (!bookModalOpen || !newBookingDate || !newBookingTime) return;

    let cancelled = false;
    const check = async () => {
      setSlotChecking(true);
      try {
        const res = await api.checkClientAppointmentSlots(newBookingDate, newCustomerPhone, newBookingTime);
        if (!cancelled) {
          setSlotDetails({
            slotAvailable: res.slotAvailable,
            isOccupied: res.isOccupied,
            isPast: res.isPast,
            isOutsideShift: res.isOutsideShift,
          });
          setExistingBookingInfo(res.hasExistingBooking ? res.existingBooking : null);
        }
      } catch (e) {
        if (!cancelled) {
          setSlotDetails(null);
        }
      } finally {
        if (!cancelled) setSlotChecking(false);
      }
    };

    const timer = setTimeout(check, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookModalOpen, newBookingDate, newBookingTime, newCustomerPhone]);

  const handleRowClick = async (appt: Appointment) => {
    setSelectedAppointment(appt);
    setDrawerOpen(true);
    try {
      const full = await api.getClientAppointment(appt.id);
      setSelectedAppointment(full);
    } catch (err) {
      console.error('Failed to fetch appointment details:', err);
    }
  };

  const handleOpenWhatsApp = (appt: Appointment) => {
    setWhatsAppTargetAppt(appt);
    setComposerOpen(true);
  };

  const handleAppointmentUpdated = (updated: Appointment) => {
    setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setSelectedAppointment(updated);
  };

  const handleMarkAsDone = async (appt: Appointment, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.updateClientAppointment(appt.id, { status: 'COMPLETED' });
      setAppointments((prev) => prev.map((a) => (a.id === appt.id ? { ...a, status: 'COMPLETED' } : a)));
      if (selectedAppointment?.id === appt.id) {
        setSelectedAppointment((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
      }
    } catch (err) {
      console.error('Failed to mark appointment as done:', err);
    }
  };

  const handleCreateWalkInBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName || !newCustomerPhone || !newBookingDate || !newBookingTime) {
      setBookingError('Please fill in patient name, phone number, date, and time.');
      return;
    }

    setBookingSubmitting(true);
    setBookingError(null);
    setBookingSuccess(null);

    try {
      const res = await api.bookClientAppointment({
        customerName: newCustomerName.trim(),
        customerPhone: newCustomerPhone.trim(),
        bookingDate: newBookingDate,
        bookingTime: newBookingTime,
        title: newTitle.trim() || 'General Consultation',
        resourceName: newResourceName.trim(),
        bookedBy: 'RECEPTIONIST',
        bookedByName: 'Desk Receptionist (Walk-in)',
        age: newAge.trim() || undefined,
        place: newPlace.trim() || undefined,
        walkIn: newIsWalkIn,
        notes: newNotes.trim() || undefined,
      });

      if (res.success) {
        setBookingSuccess(`Appointment ${res.appointment?.appointmentNumber || ''} created successfully!`);
        setTimeout(() => {
          setBookModalOpen(false);
          setNewCustomerName('');
          setNewCustomerPhone('');
          setNewAge('');
          setNewPlace('');
          setNewNotes('');
          setBookingSuccess(null);
          loadAppointments();
        }, 1200);
      }
    } catch (err: any) {
      setBookingError(err?.message || 'Failed to create booking. The time slot may already be reserved.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const filteredAppointments = appointments.filter((a) => {
    if (bookedByFilter !== 'ALL') {
      const bBy = (a.bookedBy || 'AGENT').toUpperCase();
      if (bookedByFilter === 'AGENT' && bBy !== 'AGENT') return false;
      if (bookedByFilter === 'RECEPTIONIST' && bBy !== 'RECEPTIONIST' && !a.walkIn) return false;
      if (bookedByFilter === 'WHATSAPP' && bBy !== 'WHATSAPP') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const numMatch = a.appointmentNumber?.toLowerCase().includes(q);
      const nameMatch = a.customerName.toLowerCase().includes(q);
      const phoneMatch = a.customerPhone.toLowerCase().includes(q);
      const titleMatch = a.title?.toLowerCase().includes(q);
      const bookedByMatch = a.bookedByName?.toLowerCase().includes(q) || a.bookedBy?.toLowerCase().includes(q);
      const ageVal = a.age || ((a.metadata as any)?.age != null ? String((a.metadata as any).age) : '');
      const placeVal = a.place || ((a.metadata as any)?.place != null ? String((a.metadata as any).place) : '') || ((a.metadata as any)?.location != null ? String((a.metadata as any).location) : '');
      const ageMatch = ageVal.toLowerCase().includes(q);
      const placeMatch = placeVal.toLowerCase().includes(q);
      return numMatch || nameMatch || phoneMatch || titleMatch || ageMatch || placeMatch || bookedByMatch;
    }
    return true;
  });

  const getStatusBadge = (status: Appointment['status']) => {
    switch (status) {
      case 'SCHEDULED':
      case 'CONFIRMED':
        return 'bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]';
      case 'COMPLETED':
        return 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]';
      case 'CANCELLED':
        return 'bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]';
      case 'REQUESTED':
      default:
        return 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]';
    }
  };

  const getBookedByBadge = (appt: Appointment) => {
    const bBy = (appt.bookedBy || 'AGENT').toUpperCase();
    if (bBy === 'WHATSAPP') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#dcfce7] text-[#15803d] border border-[#86efac]">
          <span className="text-[11px]">💬</span>
          WhatsApp Bot
        </span>
      );
    }
    if (bBy === 'AGENT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#eef2ff] text-[#4f46e5] border border-[#c7d2fe]">
          <svg className="w-3 h-3 text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
          AI Voice Assistant
        </span>
      );
    }
    if (bBy === 'RECEPTIONIST' || appt.walkIn) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]">
          <svg className="w-3 h-3 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Walk-in Receptionist
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f4f4f5] text-[#52525b] border border-[#e4e4e7]">
        Client Portal
      </span>
    );
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-5 sm:space-y-6 font-sans w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display-serif text-lg sm:text-2xl md:text-3xl font-light text-[#0c0a09] tracking-tight leading-tight">
            Appointments &amp; Bookings CRM
          </h1>
          <p className="text-[11px] sm:text-xs text-[#777169] mt-0.5 leading-normal">
            Unified conflict-free schedule synchronized across AI phone calls and clinic desk walk-ins.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <span className="el-badge text-[11px] self-start sm:self-auto">
            {total} Total Bookings
          </span>
          {!isViewer && (
            <button
              onClick={() => setBookModalOpen(true)}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs bg-[#0c0a09] text-white rounded-xl hover:bg-[#292524] transition-colors shadow-2xs leading-none cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Quick Walk-in Booking</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3.5 sm:p-4 bg-white border border-[#e7e5e4] rounded-2xl shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex-1 relative">
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#777169]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search reference #, patient, age, or source..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl pl-10 pr-4 py-2 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bookedByFilter}
            onChange={(e) => {
              setBookedByFilter(e.target.value);
              setPage(0);
            }}
            className="flex-1 sm:flex-none bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-2.5 sm:px-3 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
          >
            <option value="ALL">All Sources</option>
            <option value="AGENT">AI Voice Agent</option>
            <option value="WHATSAPP">WhatsApp Bot</option>
            <option value="RECEPTIONIST">Desk Walk-in</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="flex-1 sm:flex-none bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-2.5 sm:px-3 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
          >
            <option value="ALL">All Statuses</option>
            <option value="SCHEDULED">Scheduled (Active)</option>
            <option value="COMPLETED">Completed (Done)</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Appointments Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={9} />
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          title="No appointments booked yet"
          description={searchQuery ? 'No appointments matched your filter criteria.' : 'Appointments booked by your AI phone assistant and clinic reception desk will appear here automatically.'}
        />
      ) : (
        <div className="bg-white overflow-hidden border border-[#e7e5e4] shadow-2xs rounded-2xl">
          <div className="overflow-x-auto w-full scrollbar-thin">
            <table className="w-full min-w-[840px] divide-y divide-[#f0efed] text-left">
              <thead className="bg-[#fafafa] text-[#777169] text-[10px] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Ref #</th>
                  <th className="px-5 py-3.5">Patient / Contact</th>
                  <th className="px-3 py-3.5">Age</th>
                  {/* <th className="px-4 py-3.5">Place / City</th> */}
                  <th className="px-5 py-3.5">Schedule</th>
                  <th className="px-4 py-3.5">Booked By</th>
                  <th className="px-4 py-3.5">Service / Doctor</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0efed] text-xs">
                {filteredAppointments.map((appt) => {
                  const displayAge = appt.age || (appt.metadata as any)?.age || '-';
                  // const displayPlace = appt.place || (appt.metadata as any)?.place || (appt.metadata as any)?.location || '-';

                  return (
                    <tr
                      key={appt.id}
                      onClick={() => handleRowClick(appt)}
                      className="hover:bg-[#fafafa] cursor-pointer transition-colors group"
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-bold text-[#0c0a09] px-2.5 py-1 bg-[#f0efed] rounded-lg">
                          {appt.appointmentNumber || 'APT-???'}
                        </span>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="font-semibold text-[#0c0a09] block">{appt.customerName}</span>
                        <span className="font-mono text-[11px] text-[#777169]">{appt.customerPhone}</span>
                      </td>

                      <td className="px-3 py-4 whitespace-nowrap font-medium text-[#0c0a09]">
                        <span className="px-2 py-0.5 bg-[#fafafa] border border-[#e7e5e4] rounded text-[11px]">
                          {displayAge}
                        </span>
                      </td>

                      {/* <td className="px-4 py-4 whitespace-nowrap font-medium text-[#4e4e4e]">
                        {displayPlace}
                      </td> */}

                      <td className="px-5 py-4 whitespace-nowrap font-medium text-[#0c0a09]">
                        <span>{formatDateDDMMYYYY(appt.bookingDate)}</span>
                        <span className="text-[#777169] text-[11px] block">{appt.bookingTime}</span>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        {getBookedByBadge(appt)}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap text-[#4e4e4e]">
                        <span className="font-medium text-[#0c0a09] block">{appt.title || 'General Consultation'}</span>
                        <span className="text-[#777169] text-[11px] block">{appt.resourceName || 'Clinic Staff'}</span>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getStatusBadge(appt.status)}`}>
                          {appt.status}
                        </span>
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {appt.status !== 'COMPLETED' && appt.status !== 'CANCELLED' && (
                            <button
                              onClick={(e) => handleMarkAsDone(appt, e)}
                              className="el-btn-outline h-7 px-2.5 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex items-center gap-1 font-medium"
                              title="Mark Patient Attended / Done"
                            >
                              <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Done</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleRowClick(appt)}
                            className="el-btn-outline h-7 px-2.5 text-[11px] bg-white group-hover:border-[#0c0a09]"
                          >
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3 bg-[#fafafa] border-t border-[#f0efed] flex items-center justify-between text-xs text-[#777169]">
              <span>
                Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} appointments
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="el-btn-outline h-7 px-3 text-xs bg-white disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs font-medium text-[#0c0a09]">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="el-btn-outline h-7 px-3 text-xs bg-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Book Walk-In Modal */}
      {bookModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#e7e5e4] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-[#f0efed]">
              <div>
                <h3 className="font-display-serif text-xl font-medium text-[#0c0a09]">
                  New Walk-in / Desk Booking
                </h3>
                <p className="text-xs text-[#777169] mt-0.5">
                  Directly books into the unified schedule. AI agent will immediately avoid this slot.
                </p>
              </div>
              <button
                onClick={() => setBookModalOpen(false)}
                className="text-[#a8a29e] hover:text-[#0c0a09] transition-colors p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWalkInBooking} className="mt-4 space-y-4">
              {bookingError && (
                <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-xs text-[#b91c1c]">
                  {bookingError}
                </div>
              )}
              {bookingSuccess && (
                <div className="p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl text-xs text-[#15803d]">
                  {bookingSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                    Patient Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kulkarni"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                    Mobile Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +91 98765 43210"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                  Age
                </label>
                <input
                  type="text"
                  placeholder="e.g. 38"
                  value={newAge}
                  onChange={(e) => setNewAge(e.target.value)}
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                />
              </div>

              {/* <div>
                <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                  Place / Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pune / Kothrud"
                  value={newPlace}
                  onChange={(e) => setNewPlace(e.target.value)}
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                />
              </div> */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                    Booking Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newBookingDate}
                    onChange={(e) => setNewBookingDate(e.target.value)}
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                    Time Slot *
                  </label>
                  <TimeSlotInput
                    value={newBookingTime}
                    onChange={setNewBookingTime}
                  />
                </div>
              </div>

              {/* Real-time slot status indicator */}
              <div className="p-2.5 rounded-xl bg-[#fafafa] border border-[#e7e5e4] flex items-center justify-between text-xs">
                <span className="text-[#777169]">Slot Status:</span>
                {slotChecking ? (
                  <span className="text-[#777169] animate-pulse">Checking availability...</span>
                ) : slotDetails?.isOccupied ? (
                  <span className="text-[#b91c1c] font-semibold flex items-center gap-1">
                    ⚠️ Slot Already Booked (Conflict!)
                  </span>
                ) : slotDetails?.isPast ? (
                  <span className="text-[#d97706] font-semibold flex items-center gap-1">
                    ⚠️ Time Slot Has Passed Today
                  </span>
                ) : slotDetails?.isOutsideShift ? (
                  <span className="text-[#059669] font-medium flex items-center gap-1">
                    ✓ Custom Desk Slot Available (Off-Shift)
                  </span>
                ) : slotDetails ? (
                  <span className="text-[#15803d] font-semibold flex items-center gap-1">
                    ✓ Slot Open & Available
                  </span>
                ) : (
                  <span className="text-[#777169]">—</span>
                )}
              </div>

              {existingBookingInfo && (
                <div className="p-2.5 rounded-xl bg-[#fffbeb] border border-[#fef3c7] text-[11px] text-[#92400e]">
                  Patient already has booking <strong>{existingBookingInfo.appointmentNumber}</strong> on {formatDateDDMMYYYY(existingBookingInfo.bookingDate)} at {existingBookingInfo.bookingTime}.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                    Service / Reason
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Fever Consultation"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                    Doctor / Resource
                  </label>
                  <input
                    type="text"
                    placeholder={resolvedDoctorName ? `e.g. ${resolvedDoctorName}` : "e.g. Doctor Name"}
                    value={newResourceName}
                    onChange={(e) => setNewResourceName(e.target.value)}
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs text-[#44403c] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsWalkIn}
                    onChange={(e) => setNewIsWalkIn(e.target.checked)}
                    className="rounded text-[#0c0a09] focus:ring-0"
                  />
                  <span className="text-[11px] font-medium">Mark as Clinic Desk Walk-in Patient</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f0efed]">
                <button
                  type="button"
                  onClick={() => setBookModalOpen(false)}
                  className="el-btn-outline px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookingSubmitting || slotDetails?.isOccupied === true}
                  className="el-btn-primary px-5 py-2 text-xs bg-[#0c0a09] text-white rounded-xl hover:bg-[#292524] disabled:opacity-50"
                >
                  {bookingSubmitting ? 'Saving...' : 'Save Walk-in Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Appointment Drawer */}
      <AppointmentDetailsDrawer
        appointment={selectedAppointment}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdated={handleAppointmentUpdated}
        onOpenWhatsApp={handleOpenWhatsApp}
        isReadOnly={isViewer}
      />

      {/* WhatsApp Composer */}
      <WhatsAppComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialAppointment={whatsAppTargetAppt}
        initialPhone={whatsAppTargetAppt?.customerPhone || ''}
        initialCustomerName={whatsAppTargetAppt?.customerName || ''}
        onSuccess={loadAppointments}
      />
    </div>
  );
}
