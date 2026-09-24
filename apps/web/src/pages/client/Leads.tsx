import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import type { Lead } from '../../types';
import { TableSkeleton } from '../../components/client/LoadingSkeleton';
import { EmptyState } from '../../components/client/EmptyState';
import { LeadDetailsDrawer } from '../../components/client/LeadDetailsDrawer';

export function ClientLeads() {
  const { isViewer } = useOutletContext<{ isViewer: boolean }>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 15;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getClientLeads({
        limit,
        offset: page * limit,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      setLeads(res.leads || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadLeads();

    const handleRefresh = () => loadLeads();
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefresh);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefresh);
    };
  }, [loadLeads]);

  const handleRowClick = async (lead: Lead) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
    try {
      const full = await api.getClientLead(lead.id);
      setSelectedLead(full);
    } catch (err) {
      console.error('Failed to fetch lead details:', err);
    }
  };

  // const handleOpenWhatsApp = (lead: Lead) => {
  //   setWhatsAppTargetLead(lead);
  //   setComposerOpen(true);
  // };

  const handleLeadUpdated = (updated: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setSelectedLead(updated);
  };

  const filteredLeads = leads.filter((l) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = l.customerName.toLowerCase().includes(q);
      const phoneMatch = l.customerPhone.toLowerCase().includes(q);
      const interestMatch = l.interestCategory?.toLowerCase().includes(q);
      return nameMatch || phoneMatch || interestMatch;
    }
    return true;
  });

  const getStatusBadge = (status: Lead['status']) => {
    switch (status) {
      case 'QUALIFIED':
        return 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]';
      case 'CONTACTED':
        return 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]';
      case 'CLOSED':
        return 'bg-[#ede9fe] text-[#6d28d9] border-[#ddd6fe]';
      case 'NEW':
      default:
        return 'bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]';
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display-serif text-2xl md:text-3xl font-light text-[#0c0a09]">
            Leads & Inquiries CRM
          </h1>
          <p className="text-xs text-[#777169] mt-0.5">
            Prospective customers and callbacks autonomously captured during voice calls.
          </p>
        </div>

        <span className="el-badge text-[11px] self-start sm:self-auto">
          {total} Captured Leads
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
            placeholder="Search leads by customer name, phone number, or interest..."
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
          <option value="ALL">All Stages</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="QUALIFIED">Qualified</option>
          <option value="CLOSED">Closed / Won</option>
        </select>
      </div>

      {/* Leads Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : filteredLeads.length === 0 ? (
        <EmptyState
          title="No leads captured yet"
          description={searchQuery ? 'No leads matched your search query.' : 'Leads will automatically populate as your AI assistant collects customer contact information.'}
        />
      ) : (
        <div className="el-card bg-white overflow-hidden border border-[#e7e5e4] shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#f0efed] text-left">
              <thead className="bg-[#fafafa] text-[#777169] text-[10px] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5 text-center">Lead Customer</th>
                  <th className="px-6 py-3.5 text-center">Phone Number</th>
                  <th className="px-6 py-3.5 text-center">Interest / Category</th>
                  <th className="px-6 py-3.5 text-center">Stage</th>
                  <th className="px-6 py-3.5 text-center">Created Date</th>
                  <th className="px-6 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0efed] text-xs">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => handleRowClick(lead)}
                    className="hover:bg-[#fafafa] cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-semibold text-[#0c0a09] block">{lead.customerName}</span>
                      {lead.customerEmail && (
                        <span className="text-[11px] text-[#777169] block truncate max-w-[200px]">
                          {lead.customerEmail}
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#4e4e4e] font-mono text-[11px] text-center">
                      {lead.customerPhone}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#f0efed] text-[#0c0a09]">
                        {lead.interestCategory || 'General Inquiry'}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getStatusBadge(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#777169] text-[11px] text-center">
                      {new Date(lead.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleRowClick(lead)}
                          className="el-btn-outline h-7 px-2.5 text-[11px] bg-white group-hover:border-[#0c0a09]"
                        >
                          Manage
                        </button>
                        {/* <button
                          onClick={() => handleOpenWhatsApp(lead)}
                          className="el-btn-outline h-7 px-2.5 text-[11px] bg-white text-[#15803d] hover:bg-[#f0fdf4] flex items-center gap-1"
                          title="Send WhatsApp Follow-up"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <span>WhatsApp</span>
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
                Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} leads
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

      {/* Drawer */}
      <LeadDetailsDrawer
        lead={selectedLead}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdated={handleLeadUpdated}
        // onOpenWhatsApp={handleOpenWhatsApp}
        isReadOnly={isViewer}
      />

      {/* WhatsApp Composer */}
      {/* <WhatsAppComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialLead={whatsAppTargetLead}
        initialPhone={whatsAppTargetLead?.customerPhone || ''}
        initialCustomerName={whatsAppTargetLead?.customerName || ''}
        onSuccess={loadLeads}
      /> */}
    </div>
  );
}
