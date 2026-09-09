import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { Agent, AgentConfiguration, AgentVersion, AgentChecklistResult } from '../../types';
import KnowledgeManager from './KnowledgeManager';
import TestConversation from './TestConversation';
import WebVoiceTest from '../../components/WebVoiceTest';
import PhoneCallTest from '../../components/PhoneCallTest';
import { PhaseBuilder } from '../../components/agent-builder/PhaseBuilder';
import { GuardrailsEditor } from '../../components/agent-builder/GuardrailsEditor';
import { VariablesManager } from '../../components/agent-builder/VariablesManager';
import { SettingsEditor } from '../../components/agent-builder/SettingsEditor';
import { PromptPreviewModal } from '../../components/agent-builder/PromptPreviewModal';
import { ChecklistPanel } from '../../components/agent-builder/ChecklistPanel';
import { ToolsManager } from '../../components/agent-builder/ToolsManager';

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST, +05:30)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern Time, UTC-5 / UTC-4)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time, UTC-6 / UTC-5)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time, UTC-7 / UTC-6)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific Time, UTC-8 / UTC-7)' },
  { value: 'Europe/London', label: 'Europe/London (GMT / BST, UTC+0 / UTC+1)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET / CEST, UTC+1 / UTC+2)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET / CEST, UTC+1 / UTC+2)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST, UTC+4)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT, UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST, UTC+9)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST / AEDT, UTC+10 / UTC+11)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
];

const defaultConfiguration: AgentConfiguration = {
  identity: { agentName: 'Assistant', greeting: 'Hello! How can I help you today?', businessName: '' },
  persona: { role: 'AI Assistant', personality: 'Helpful and efficient', tone: 'warm', style: 'concise', formality: 'mixed' },
  objective: { primaryObjective: 'Assist caller queries efficiently.' },
  speakingStyle: { maxSentences: 2, oneQuestionAtATime: true, conciseResponses: true },
  businessInformation: { businessName: '', businessType: 'General', description: '' },
  conversation: { phases: [] },
  guardrails: { prohibitedTopics: [], escalationRules: [], fallbackBehavior: '' },
  language: { primary: 'en-IN', supported: ['en-IN'] },
  voice: { voiceId: 'shubh', provider: 'sarvam', gender: 'male' },
  runtimeSettings: {
    modelTemperature: 0.7,
    allowCallerInterruptions: true,
    nudges: { enabled: true, delaySeconds: 7, messages: ['Are you there?'], maxUnansweredNudges: 2 },
    maxCallLengthSeconds: 300,
  },
  variables: { input: [], output: [] },
  knowledge: { enabled: true, retrievalConfig: { topK: 3 } },
  tools: { enabled: false, bindings: [] },
  systemInstructions: '',
};

type WorkspaceTab = 'instructions' | 'phases' | 'guardrails' | 'variables' | 'tools' | 'settings' | 'knowledge' | 'tests';

