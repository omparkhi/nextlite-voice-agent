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
                {/* Dedicated Greeting Card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">Greeting</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        The exact opening sentence spoken by the agent when the call connects.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                        Initial Call Turn
                      </span>
                    </div>
                  </div>

                  <textarea
                    rows={3}
                    value={configuration.identity?.greeting || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleConfigChange({
                        identity: { ...configuration.identity, greeting: val },
                      });
                    }}
                    placeholder="Hi, thanks for calling {serviceProviderName}! This is Aarti. How can I help you today?"
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-xl p-3.5 text-gray-900 font-medium leading-relaxed focus:bg-white focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 text-xs transition-colors"
                  />
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>Supports variable placeholders like <code className="text-gray-600 bg-gray-100 px-1 py-0.5 rounded font-mono">&#123;serviceProviderName&#125;</code>, <code className="text-gray-600 bg-gray-100 px-1 py-0.5 rounded font-mono">&#123;userName&#125;</code></span>
                    <span>{(configuration.identity?.greeting || '').length} characters</span>
                  </div>
                </div>

                {/* Powerful Long-form Instructions Editor */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">Instructions</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Detailed conversation instructions, phase guidelines, guardrails, and business rules. Supports structured markdown.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-100 text-gray-600 border border-gray-200">
                        Markdown &amp; Headings Supported
                      </span>
                    </div>
                  </div>

                  {/* Formatting quick helpers */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-gray-500">
                    <span className="text-gray-400 font-medium">Quick Insert:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const current = configuration.systemInstructions || '';
                        const heading = (current ? '\n\n' : '') + '## Phase 1: Identity\n- Greet the caller professionally\n- Confirm caller name and purpose\n';
                        handleConfigChange({
                          systemInstructions: current + heading,
                          instructions: current + heading,
                        });
                      }}
                      className="px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-medium transition-colors"
                    >
                      + Phase
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = configuration.systemInstructions || '';
                        const guardrail = (current ? '\n\n' : '') + '## Guardrails\n- Never fabricate unverified business information\n- Politely decline out-of-scope requests\n';
                        handleConfigChange({
                          systemInstructions: current + guardrail,
                          instructions: current + guardrail,
                        });
                      }}
                      className="px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-medium transition-colors"
                    >
                      + Guardrails
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = configuration.systemInstructions || '';
                        const dateRes = (current ? '\n\n' : '') + '## Date Resolution\n- Always resolve relative dates like "tomorrow" against runtime context\n- Confirm exact appointment day and time before booking\n';
                        handleConfigChange({
                          systemInstructions: current + dateRes,
                          instructions: current + dateRes,
                        });
                      }}
                      className="px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-medium transition-colors"
                    >
                      + Date Resolution
                    </button>
                  </div>

                  <textarea
                    rows={18}
                    value={configuration.systemInstructions || (configuration as any).instructions || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleConfigChange({
                        systemInstructions: val,
                        instructions: val,
                      });
                    }}
                    placeholder={`## Conversation Guidelines

## Phase 1: Identity
- Greet the caller and introduce yourself as the voice assistant for {serviceProviderName}.
- Confirm who you are speaking with.

## Phase 2: Intent
- Ask open questions to understand if the caller needs a new booking, reschedule, or enquiry.

## Phase 3: New Booking
- Collect required details (date, time, service type).
- Check availability using available tools before confirming.

## Guardrails
- If the caller speaks Hindi, continue naturally in Hindi.
- Escalate emergency or sensitive situations immediately.

## Date Resolution
- Use the runtime current date context to resolve relative days like "today", "tomorrow", or "next Monday".`}
                    className="w-full min-h-[420px] bg-gray-50/50 border border-gray-200 rounded-xl p-4 text-gray-900 font-mono text-xs leading-relaxed focus:bg-white focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-colors"
                    spellCheck={false}
                  />

                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>Universal platform safety boundaries remain authoritative over custom instructions.</span>
                    <span className="font-mono">
                      {((configuration.systemInstructions || (configuration as any).instructions || '') as string).length} chars ·{' '}
                      {((configuration.systemInstructions || (configuration as any).instructions || '') as string)
                        .split(/\s+/)
                        .filter(Boolean).length}{' '}
                      words
                    </span>
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