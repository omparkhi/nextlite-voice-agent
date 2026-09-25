import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../services/api';
import type { CallSession } from '../../types';
import { TableSkeleton } from '../../components/client/LoadingSkeleton';
import { EmptyState } from '../../components/client/EmptyState';
import { CallDetailsDrawer } from '../../components/client/CallDetailsDrawer';
import { WhatsAppComposer } from '../../components/client/WhatsAppComposer';
import { formatDateTimeDDMMYYYY } from '@/utils/dateFormatters';
import { areEntitiesEqual } from '../../utils/fastDiff';

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

  const loadCalls = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.getClientCalls({
        limit,
        offset: page * limit,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      const incoming = res.calls || [];
      const incomingTotal = res.total || 0;
      setCalls((prev) => areEntitiesEqual(prev, incoming) ? prev : incoming);
      setTotal((prev) => prev !== incomingTotal ? incomingTotal : prev);
    } catch (err) {
      console.error('Failed to load call sessions:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, statusFilter, limit]);

  useEffect(() => {
    loadCalls();

    const handleRefresh = () => loadCalls(false);
    const handleRefreshSilent = () => loadCalls(true);
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefreshSilent);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefreshSilent);
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

  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
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
  }, [calls, directionFilter, searchQuery]);

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
    <div className="space-y-5 sm:space-y-6 font-sans w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl md:text-3xl font-light text-[#0c0a09] tracking-tight leading-tight">
            Voice Calls CRM
          </h1>
          <p className="text-[11px] sm:text-xs text-[#777169] mt-0.5 leading-normal">
            Complete logs of incoming phone inquiries, web audio sessions, transcripts, and AI execution.
          </p>
        </div>

        <span className="el-badge text-[11px] self-start sm:self-auto">
          {total} Total Conversations
        </span>
      </div>

      {/* Filters Bar */}
      <div className="p-3.5 sm:p-4 bg-white border border-[#e7e5e4] rounded-2xl shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3">
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

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="flex-1 sm:flex-none bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-2.5 sm:px-3 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
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
        <div className="bg-white overflow-hidden border border-[#e7e5e4] shadow-2xs rounded-2xl">
          <div className="overflow-x-auto w-full scrollbar-thin">
            <table className="w-full min-w-[700px] divide-y divide-[#f0efed] text-left">
              <thead className="bg-[#fafafa] text-[#777169] text-[11px] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5 text-center">Caller / Number</th>
                  <th className="px-6 py-3.5 text-center">Assigned Agent</th>
                  <th className="px-6 py-3.5 text-center">Direction</th>
                  {/* <th className="px-6 py-3.5">Language</th> */}
                  <th className="px-6 py-3.5 text-center">Duration</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-center">Date & Time</th>
                  <th className="px-6 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0efed] text-xs h-10">
                {filteredCalls.map((call) => (
                  <tr
                    key={call.id}
                    onClick={() => handleRowClick(call)}
                    className="hover:bg-[#fafafa] cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-2 whitespace-nowrap font-medium text-[#0c0a09]">
                      <div className="flex items-center justify-center gap-2">
                        {/* <span className="w-2 h-2 rounded-full bg-[#16a34a]" /> */}
                        <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <span>{call.callerNumber || 'Anonymous Caller'}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#4e4e4e] text-center">
                      {call.agent?.name || 'Voice Assistant'}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#f0efed] text-[#4e4e4e]">
                        {call.direction}
                      </span>
                    </td>

                    {/* <td className="px-6 py-4 whitespace-nowrap text-[#777169]">
                      {call.primaryLanguage || 'en-IN'}
                    </td> */}

                    <td className="px-6 py-4 whitespace-nowrap font-medium text-[#0c0a09] text-center">
                      {formatDuration(call.durationSeconds)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${getStatusBadge(call.status)}`}>
                        {call.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#777169] text-[11px] text-center">
                      {formatDateTimeDDMMYYYY(call.startedAt || call.createdAt)}
                    </td>

                    <td className="px-6 py-3 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleRowClick(call)}
                          className="el-btn-outline h-7 px-2.5 text-[11px] bg-white group-hover:border-[#0c0a09]"
                        >
                          Transcript
                        </button>
                        {/* <button
                          onClick={() => handleOpenWhatsApp(call)}
                          className="el-btn-outline h-7 px-2 text-[11px] bg-white text-[#15803d] hover:bg-[#f0fdf4]"
                          title="Send WhatsApp Follow-up"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </button> */}
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
