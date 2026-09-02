import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { AgentTemplate } from '../../types';

const industryColors: Record<string, string> = {
  Healthcare: '#e0f2fe',
  Finance: '#f3e8ff',
  Education: '#dbeafe',
  'Real Estate': '#ffedd5',
  Automobile: '#ffe4e6',
};

const industryTextColors: Record<string, string> = {
  Healthcare: '#0369a1',
  Finance: '#6b21a8',
  Education: '#1d4ed8',
  'Real Estate': '#c2410c',
  Automobile: '#be123c',
};

export function AgentBuilder() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [agentName, setAgentName] = useState('');
  const [creating, setCreating] = useState(false);
  const [filterIndustry, setFilterIndustry] = useState<string>('All');

  useEffect(() => {
    if (!clientId) return;
    api.getTemplates().then((data) => {
      setTemplates(data);
      setLoading(false);
    });
  }, [clientId]);

  const industries = Array.from(new Set(templates.map((t) => t.industry)));

  const filtered = filterIndustry === 'All'
    ? templates
    : templates.filter((t) => t.industry === filterIndustry);

  const handleSelect = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setAgentName(template.defaultConfiguration?.identity?.agentName || template.name);
  };

  const handleCreate = async () => {
    if (!clientId || !selectedTemplate || !agentName.trim()) return;
    setCreating(true);
    try {
      const agent = await api.createAgent(clientId, {
        name: agentName.trim(),
        templateId: selectedTemplate.id,
      });
      navigate(`/admin/clients/${clientId}/agents/${agent.id}`);
    } catch {
      setCreating(false);
    }
  };

  const industryBadgeColor = (industry: string) => industryColors[industry] || '#f3f4f6';
  const industryTextColor = (industry: string) => industryTextColors[industry] || '#374151';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-xs">
        Loading templates...
      </div>
    );
  }

  const config = selectedTemplate?.defaultConfiguration;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 bg-white text-gray-900 min-h-screen">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate(`/admin/clients/${clientId}/agents`)}
          className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          Create New Agent
        </h1>
      </div>

      {!selectedTemplate ? (
        <>
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
            <button
              onClick={() => setFilterIndustry('All')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filterIndustry === 'All'
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {industries.map((ind) => (
              <button
                key={ind}
                onClick={() => setFilterIndustry(ind)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  filterIndustry === ind
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {ind}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                className="bg-white text-left p-6 rounded-2xl border border-gray-200 shadow-2xs hover:border-gray-400 hover:shadow-md transition-all flex flex-col gap-3 cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: industryBadgeColor(template.industry), color: industryTextColor(template.industry) }}
                  >
                    {template.industry?.charAt(0) || 'A'}
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-black transition-colors">
                    {template.name}
                  </h3>
                </div>
                <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                  {template.description}
                </p>
                <span
                  className="self-start px-3 py-1 rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: industryBadgeColor(template.industry), color: industryTextColor(template.industry) }}
                >
                  {template.industry}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                  style={{ backgroundColor: industryBadgeColor(selectedTemplate.industry), color: industryTextColor(selectedTemplate.industry) }}
                >
                  {selectedTemplate.industry?.charAt(0) || 'A'}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedTemplate.name}
                  </h2>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: industryBadgeColor(selectedTemplate.industry), color: industryTextColor(selectedTemplate.industry) }}
                  >
                    {selectedTemplate.industry}
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                {selectedTemplate.description}
              </p>

              <div className="pt-2">
                <label className="block mb-1.5 text-xs font-semibold text-gray-700">
                  Agent Display Name
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:bg-white"
                  placeholder="e.g. Rahul - Admission Counselor"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setSelectedTemplate(null);
                    setAgentName('');
                  }}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200"
                >
                  Back
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!agentName.trim() || creating}
                  className="flex-1 px-4 py-2 rounded-full text-xs font-semibold bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {creating ? 'Creating...' : 'Create Agent'}
                </button>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs space-y-4">
              <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
                Template Configuration Preview
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-400 font-medium block">Default Persona</span>
                  <span className="text-gray-900 font-semibold">{config?.persona?.role || config?.identity?.name || 'Counselor'}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-medium block">Default Voice</span>
                  <span className="text-gray-900 font-semibold">{config?.voice?.voiceId || 'shubh'} ({config?.voice?.gender || 'male'})</span>
                </div>
                <div>
                  <span className="text-gray-400 font-medium block">Primary Language</span>
                  <span className="text-gray-900 font-semibold">{config?.language?.primary || 'hi-IN'}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-medium block">Primary Objective</span>
                  <span className="text-gray-900 font-semibold">{config?.objective?.primaryObjective || 'Assist callers'}</span>
                </div>
              </div>

              {config?.identity?.greeting && (
                <div className="pt-2 text-xs">
                  <span className="text-gray-400 font-medium block mb-1">Configured Initial Greeting</span>
                  <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 font-mono italic">
                    "{config.identity.greeting}"
                  </div>
                </div>
              )}

              {config?.conversation?.phases && config.conversation.phases.length > 0 && (
                <div className="pt-2 text-xs space-y-2">
                  <span className="text-gray-400 font-medium block">Conversation Phases ({config.conversation.phases.length})</span>
                  <div className="space-y-1.5">
                    {config.conversation.phases.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                        <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-700 text-[10px] flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-gray-900 font-semibold">{p.name}</span>
                        {p.objective && <span className="text-gray-500 text-[11px] truncate ml-auto">{p.objective}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
