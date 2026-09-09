import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import type { Appointment } from '../../types';
import { TableSkeleton } from '../../components/client/LoadingSkeleton';
import { EmptyState } from '../../components/client/EmptyState';
import { AppointmentDetailsDrawer } from '../../components/client/AppointmentDetailsDrawer';
import { WhatsAppComposer } from '../../components/client/WhatsAppComposer';

export function ClientAppointments() {
  const { isViewer } = useOutletContext<{ isViewer: boolean }>();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 15;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [loading, setLoading] = useState(true);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [whatsAppTargetAppt, setWhatsAppTargetAppt] = useState<Appointment | null>(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadAppointments();

    const handleRefresh = () => loadAppointments();
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefresh);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefresh);
    };
  }, [loadAppointments]);

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

  const filteredAppointments = appointments.filter((a) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const numMatch = a.appointmentNumber?.toLowerCase().includes(q);
      const nameMatch = a.customerName.toLowerCase().includes(q);
      const phoneMatch = a.customerPhone.toLowerCase().includes(q);
      const titleMatch = a.title.toLowerCase().includes(q);
      return numMatch || nameMatch || phoneMatch || titleMatch;
    }
    return true;
  });

  const getStatusBadge = (status: Appointment['status']) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]';
      case 'CANCELLED':
        return 'bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]';
      case 'REQUESTED':
      default:
        return 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]';
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">
            Appointments & Bookings CRM
          </h1>
          <p className="text-xs text-[#777169] mt-0.5">
            Bookings scheduled and recorded by your AI phone assistant with atomic reference numbering.
          </p>
        </div>

        <span className="el-badge text-[11px] self-start sm:self-auto">
          {total} Total Bookings
        </span>
      </div>

      {/* Filter Bar */}
      <div className="el-card p-4 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#777169]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by reference number (e.g. A-001), customer, or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl pl-10 pr-4 py-2 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
        >
          <option value="ALL">All Statuses</option>
          <option value="REQUESTED">Requested (Pending)</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Appointments Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          title="No appointments booked yet"
          description={searchQuery ? 'No appointments matched your filter criteria.' : 'Appointments booked by your AI assistant will appear here automatically with human-friendly reference IDs (A-001, A-002...).'}
        />
      ) : (
        <div className="el-card bg-white overflow-hidden border border-[#e7e5e4] shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#f0efed] text-left">
              <thead className="bg-[#fafafa] text-[#777169] text-[10px] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Ref #</th>
                  <th className="px-6 py-3.5">Customer Name</th>
                  <th className="px-6 py-3.5">Schedule Date & Time</th>
                  <th className="px-6 py-3.5">Appointment Service</th>
                  <th className="px-6 py-3.5">Staff / Resource</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0efed] text-xs">
                {filteredAppointments.map((appt) => (
                  <tr
                    key={appt.id}
                    onClick={() => handleRowClick(appt)}
                    className="hover:bg-[#fafafa] cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-[#0c0a09] px-2 py-0.5 bg-[#f0efed] rounded">
                        {appt.appointmentNumber || 'A-???'}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-[#0c0a09] block">{appt.customerName}</span>
                      <span className="font-mono text-[11px] text-[#777169]">{appt.customerPhone}</span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap font-medium text-[#0c0a09]">
                      <span>{appt.bookingDate}</span>
                      <span className="text-[#777169] text-[11px] block">{appt.bookingTime}</span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#4e4e4e]">
                      {appt.title}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#777169]">
                      {appt.resourceName || '-'}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getStatusBadge(appt.status)}`}>
                        {appt.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRowClick(appt)}
                          className="el-btn-outline h-7 px-2.5 text-[11px] bg-white group-hover:border-[#0c0a09]"
                        >
                          Manage
                        </button>
                        <button
                          onClick={() => handleOpenWhatsApp(appt)}
                          className="el-btn-outline h-7 px-2.5 text-[11px] bg-white text-[#15803d] hover:bg-[#f0fdf4] flex items-center gap-1"
                          title="Send WhatsApp Confirmation"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <span>Confirm</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