export function AgentDetail() {
  const { clientId, agentId } = useParams<{ clientId: string; agentId: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [configuration, setConfiguration] = useState<AgentConfiguration>(defaultConfiguration);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('instructions');
  const [testMode, setTestMode] = useState<'chat' | 'web_voice' | 'phone'>('chat');
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [checklist, setChecklist] = useState<AgentChecklistResult | null>(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  useEffect(() => {
    if (!clientId || !agentId) return;
    const loadAgentData = async () => {
      setLoading(true);
      try {
        const data = await api.getAgent(clientId, agentId);
        setAgent(data);
        if (data?.versions?.length) {
          setVersions(data.versions);
          const latest = data.versions[0];
          if (latest?.configuration) {
            setConfiguration({
              ...defaultConfiguration,
              ...latest.configuration,
              identity: { ...defaultConfiguration.identity, ...latest.configuration.identity },
              persona: { ...defaultConfiguration.persona, ...latest.configuration.persona },
              objective: { ...defaultConfiguration.objective, ...latest.configuration.objective },
              speakingStyle: { ...defaultConfiguration.speakingStyle, ...latest.configuration.speakingStyle },
              businessInformation: { ...defaultConfiguration.businessInformation, ...latest.configuration.businessInformation },
              conversation: { phases: latest.configuration.conversation?.phases || [] },
              guardrails: { ...defaultConfiguration.guardrails, ...latest.configuration.guardrails },
              language: { ...defaultConfiguration.language, ...latest.configuration.language },
              voice: { ...defaultConfiguration.voice, ...latest.configuration.voice },
              runtimeSettings: { ...defaultConfiguration.runtimeSettings, ...latest.configuration.runtimeSettings },
              variables: { input: latest.configuration.variables?.input || [], output: latest.configuration.variables?.output || [] },
              knowledge: { enabled: true, retrievalConfig: { topK: 3 }, ...latest.configuration.knowledge },
              tools: { enabled: latest.configuration.tools?.enabled ?? false, bindings: latest.configuration.tools?.bindings || [] },
              systemInstructions: latest.configuration.systemInstructions || '',
            });
          }
        }
        const cl = await api.getChecklist(clientId, agentId).catch(() => null);
        if (cl) setChecklist(cl);
      } catch {
      } finally {
        setLoading(false);
      }
    };
    loadAgentData();
  }, [clientId, agentId]);

  const handleConfigChange = (updatedConfig: Partial<AgentConfiguration>) => {
    setConfiguration((prev) => ({ ...prev, ...updatedConfig }));
    setSaveStatus('unsaved');
  };

  const handleSaveDraft = async () => {
    if (!clientId || !agentId) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      await api.saveAgentConfig(clientId, agentId, configuration, 'Saved from Agent Builder Workspace');
      const updatedAgent = await api.getAgent(clientId, agentId);
      setAgent(updatedAgent);
      if (updatedAgent?.versions) setVersions(updatedAgent.versions);
      const cl = await api.getChecklist(clientId, agentId).catch(() => null);
      if (cl) setChecklist(cl);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('unsaved');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!clientId || !agentId) return;
    setPublishing(true);
    setPublishMessage(null);
    try {
      if (saveStatus === 'unsaved') {
        await handleSaveDraft();
      }
      const res = await api.publishAgent(clientId, agentId);
      setAgent(res.agent);
      setChecklist(res.checklist);
      setPublishMessage('✓ Agent published to LIVE production successfully!');
      setTimeout(() => setPublishMessage(null), 4000);
    } catch (err: any) {
      setPublishMessage(err.message || 'Failed to publish agent');
    } finally {
      setPublishing(false);
    }
  };

  const handleProposeConfig = async (userMessage: string) => {
    if (!clientId || !agentId) return;
    setProposing(true);
    try {
      const proposal = await api.proposeConfig(clientId, agentId, userMessage);
      if (proposal?.proposedConfig) {
        await api.approveConfigProposal(clientId, agentId, proposal.id);
        const updatedAgent = await api.getAgent(clientId, agentId);
        setAgent(updatedAgent);
        if (updatedAgent?.versions?.length) {
          setVersions(updatedAgent.versions);
          setConfiguration(updatedAgent.versions[0].configuration);
        }
        const cl = await api.getChecklist(clientId, agentId).catch(() => null);
        if (cl) setChecklist(cl);
        setSaveStatus('saved');
      }
    } catch {
    } finally {
      setProposing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-500 text-xs font-medium">
        Loading Agent Workspace...
      </div>
    );
  }

  const isLive = agent?.status === 'LIVE';

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 overflow-hidden font-sans">
      {/* TOP HEADER BAR (Sarvam Light Theme) */}
      <header className="h-14 border-b border-gray-200 bg-white px-6 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/admin/clients/${clientId}/agents`)}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold flex items-center justify-center transition-colors"
            title="Back to Agents"
          >
            ‹
          </button>

          <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 font-bold flex items-center justify-center text-sm border border-rose-200">
            {agent?.template?.industry?.charAt(0) || 'A'}
          </div>

          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-base text-gray-900">
              {agent?.name || configuration.identity?.agentName}
            </h1>

            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium border border-gray-200">
              <span>v{versions.length || 1}</span>
              <span>·</span>
              <span className={isLive ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                {isLive ? 'LIVE' : 'Draft'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Save Status Indicator */}
          <span className="text-xs text-gray-500 font-medium">
            {saveStatus === 'saving' ? (
              <span className="text-amber-600 font-semibold animate-pulse">Saving...</span>
            ) : saveStatus === 'unsaved' ? (
              <span className="text-amber-600 font-semibold">● Unsaved changes</span>
            ) : (
              <span className="text-emerald-600 font-semibold">✓ Saved</span>
            )}
          </span>

          <button
            type="button"
            onClick={() => setShowPromptPreview(true)}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 transition-colors flex items-center gap-1"
          >
            <span>🔍 Prompt Preview</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTestModal(true)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold bg-black hover:bg-gray-800 text-white transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <span>📞 Test agent</span>
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || !(checklist?.canPublish ?? false)}
            className="px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40 transition-colors shadow-2xs"
          >
            {publishing ? 'Publishing...' : 'Publish Agent'}
          </button>
        </div>
      </header>

      {publishMessage && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs px-4 py-2 text-center font-medium">
          {publishMessage}
        </div>
      )}

      {/* THREE-ZONE WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT NAVIGATION (Sarvam Light Theme Sidebar) */}
        <aside className="w-56 border-r border-gray-200 bg-[#fcfcfc] p-3 space-y-1 shrink-0 text-xs">
          <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">WORKSPACE</div>

          <button
            type="button"
            onClick={() => setActiveTab('instructions')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-left font-medium transition-all ${
              activeTab === 'instructions' ? 'bg-gray-200/80 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">T</span>
              <span>Instructions</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('phases')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-left font-medium transition-all ${
              activeTab === 'phases' ? 'bg-gray-200/80 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>🔄</span>
              <span>Phases</span>
            </div>
            <span className="text-[11px] text-gray-400 font-mono">{configuration.conversation?.phases?.length || 0}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guardrails')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-left font-medium transition-all ${
              activeTab === 'guardrails' ? 'bg-gray-200/80 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>🛡</span>
              <span>Guardrails</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('variables')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-left font-medium transition-all ${
              activeTab === 'variables' ? 'bg-gray-200/80 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-gray-700">{`{ }`}</span>
              <span>Variables</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-left font-medium transition-all ${
              activeTab === 'tools' ? 'bg-gray-200/80 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>🛠</span>
              <span>Tools</span>
            </div>
            <span className="text-[11px] text-gray-400 font-mono">
              {(configuration.tools?.bindings || []).filter((b) => b.enabled).length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('knowledge')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-left font-medium transition-all ${
              activeTab === 'knowledge' ? 'bg-gray-200/80 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>📚</span>
              <span>Knowledge</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-left font-medium transition-all ${
              activeTab === 'settings' ? 'bg-gray-200/80 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>⚙</span>
              <span>Settings</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tests')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-left font-medium transition-all ${
              activeTab === 'tests' ? 'bg-gray-200/80 text-gray-900 font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>🧪</span>
              <span>Tests</span>
            </div>
          </button>
        </aside>

        {/* CENTER CONFIGURATION EDITOR (Sarvam Light Theme Canvas) */}
        <main className="flex-1 overflow-y-auto p-8 bg-white">
          <div className="max-w-3xl space-y-8">
            {activeTab === 'instructions' && (
              <div className="space-y-6 text-xs">
                {/* Greeting Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block font-semibold text-gray-700 text-sm">Greeting</label>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 flex items-center gap-1 cursor-pointer">
                      <span>🌐</span> Translations
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={configuration.identity?.greeting || ''}
                    onChange={(e) =>
                      handleConfigChange({
                        identity: { ...configuration.identity, greeting: e.target.value },
                      })
                    }
                    placeholder="Namaste, SuccessPath Competitive Academy se bol raha hoon. Aap kis exam ki preparation ke baare mein jaanna chahenge?"
                    className="w-full bg-white border border-gray-200 rounded-xl p-3.5 text-gray-900 font-medium leading-relaxed focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 shadow-2xs"
                  />
                  <p className="text-[11px] text-gray-400">Supports variables like &#123;&#123;userName&#125;&#125;, &#123;&#123;businessName&#125;&#125;</p>
                </div>

                {/* Persona Section */}
                <div className="space-y-3 pt-2">
                  <h4 className="font-semibold text-gray-900 text-base">Persona</h4>
                  <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-600 font-medium mb-1">Agent Display Name</label>
                        <input
                          type="text"
                          value={configuration.identity?.agentName || ''}
                          onChange={(e) =>
                            handleConfigChange({
                              identity: { ...configuration.identity, agentName: e.target.value },
                            })
                          }
                          placeholder="Rahul"
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-600 font-medium mb-1">Role</label>
                        <input
                          type="text"
                          value={configuration.persona?.role || ''}
                          onChange={(e) =>
                            handleConfigChange({
                              persona: { ...configuration.persona, role: e.target.value },
                            })
                          }
                          placeholder="Receptionist and admission counseling assistant"
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-gray-600 font-medium mb-1">Tone & Speaking Style</label>
                      <input
                        type="text"
                        value={configuration.persona?.personality || ''}
                        onChange={(e) =>
                          handleConfigChange({
                            persona: { ...configuration.persona, personality: e.target.value },
                          })
                        }
                        placeholder="Warm, professional, natural, conversational, confident, and concise"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Environment & Situation */}
                <div className="space-y-3 pt-2">
                  <h4 className="font-semibold text-gray-900 text-base">Environment & Situation</h4>
                  <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-4 space-y-3">
                    <div>
                      <label className="block text-gray-600 font-medium mb-1">Situation</label>
                      <input
                        type="text"
                        value={configuration.environment?.situation || ''}
                        onChange={(e) =>
                          handleConfigChange({
                            environment: { ...configuration.environment, situation: e.target.value },
                          })
                        }
                        placeholder="Inbound phone calls from prospective students and parents enquiring about competitive exam coaching."
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Primary Objective */}
                <div className="space-y-3 pt-2">
                  <h4 className="font-semibold text-gray-900 text-base">Primary Objective</h4>
                  <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-4">
                    <input
                      type="text"
                      value={configuration.objective?.primaryObjective || ''}
                      onChange={(e) =>
                        handleConfigChange({
                          objective: { ...configuration.objective, primaryObjective: e.target.value },
                        })
                      }
                      placeholder="Understand student goals, recommend suitable coaching batch, and book demo class"
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400"
                    />
                  </div>
                </div>

                {/* Business Information */}
                <div className="space-y-3 pt-2">
                  <h4 className="font-semibold text-gray-900 text-base">Business Information</h4>
                  <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-gray-600 font-medium mb-1">Business Name</label>
                        <input
                          type="text"
                          value={configuration.businessInformation?.businessName || ''}
                          onChange={(e) =>
                            handleConfigChange({
                              businessInformation: { ...configuration.businessInformation, businessName: e.target.value },
                            })
                          }
                          placeholder="SuccessPath Competitive Academy"
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-600 font-medium mb-1">Working Hours</label>
                        <input
                          type="text"
                          value={configuration.businessInformation?.hours || ''}
                          onChange={(e) =>
                            handleConfigChange({
                              businessInformation: { ...configuration.businessInformation, hours: e.target.value },
                            })
                          }
                          placeholder="Mon-Sat 8:00 AM - 8:00 PM"
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-600 font-medium mb-1">Business Timezone</label>
                        <select
                          value={configuration.businessInformation?.timezone || 'Asia/Kolkata'}
                          onChange={(e) =>
                            handleConfigChange({
                              businessInformation: { ...configuration.businessInformation, timezone: e.target.value },
                            })
                          }
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400"
                        >
                          {TIMEZONE_OPTIONS.map((tz) => (
                            <option key={tz.value} value={tz.value}>
                              {tz.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'phases' && (
              <PhaseBuilder
                phases={configuration.conversation?.phases || []}
                onChange={(updatedPhases) =>
                  handleConfigChange({
                    conversation: { ...configuration.conversation, phases: updatedPhases },
                  })
                }
              />
            )}

            {activeTab === 'guardrails' && (
              <GuardrailsEditor
                guardrails={configuration.guardrails}
                onChange={(updatedGuardrails) => handleConfigChange({ guardrails: updatedGuardrails })}
              />
            )}

            {activeTab === 'variables' && (
              <VariablesManager
                inputVariables={configuration.variables?.input || []}
                outputVariables={configuration.variables?.output || []}
                onChangeInput={(inputs) =>
                  handleConfigChange({
                    variables: { input: inputs, output: configuration.variables?.output || [] },
                  })
                }
                onChangeOutput={(outputs) =>
                  handleConfigChange({
                    variables: { input: configuration.variables?.input || [], output: outputs },
                  })
                }
              />
            )}

            {activeTab === 'tools' && (
              <ToolsManager configuration={configuration} onChange={handleConfigChange} />
            )}

            {activeTab === 'knowledge' && clientId && agentId && (
              <KnowledgeManager clientId={clientId} agentId={agentId} />
            )}

            {activeTab === 'settings' && (
              <SettingsEditor configuration={configuration} onChange={handleConfigChange} />
            )}

            {activeTab === 'tests' && clientId && agentId && (
              <div className="space-y-6">
                <div className="flex border-b border-gray-200 gap-6 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setTestMode('chat')}
                    className={`pb-2.5 border-b-2 ${testMode === 'chat' ? 'border-black text-black' : 'border-transparent text-gray-400'}`}
                  >
                    Chat Test
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestMode('web_voice')}
                    className={`pb-2.5 border-b-2 ${testMode === 'web_voice' ? 'border-black text-black' : 'border-transparent text-gray-400'}`}
                  >
                    Browser Web Voice Test
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestMode('phone')}
                    className={`pb-2.5 border-b-2 ${testMode === 'phone' ? 'border-black text-black' : 'border-transparent text-gray-400'}`}
                  >
                    Phone Call Test
                  </button>
                </div>

                {testMode === 'chat' && <TestConversation clientId={clientId} agentId={agentId} />}
                {testMode === 'web_voice' && <WebVoiceTest clientId={clientId} agentId={agentId} />}
                {testMode === 'phone' && <PhoneCallTest clientId={clientId} agentId={agentId} />}
              </div>
            )}
          </div>
        </main>

        {/* RIGHT AI ASSISTANT & CHECKLIST PANEL */}
        <ChecklistPanel checklist={checklist} onProposeConfig={handleProposeConfig} proposing={proposing} />
      </div>

      {/* PROMPT PREVIEW MODAL */}
      {showPromptPreview && clientId && agentId && (
        <PromptPreviewModal
          clientId={clientId}
          agentId={agentId}
          configuration={configuration}
          onClose={() => setShowPromptPreview(false)}
        />
      )}

      {/* TEST AGENT MODAL */}
      {showTestModal && clientId && agentId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="font-semibold text-base text-gray-900">📞 Test Agent Environment</h3>
              <button type="button" onClick={() => setShowTestModal(false)} className="text-gray-400 hover:text-gray-900 text-lg font-bold">
                ✕
              </button>
            </div>
            <WebVoiceTest clientId={clientId} agentId={agentId} />
          </div>
        </div>
      )}
    </div>
  );
}