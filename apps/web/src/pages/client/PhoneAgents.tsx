import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import type { PhoneNumberItem } from '../../types';
import { TableSkeleton } from '../../components/client/LoadingSkeleton';
import { EmptyState } from '../../components/client/EmptyState';

export function ClientPhoneAgents() {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberItem[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [phonesRes, agentsRes] = await Promise.all([
        api.getClientPhoneNumbers().catch(() => ({ phoneNumbers: [] })),
        api.getClientAgents().catch(() => ({ agents: [] })),
      ]);
      setPhoneNumbers(phonesRes.phoneNumbers || []);
      setAgents(agentsRes.agents || []);
    } catch (err) {
      console.error('Failed to load phone numbers & agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleRefresh = () => loadData();
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefresh);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefresh);
    };
  }, [loadData]);

  return (
    <div className="space-y-8 font-sans animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="font-display-serif text-3xl md:text-4xl font-light text-[#0c0a09]">
          Phone Numbers & AI Agents
        </h1>
        <p className="text-xs text-[#777169] mt-1">
          Active telephony numbers, SIP trunk routing, and provisioned AI employee agents for this workspace.
        </p>
      </div>

      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : (
        <>
          {/* Assigned Phone Numbers Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display-serif text-xl font-light text-[#0c0a09]">
                  Assigned Inbound Phone Numbers
                </h3>
                <p className="text-xs text-[#777169]">Dedicated telephony lines routed to your voice agents</p>
              </div>
              <span className="el-badge text-[10px]">{phoneNumbers.length} Assigned</span>
            </div>

            {phoneNumbers.length === 0 ? (
              <EmptyState
                title="No phone numbers assigned"
                description="Assigned numbers will appear here once provisioned by your system administrator."
              />
            ) : (
              <div className="el-card bg-white overflow-hidden border border-[#e7e5e4] shadow-sm">
                <table className="min-w-full divide-y divide-[#f0efed] text-left">
                  <thead className="bg-[#fafafa] text-[#777169] text-[10px] font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Telephony Number</th>
                      <th className="px-6 py-3.5">Carrier / Provider</th>
                      <th className="px-6 py-3.5">Mapped Voice Agent</th>
                      <th className="px-6 py-3.5">Environment</th>
                      <th className="px-6 py-3.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0efed] text-xs">
                    {phoneNumbers.map((p) => (
                      <tr key={p.id} className="hover:bg-[#fafafa] transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap font-mono font-medium text-[#0c0a09] text-sm">
                          {p.phoneNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap uppercase font-semibold text-[10px] text-[#4e4e4e]">
                          {p.provider}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-[#0c0a09]">
                          {p.agent?.name || 'Default Voice Assistant'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#f0efed] text-[#4e4e4e] uppercase">
                            {p.deployment?.environment || 'TEST'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#dcfce7] text-[#15803d]">
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Provisioned Voice Agents Section */}
          <div className="space-y-4 pt-4 border-t border-[#f0efed]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display-serif text-xl font-light text-[#0c0a09]">
                  Provisioned AI Voice Agents
                </h3>
                <p className="text-xs text-[#777169]">Voice persona models, languages, and active deployments</p>
              </div>
              <span className="el-badge text-[10px]">{agents.length} Agents</span>
            </div>

            {agents.length === 0 ? (
              <EmptyState
                title="No AI agents configured yet"
                description="Your voice agents will appear here once created and deployed."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {agents.map((agent) => {
                  const config = agent.versions?.[0]?.configuration;
                  return (
                    <div key={agent.id} className="el-card p-6 bg-white flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="font-display-serif text-2xl font-light text-[#0c0a09]">
                            {agent.name}
                          </h4>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#dcfce7] text-[#15803d]">
                            {agent.status}
                          </span>
                        </div>

                        <p className="text-xs text-[#777169]">
                          Industry: <span className="font-medium text-[#0c0a09]">{agent.template?.industry || 'General'}</span>
                        </p>
                      </div>

                      <div className="p-3 bg-[#fafafa] rounded-xl border border-[#f0efed] space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#777169]">Voice Engine</span>
                          <span className="font-medium text-[#0c0a09]">
                            {config?.voice?.provider ? `${config.voice.provider} (${config.voice.voiceId})` : 'Sarvam (Shubh)'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#777169]">Primary Language</span>
                          <span className="font-medium text-[#0c0a09]">
                            {config?.language?.primary || 'en-IN (English / Hinglish)'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#777169]">LLM Model</span>
                          <span className="font-mono text-[11px] text-[#0c0a09]">
                            {config?.llmModel || 'Google Gemma-4'}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#f0efed] flex items-center justify-between text-[11px] text-[#777169]">
                        <span>Latest Version: v{agent.versions?.[0]?.versionNumber || 1}</span>
                        <span className="text-[#15803d] font-semibold">● Active in SIP</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
