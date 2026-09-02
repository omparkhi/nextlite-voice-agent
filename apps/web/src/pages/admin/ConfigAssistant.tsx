import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import type { ConfigProposal } from '../../types';

interface ConfigAssistantProps {
  clientId: string;
  agentId: string;
  onConfigApplied: () => void;
}

export function ConfigAssistant({ clientId, agentId, onConfigApplied }: ConfigAssistantProps) {
  const [proposals, setProposals] = useState<ConfigProposal[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadProposals = async () => {
    try {
      const data = await api.getConfigProposals(clientId, agentId);
      setProposals(data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, [clientId, agentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [proposals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const proposal = await api.proposeConfig(clientId, agentId, message.trim());
      setProposals(prev => [proposal, ...prev]);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate proposal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (proposalId: string) => {
    setApprovingId(proposalId);
    setError(null);
    try {
      await api.approveConfigProposal(clientId, agentId, proposalId);
      setProposals(prev =>
        prev.map(p => (p.id === proposalId ? { ...p, status: 'APPROVED' as const } : p))
      );
      onConfigApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve proposal');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (proposalId: string) => {
    setRejectingId(proposalId);
    setError(null);
    try {
      await api.rejectConfigProposal(clientId, agentId, proposalId);
      setProposals(prev =>
        prev.map(p => (p.id === proposalId ? { ...p, status: 'REJECTED' as const } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject proposal');
    } finally {
      setRejectingId(null);
    }
  };

  const formatFieldName = (key: string) =>
    key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const statusBadge = (status: ConfigProposal['status']) => {
    const styles = {
      PENDING: 'bg-amber-50 text-amber-700 border border-amber-200',
      APPROVED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      REJECTED: 'bg-red-50 text-red-700 border border-red-200',
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <div className="text-[#777169] text-sm">Loading proposals...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      <header className="border-b border-[#e7e5e4] bg-white">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-display-serif text-[#0c0a09]">Config Assistant</h1>
          <p className="text-xs text-[#777169] mt-1">Describe changes in natural language and review proposed diffs before applying</p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="el-card p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <label className="block text-xs font-medium text-[#57534e] uppercase tracking-wider mb-2">
              What would you like to change?
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Change the greeting to be more friendly and set voice to priya"
                className="flex-1 px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#a8a29e] focus:border-transparent"
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={!message.trim() || submitting}
                className="el-btn-primary px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Generating...' : 'Propose'}
              </button>
            </div>
          </form>
          {error && (
            <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {proposals.length === 0 && (
            <div className="el-card p-12 text-center text-[#777169] text-sm">
              No proposals yet. Describe a configuration change above to get started.
            </div>
          )}

          {proposals.map((proposal) => (
            <div key={proposal.id} className="el-card overflow-hidden">
              <div className="p-5 border-b border-[#e7e5e4] bg-[#fafaf9]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#0c0a09] font-medium">{proposal.userMessage}</p>
                    <p className="text-xs text-[#777169] mt-1">
                      {new Date(proposal.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  {statusBadge(proposal.status)}
                </div>
              </div>

              <div className="p-5">
                <h4 className="text-xs font-medium text-[#57534e] uppercase tracking-wider mb-3">
                  Proposed Changes
                </h4>
                <div className="space-y-3">
                  {Object.entries(proposal.diff).map(([field, change]) => (
                    <div key={field} className="rounded-xl border border-[#e7e5e4] overflow-hidden">
                      <div className="px-4 py-2 bg-[#fafaf9] border-b border-[#e7e5e4]">
                        <span className="text-xs font-medium text-[#0c0a09]">
                          {formatFieldName(field)}
                        </span>
                      </div>
                      <div className="p-3 space-y-2">
                        {change.old !== undefined && (
                          <div className="bg-red-50 border-l-2 border-red-400 pl-3 py-2 rounded-r">
                            <span className="text-[10px] font-medium text-red-600 uppercase tracking-wider block mb-1">
                              Removed
                            </span>
                            <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">
                              {formatValue(change.old)}
                            </pre>
                          </div>
                        )}
                        {change.new !== undefined && (
                          <div className="bg-emerald-50 border-l-2 border-emerald-400 pl-3 py-2 rounded-r">
                            <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider block mb-1">
                              Added
                            </span>
                            <pre className="text-xs text-emerald-700 whitespace-pre-wrap font-mono">
                              {formatValue(change.new)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {proposal.status === 'PENDING' && (
                <div className="px-5 py-4 border-t border-[#e7e5e4] bg-[#fafaf9] flex items-center gap-3">
                  <button
                    onClick={() => handleApprove(proposal.id)}
                    disabled={approvingId === proposal.id || rejectingId === proposal.id}
                    className="el-btn-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {approvingId === proposal.id ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(proposal.id)}
                    disabled={approvingId === proposal.id || rejectingId === proposal.id}
                    className="el-btn-outline px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {rejectingId === proposal.id ? 'Rejecting...' : 'Reject'}
                  </button>
                </div>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
