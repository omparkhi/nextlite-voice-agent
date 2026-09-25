import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import type { Appointment, FollowUpItem } from '../../types';
import { TableSkeleton } from '../../components/client/LoadingSkeleton';
import { EmptyState } from '../../components/client/EmptyState';
import { AppointmentDetailsDrawer } from '../../components/client/AppointmentDetailsDrawer';
import { WhatsAppComposer } from '../../components/client/WhatsAppComposer';
import { formatDateTimeDDMMYYYY } from '@/utils/dateFormatters';
import { areEntitiesEqual } from '../../utils/fastDiff';

export function ClientFollowUps() {
  const { isViewer } = useOutletContext<{ isViewer: boolean }>();
  const [activeTab, setActiveTab] = useState<'bookings' | 'messages'>('bookings');

  // WhatsApp Bookings state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsTotal, setAppointmentsTotal] = useState(0);
  const [appointmentsPage, setAppointmentsPage] = useState(0);
  const [apptStatusFilter, setApptStatusFilter] = useState<string>('ALL');
  const [apptSearchQuery, setApptSearchQuery] = useState('');
  const [loadingAppts, setLoadingAppts] = useState(true);

  // Dispatched Follow-ups state
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [followUpsTotal, setFollowUpsTotal] = useState(0);
  const [followUpsPage, setFollowUpsPage] = useState(0);
  const [msgStatusFilter, setMsgStatusFilter] = useState<string>('ALL');
  const [loadingFollowUps, setLoadingFollowUps] = useState(true);

  // Modals and Drawers
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [whatsAppTargetAppt, setWhatsAppTargetAppt] = useState<Appointment | null>(null);

  const limit = 15;

  const loadAppointments = useCallback(async (silent = false) => {
    if (!silent) setLoadingAppts(true);
    try {
      const res = await api.getClientAppointments({
        limit,
        offset: appointmentsPage * limit,
        status: apptStatusFilter !== 'ALL' ? apptStatusFilter : undefined,
        bookedBy: 'WHATSAPP',
      });
      const incoming = res.appointments || [];
      const incomingTotal = res.total || 0;
      setAppointments((prev) => areEntitiesEqual(prev, incoming) ? prev : incoming);
      setAppointmentsTotal((prev) => prev !== incomingTotal ? incomingTotal : prev);
    } catch (err) {
      console.error('Failed to load WhatsApp appointments:', err);
    } finally {
      if (!silent) setLoadingAppts(false);
    }
  }, [appointmentsPage, apptStatusFilter, limit]);

  const loadFollowUps = useCallback(async (silent = false) => {
    if (!silent) setLoadingFollowUps(true);
    try {
      const res = await api.getClientFollowUps({
        limit,
        offset: followUpsPage * limit,
        status: msgStatusFilter !== 'ALL' ? msgStatusFilter : undefined,
      });
      const incoming = res.followUps || [];
      const incomingTotal = res.total || 0;
      setFollowUps((prev) => areEntitiesEqual(prev, incoming) ? prev : incoming);
      setFollowUpsTotal((prev) => prev !== incomingTotal ? incomingTotal : prev);
    } catch (err) {
      console.error('Failed to load follow-ups:', err);
    } finally {
      if (!silent) setLoadingFollowUps(false);
    }
  }, [followUpsPage, msgStatusFilter, limit]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  useEffect(() => {
    const handleRefresh = () => {
      loadAppointments(false);
      loadFollowUps(false);
    };
    const handleRefreshSilent = () => {
      loadAppointments(true);
      loadFollowUps(true);
    };
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefreshSilent);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefreshSilent);
    };
  }, [loadAppointments, loadFollowUps]);

  const getMsgStatusBadge = (status: FollowUpItem['status']) => {
    switch (status) {
      case 'DELIVERED':
        return 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]';
      case 'SENT':
        return 'bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]';
      case 'FAILED':
        return 'bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]';
      case 'PENDING':
      default:
        return 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]';
    }
  };

  const getApptStatusBadge = (status: Appointment['status']) => {
    switch (status) {
      case 'CONFIRMED':
      case 'SCHEDULED':
        return 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]';
      case 'COMPLETED':
        return 'bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]';
      case 'CANCELLED':
      case 'NO_SHOW':
        return 'bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]';
      case 'REQUESTED':
      default:
        return 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]';
    }
  };

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      if (!apptSearchQuery.trim()) return true;
      const q = apptSearchQuery.toLowerCase();
      const numMatch = appt.appointmentNumber?.toLowerCase().includes(q);
      const nameMatch = appt.customerName?.toLowerCase().includes(q);
      const phoneMatch = appt.customerPhone?.toLowerCase().includes(q);
      const titleMatch = appt.title?.toLowerCase().includes(q);
      const notesMatch = appt.notes?.toLowerCase().includes(q);
      return Boolean(numMatch || nameMatch || phoneMatch || titleMatch || notesMatch);
    });
  }, [appointments, apptSearchQuery]);

  const apptTotalPages = Math.ceil(appointmentsTotal / limit);
  const msgTotalPages = Math.ceil(followUpsTotal / limit);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">
            WhatsApp CRM & Dispatches
          </h1>
          <p className="text-xs text-[#777169] mt-0.5">
            Manage live WhatsApp chatbot bookings, scheduled appointments, and outbound customer messages.
          </p>
        </div>

        {!isViewer && (
          <button
            onClick={() => {
              setWhatsAppTargetAppt(null);
              setComposerOpen(true);
            }}
            className="el-btn-primary h-9 px-4 text-xs flex items-center gap-2 self-start sm:self-auto shadow-sm"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Compose WhatsApp
          </button>
        )}
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="el-card p-4 bg-white border border-[#e7e5e4] shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#25d366]/10 text-[#128c7e] flex items-center justify-center font-bold text-lg">
            📱
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#777169]">
              WhatsApp Bookings
            </div>
            <div className="text-xl font-bold text-[#0c0a09]">{appointmentsTotal}</div>
          </div>
        </div>

        <div className="el-card p-4 bg-white border border-[#e7e5e4] shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
            💬
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#777169]">
              Messages Dispatched
            </div>
            <div className="text-xl font-bold text-[#0c0a09]">{followUpsTotal}</div>
          </div>
        </div>

        <div className="el-card p-4 bg-white border border-[#e7e5e4] shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center font-bold text-lg">
            📅
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#777169]">
              Active Schedules
            </div>
            <div className="text-xl font-bold text-[#0c0a09]">
              {appointments.filter((a) => a.status === 'CONFIRMED' || a.status === 'SCHEDULED').length}
            </div>
          </div>
        </div>

        <div className="el-card p-4 bg-white border border-[#e7e5e4] shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
            ⚡
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#777169]">
              Integration Status
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
              <span className="text-xs font-semibold text-[#0c0a09]">Active & Secure</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-[#e7e5e4] gap-6">
        <button
          onClick={() => setActiveTab('bookings')}
          className={`pb-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'bookings'
              ? 'border-[#0c0a09] text-[#0c0a09]'
              : 'border-transparent text-[#777169] hover:text-[#0c0a09]'
          }`}
        >
          <span>WhatsApp Bookings</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#f0efed] text-[#0c0a09] font-mono">
            {appointmentsTotal}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('messages')}
          className={`pb-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'messages'
              ? 'border-[#0c0a09] text-[#0c0a09]'
              : 'border-transparent text-[#777169] hover:text-[#0c0a09]'
          }`}
        >
          <span>Dispatched Messages</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#f0efed] text-[#0c0a09] font-mono">
            {followUpsTotal}
          </span>
        </button>
      </div>

      {/* TAB 1: WHATSAPP BOOKINGS */}
      {activeTab === 'bookings' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="el-card p-4 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border border-[#e7e5e4]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px]">
                <input
                  type="text"
                  placeholder="Search customer, phone, or ID..."
                  value={apptSearchQuery}
                  onChange={(e) => setApptSearchQuery(e.target.value)}
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09]"
                />
                <svg
                  className="w-4 h-4 text-[#a8a29e] absolute left-3 top-2.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#777169] uppercase tracking-wider">Status:</span>
                <select
                  value={apptStatusFilter}
                  onChange={(e) => {
                    setApptStatusFilter(e.target.value);
                    setAppointmentsPage(0);
                  }}
                  className="bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SCHEDULED">Scheduled / Confirmed</option>
                  <option value="REQUESTED">Requested</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#777169]">
              <span className="w-2 h-2 rounded-full bg-[#25d366]" />
              <span>Booked via WhatsApp Integration</span>
            </div>
          </div>

          {/* Bookings Table */}
          {loadingAppts ? (
            <TableSkeleton rows={6} cols={7} />
          ) : filteredAppointments.length === 0 ? (
            <EmptyState
              title="No WhatsApp bookings found"
              description="Appointments booked by users through the WhatsApp chatbot or webhook integration will appear here automatically."
            />
          ) : (
            <div className="el-card bg-white overflow-hidden border border-[#e7e5e4] shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#f0efed] text-left">
                  <thead className="bg-[#fafafa] text-[#777169] text-[10px] font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Ref #</th>
                      <th className="px-6 py-3.5">Customer</th>
                      <th className="px-6 py-3.5">Phone</th>
                      <th className="px-6 py-3.5">Service / Reason</th>
                      <th className="px-6 py-3.5">Scheduled Date & Time</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0efed] text-xs">
                    {filteredAppointments.map((appt) => (
                      <tr key={appt.id} className="hover:bg-[#fafafa] transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap font-mono text-xs font-semibold text-[#0c0a09]">
                          {appt.appointmentNumber || appt.id.slice(0, 8)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-[#0c0a09]">
                          {appt.customerName || 'WhatsApp Customer'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-mono text-[11px] text-[#4e4e4e]">
                          {appt.customerPhone}
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          <span className="text-xs text-[#0c0a09] font-medium block truncate">
                            {appt.title || appt.notes || 'General Consultation'}
                          </span>
                          {appt.resourceName && (
                            <span className="text-[10px] text-[#777169] block">
                              with {appt.resourceName}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-[#0c0a09]">
                          <div className="font-medium">
                            {appt.bookingDate}
                          </div>
                          <div className="text-[11px] text-[#777169]">
                            {appt.bookingTime}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getApptStatusBadge(appt.status)}`}>
                            {appt.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedAppointment(appt);
                                setDrawerOpen(true);
                              }}
                              className="el-btn-outline h-7 px-2.5 text-[11px] bg-white text-[#0c0a09]"
                            >
                              Details
                            </button>
                            {!isViewer && (
                              <button
                                onClick={() => {
                                  setWhatsAppTargetAppt(appt);
                                  setComposerOpen(true);
                                }}
                                className="h-7 px-2.5 text-[11px] bg-[#25d366]/10 text-[#128c7e] hover:bg-[#25d366]/20 font-medium rounded-lg border border-[#25d366]/30 transition-colors"
                              >
                                WhatsApp
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bookings Pagination */}
              {apptTotalPages > 1 && (
                <div className="px-6 py-3 bg-[#fafafa] border-t border-[#f0efed] flex items-center justify-between text-xs text-[#777169]">
                  <span>
                    Showing {appointmentsPage * limit + 1} to {Math.min((appointmentsPage + 1) * limit, appointmentsTotal)} of {appointmentsTotal} WhatsApp bookings
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAppointmentsPage((p) => Math.max(0, p - 1))}
                      disabled={appointmentsPage === 0}
                      className="el-btn-outline h-7 px-3 text-xs bg-white disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-medium text-[#0c0a09]">
                      Page {appointmentsPage + 1} of {apptTotalPages}
                    </span>
                    <button
                      onClick={() => setAppointmentsPage((p) => Math.min(apptTotalPages - 1, p + 1))}
                      disabled={appointmentsPage >= apptTotalPages - 1}
                      className="el-btn-outline h-7 px-3 text-xs bg-white disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DISPATCHED MESSAGES */}
      {activeTab === 'messages' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="el-card p-4 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border border-[#e7e5e4]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#777169] uppercase tracking-wider">Status:</span>
              <select
                value={msgStatusFilter}
                onChange={(e) => {
                  setMsgStatusFilter(e.target.value);
                  setFollowUpsPage(0);
                }}
                className="bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
              >
                <option value="ALL">All Follow-ups</option>
                <option value="DELIVERED">Delivered</option>
                <option value="SENT">Sent</option>
                <option value="PENDING">Pending</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#777169]">
              <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
              <span>Direct WhatsApp Dispatcher Connected</span>
            </div>
          </div>

          {/* Follow-ups Table */}
          {loadingFollowUps ? (
            <TableSkeleton rows={6} cols={6} />
          ) : followUps.length === 0 ? (
            <EmptyState
              title="No follow-ups recorded yet"
              description="WhatsApp follow-ups and appointment booking confirmations dispatched to customers will appear here."
              action={
                !isViewer ? (
                  <button
                    onClick={() => {
                      setWhatsAppTargetAppt(null);
                      setComposerOpen(true);
                    }}
                    className="el-btn-primary h-9 px-5 text-xs mt-2"
                  >
                    Send First Follow-up
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="el-card bg-white overflow-hidden border border-[#e7e5e4] shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#f0efed] text-left">
                  <thead className="bg-[#fafafa] text-[#777169] text-[10px] font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Recipient</th>
                      <th className="px-6 py-3.5">Phone</th>
                      <th className="px-6 py-3.5">Channel / Provider</th>
                      <th className="px-6 py-3.5">Message Content</th>
                      <th className="px-6 py-3.5">Related Context</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Sent Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0efed] text-xs">
                    {followUps.map((item) => (
                      <tr key={item.id} className="hover:bg-[#fafafa] transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-[#0c0a09]">
                          {item.customerName || 'Customer'}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap font-mono text-[11px] text-[#4e4e4e]">
                          {item.customerPhone}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#15803d]" />
                            <span className="font-semibold text-[#0c0a09]">{item.channel}</span>
                            {item.isDemo && (
                              <span className="text-[9px] font-bold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded uppercase">
                                DEMO
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4 max-w-xs">
                          <p className="text-xs text-[#4e4e4e] truncate leading-relaxed" title={item.messageText}>
                            {item.messageText}
                          </p>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.appointment ? (
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-[#f0efed] rounded text-[#0c0a09]">
                              {item.appointment.appointmentNumber || 'Appointment'}
                            </span>
                          ) : item.lead ? (
                            <span className="text-[11px] font-medium text-[#2563eb] bg-[#dbeafe] px-2 py-0.5 rounded-full">
                              Lead Callback
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#777169]">-</span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getMsgStatusBadge(item.status)}`}>
                            {item.status}
                          </span>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right text-[11px] text-[#777169]">
                          {formatDateTimeDDMMYYYY(item.sentAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Follow-ups Pagination */}
              {msgTotalPages > 1 && (
                <div className="px-6 py-3 bg-[#fafafa] border-t border-[#f0efed] flex items-center justify-between text-xs text-[#777169]">
                  <span>
                    Showing {followUpsPage * limit + 1} to {Math.min((followUpsPage + 1) * limit, followUpsTotal)} of {followUpsTotal} follow-ups
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFollowUpsPage((p) => Math.max(0, p - 1))}
                      disabled={followUpsPage === 0}
                      className="el-btn-outline h-7 px-3 text-xs bg-white disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-medium text-[#0c0a09]">
                      Page {followUpsPage + 1} of {msgTotalPages}
                    </span>
                    <button
                      onClick={() => setFollowUpsPage((p) => Math.min(msgTotalPages - 1, p + 1))}
                      disabled={followUpsPage >= msgTotalPages - 1}
                      className="el-btn-outline h-7 px-3 text-xs bg-white disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Appointment Details Drawer */}
      <AppointmentDetailsDrawer
        appointment={selectedAppointment}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedAppointment(null);
        }}
        onUpdated={() => {
          loadAppointments();
        }}
        onOpenWhatsApp={(appt) => {
          setDrawerOpen(false);
          setWhatsAppTargetAppt(appt);
          setComposerOpen(true);
        }}
        isReadOnly={isViewer}
      />

      {/* WhatsApp Composer Modal */}
      <WhatsAppComposer
        isOpen={composerOpen}
        initialAppointment={whatsAppTargetAppt}
        onClose={() => {
          setComposerOpen(false);
          setWhatsAppTargetAppt(null);
        }}
        onSuccess={() => {
          loadFollowUps();
          loadAppointments();
        }}
      />
    </div>
  );
}
