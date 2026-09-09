import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import type { FollowUpItem } from '../../types';
import { TableSkeleton } from '../../components/client/LoadingSkeleton';
import { EmptyState } from '../../components/client/EmptyState';
import { WhatsAppComposer } from '../../components/client/WhatsAppComposer';

export function ClientFollowUps() {
  const { isViewer } = useOutletContext<{ isViewer: boolean }>();
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 15;

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);

  const loadFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getClientFollowUps({
        limit,
        offset: page * limit,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      setFollowUps(res.followUps || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load follow-ups:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadFollowUps();

    const handleRefresh = () => loadFollowUps();
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefresh);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefresh);
    };
  }, [loadFollowUps]);

  const getStatusBadge = (status: FollowUpItem['status']) => {
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

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">
            WhatsApp & Customer Follow-ups
          </h1>
          <p className="text-xs text-[#777169] mt-0.5">
            Automated notifications, appointment reminders, and manual outreach dispatched via WhatsApp.
          </p>
        </div>

        {!isViewer && (
          <button
            onClick={() => setComposerOpen(true)}
            className="el-btn-primary h-9 px-4 text-xs flex items-center gap-2 self-start sm:self-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Compose WhatsApp
          </button>
        )}
      </div>

      {/* Filter / Status Bar */}
      <div className="el-card p-4 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#777169] uppercase tracking-wider">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
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
          <span>Demo WhatsApp Simulator Connected</span>
        </div>
      </div>

      {/* Follow-ups Table */}
      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : followUps.length === 0 ? (
        <EmptyState
          title="No follow-ups recorded yet"
          description="WhatsApp follow-ups and appointment booking confirmations dispatched to customers will appear here."
          action={
            !isViewer ? (
              <button
                onClick={() => setComposerOpen(true)}
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right text-[11px] text-[#777169]">
                      {new Date(item.sentAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
                Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} follow-ups
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

      {/* WhatsApp Composer Modal */}
      <WhatsAppComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSuccess={loadFollowUps}
      />
    </div>
  );
}
