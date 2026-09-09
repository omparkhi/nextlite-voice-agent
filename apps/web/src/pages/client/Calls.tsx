import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import type { CallSession } from '../../types';
import { TableSkeleton } from '../../components/client/LoadingSkeleton';
import { EmptyState } from '../../components/client/EmptyState';
import { CallDetailsDrawer } from '../../components/client/CallDetailsDrawer';
import { WhatsAppComposer } from '../../components/client/WhatsAppComposer';

export function ClientCalls() {
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 15;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [directionFilter, setDirectionFilter] = useState<string>('ALL');

  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<CallSession | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [whatsAppTargetCall, setWhatsAppTargetCall] = useState<CallSession | null>(null);

  const loadCalls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getClientCalls({
        limit,
        offset: page * limit,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      setCalls(res.calls || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load call sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadCalls();

    const handleRefresh = () => loadCalls();
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefresh);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefresh);
    };
  }, [loadCalls]);

  const handleRowClick = async (call: CallSession) => {
    setSelectedCall(call);
    setDrawerOpen(true);
    // Fetch full details if needed
    try {
      const full = await api.getClientCall(call.id);
      setSelectedCall(full);
    } catch (err) {
      console.error('Failed to fetch full call details:', err);
    }
  };

  const handleOpenWhatsApp = (call: CallSession) => {
    setWhatsAppTargetCall(call);
    setComposerOpen(true);
  };

  const filteredCalls = calls.filter((c) => {
    if (directionFilter !== 'ALL' && c.direction !== directionFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const phoneMatch = c.callerNumber?.toLowerCase().includes(q);
      const agentMatch = c.agent?.name.toLowerCase().includes(q);
      const idMatch = c.id.toLowerCase().includes(q);
      return phoneMatch || agentMatch || idMatch;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]';
      case 'ACTIVE':
        return 'bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]';
      case 'MISSED':
        return 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]';
      case 'FAILED':
      default:
        return 'bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]';
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">
            Voice Calls CRM
          </h1>
          <p className="text-xs text-[#777169] mt-0.5">
            Complete logs of incoming phone inquiries, web audio sessions, transcripts, and AI execution.
          </p>
        </div>

        <span className="el-badge text-[11px] self-start sm:self-auto">
          {total} Total Conversations
        </span>
      </div>

      {/* Filters Bar */}
      <div className="el-card p-4 bg-white flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#777169]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by caller phone number, agent name, or call ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl pl-10 pr-4 py-2 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09]"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="ACTIVE">Active</option>
            <option value="MISSED">Missed</option>
            <option value="FAILED">Failed</option>
          </select>

          {/* Direction Filter */}
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
          >
            <option value="ALL">All Directions</option>
            <option value="INBOUND">Inbound Phone</option>
            <option value="OUTBOUND">Outbound Phone</option>
            <option value="WEB_TEST">Web Audio Test</option>
          </select>
        </div>
      </div>

      {/* Calls Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : filteredCalls.length === 0 ? (
        <EmptyState
          title="No voice conversations found"
          description={searchQuery ? 'No calls matched your filter criteria. Try resetting search.' : 'Voice conversations handled by your AI assistant will appear here automatically.'}
        />
      ) : (
        <div className="el-card bg-white overflow-hidden border border-[#e7e5e4] shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#f0efed] text-left">
              <thead className="bg-[#fafafa] text-[#777169] text-[10px] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Caller / Number</th>
                  <th className="px-6 py-3.5">Assigned Agent</th>
                  <th className="px-6 py-3.5">Direction</th>
                  <th className="px-6 py-3.5">Language</th>
                  <th className="px-6 py-3.5">Duration</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Date & Time</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0efed] text-xs">
                {filteredCalls.map((call) => (
                  <tr
                    key={call.id}
                    onClick={() => handleRowClick(call)}
                    className="hover:bg-[#fafafa] cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-[#0c0a09]">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                        <span>{call.callerNumber || 'Anonymous Caller'}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#4e4e4e]">
                      {call.agent?.name || 'Voice Assistant'}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#f0efed] text-[#4e4e4e]">
                        {call.direction}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#777169]">
                      {call.primaryLanguage || 'en-IN'}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap font-medium text-[#0c0a09]">
                      {formatDuration(call.durationSeconds)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getStatusBadge(call.status)}`}>
                        {call.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#777169] text-[11px]">
                      {new Date(call.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRowClick(call)}
                          className="el-btn-outline h-7 px-2.5 text-[11px] bg-white group-hover:border-[#0c0a09]"
                        >
                          Transcript
                        </button>
                        <button
                          onClick={() => handleOpenWhatsApp(call)}
                          className="el-btn-outline h-7 px-2 text-[11px] bg-white text-[#15803d] hover:bg-[#f0fdf4]"
                          title="Send WhatsApp Follow-up"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
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
                Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} calls
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

      {/* Drawer Inspector */}
      <CallDetailsDrawer
        call={selectedCall}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenWhatsApp={handleOpenWhatsApp}
      />

      {/* WhatsApp Composer */}
      <WhatsAppComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialCall={whatsAppTargetCall}
        initialPhone={whatsAppTargetCall?.callerNumber || ''}
      />
    </div>
  );
}
