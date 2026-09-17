import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Agent, AgentConfiguration, AgentVersion, Subscription } from '../../types';

interface PublishAndChannelModalProps {
  clientId: string;
  agentId: string;
  agent: Agent | null;
  configuration: AgentConfiguration;
  checklist: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedAgent: Agent) => void;
}

const DEFAULT_PLANS: Record<string, { name: string; monthlyPrice: number; yearlyPrice: number; mins: number; features: string[] }> = {
  STARTER: {
    name: 'Starter Plan',
    monthlyPrice: 4999,
    yearlyPrice: 49990,
    mins: 500,
    features: ['500 mins included', '1 Plivo DID', 'Hindi + English voice', 'Appt booking & FAQ', 'Google Calendar sync']
  },
  GROWTH: {
    name: 'Growth Plan',
    monthlyPrice: 9999,
    yearlyPrice: 99990,
    mins: 1200,
    features: ['1,200 mins included', 'Hindi/Eng/Marathi voice', 'WhatsApp Confirmations', 'CRM integration', 'Call Transfer', 'Knowledge Base sync']
  },
  PRO: {
    name: 'Pro Enterprise Plan',
    monthlyPrice: 24999,
    yearlyPrice: 249990,
    mins: 3000,
    features: ['3,000 mins included', 'Multiple Doctors & Workflows', 'CRM + WhatsApp autopilot', 'Advanced Analytics', 'Priority 24/7 SLA']
  },
  CUSTOM: {
    name: 'Custom Tailored Plan',
    monthlyPrice: 14999,
    yearlyPrice: 149990,
    mins: 2000,
    features: ['Fully custom minutes quota', 'Custom Pay-As-You-Go overage', 'Dedicated clinic setup', 'Priority maintenance']
  }
};

export function PublishAndChannelModal({
  clientId,
  agentId,
  agent,
  configuration,
  checklist,
  isOpen,
  onClose,
  onSuccess,
}: PublishAndChannelModalProps) {
  const [step, setStep] = useState<'review' | 'channel' | 'plan' | 'complete'>('review');
  const [notes, setNotes] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishedVersion, setPublishedVersion] = useState<AgentVersion | null>(null);

  // Step 2: Telephony DID state
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [currentAssignedPhone, setCurrentAssignedPhone] = useState<string | null>(null);
  const [isSavingPhone, setIsSavingPhone] = useState<boolean>(false);
  const [isDisconnectingPhone, setIsDisconnectingPhone] = useState<boolean>(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSuccess, setPhoneSuccess] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<'inbound' | 'outbound'>('inbound');

  // Step 3: Package & Plan state
  const [selectedTier, setSelectedTier] = useState<'STARTER' | 'GROWTH' | 'PRO' | 'CUSTOM'>('GROWTH');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [customPlanName, setCustomPlanName] = useState<string>('');
  const [customPrice, setCustomPrice] = useState<string>('9999');
  const [customMinutes, setCustomMinutes] = useState<string>('1200');
  const [customOverageRate, setCustomOverageRate] = useState<string>('7.0');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [isSavingPlan, setIsSavingPlan] = useState<boolean>(false);
  const [planSuccess, setPlanSuccess] = useState<Subscription | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  // Step 4: Module 3 Go Live & Final Handover state
  const [isGoingLive, setIsGoingLive] = useState<boolean>(false);
  const [goLiveSuccess, setGoLiveSuccess] = useState<boolean>(false);
  const [resetTestData, setResetTestData] = useState<boolean>(true);
  const [forwardingCodes, setForwardingCodes] = useState<Record<string, string> | null>(null);
  const [handoverText, setHandoverText] = useState<string | null>(null);
  const [copiedHandover, setCopiedHandover] = useState<boolean>(false);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);


  useEffect(() => {
    if (isOpen) {
      setStep('review');
      setNotes(`Production release: ${configuration.identity?.agentName || agent?.name || 'Agent'} - ${new Date().toLocaleDateString()}`);
      setPhoneError(null);
      setPhoneSuccess(null);
      setPlanError(null);

      // Fetch current inbound number & subscription
      api.getAgentInboundNumber(clientId, agentId)
        .then((res) => {
          if (res.assigned && res.phoneNumber) {
            setCurrentAssignedPhone(res.phoneNumber);
            setPhoneNumber(res.phoneNumber);
          } else {
            setCurrentAssignedPhone(null);
            setPhoneNumber('');
          }
        })
        .catch(() => {});

      api.getAdminClientSubscription(clientId)
        .then((sub) => {
          if (sub) {
            setPlanSuccess(sub);
            const tier = (sub.planTier?.toUpperCase() as any) || 'GROWTH';
            setSelectedTier(['STARTER', 'GROWTH', 'PRO', 'CUSTOM'].includes(tier) ? tier : 'CUSTOM');
            setBillingCycle((sub.billingCycle as any) || 'monthly');
            setCustomPlanName(sub.planName || '');
            setCustomPrice(String(sub.finalPrice ?? (sub.billingCycle === 'yearly' ? DEFAULT_PLANS[tier]?.yearlyPrice : DEFAULT_PLANS[tier]?.monthlyPrice) ?? 9999));
            setCustomMinutes(String(sub.includedMinutes ?? DEFAULT_PLANS[tier]?.mins ?? 1200));
            setCustomOverageRate(String(sub.payAsYouGoRate ?? 7.0));
            setAdminNotes(sub.adminNotes || '');
          } else {
            handleTierSelect('GROWTH', 'monthly');
          }
        })
        .catch(() => {
          handleTierSelect('GROWTH', 'monthly');
        });
    }
  }, [isOpen]);

  const handleTierSelect = (tier: 'STARTER' | 'GROWTH' | 'PRO' | 'CUSTOM', cycle: 'monthly' | 'yearly' = billingCycle) => {
    setSelectedTier(tier);
    const plan = DEFAULT_PLANS[tier];
    if (plan) {
      setCustomPlanName(tier === 'CUSTOM' ? 'Custom Tailored Plan' : `${plan.name} (${cycle === 'yearly' ? 'Yearly' : 'Monthly'})`);
      setCustomPrice(String(cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice));
      setCustomMinutes(String(plan.mins));
      setCustomOverageRate('7.0');
    }
  };

  const handleCycleChange = (cycle: 'monthly' | 'yearly') => {
    setBillingCycle(cycle);
    handleTierSelect(selectedTier, cycle);
  };

  if (!isOpen) return null;

  const currentStandardPrice = billingCycle === 'yearly'
    ? DEFAULT_PLANS[selectedTier]?.yearlyPrice ?? 0
    : DEFAULT_PLANS[selectedTier]?.monthlyPrice ?? 0;

  const numericPrice = parseFloat(customPrice) || 0;
  const priceDifference = currentStandardPrice - numericPrice;

  const handleLockAndPublish = async () => {
    setIsPublishing(true);
    setPhoneError(null);
    try {
      await api.saveAgentConfig(clientId, agentId, configuration, notes);
      const res = await api.publishAgent(clientId, agentId, notes, configuration);
      setPublishedVersion(res.version);
      onSuccess(res.agent);
      setStep('channel');
    } catch (err: any) {
      setPhoneError(err.message || 'Failed to publish agent version');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSavePhoneNumber = async () => {
    if (!phoneNumber.trim()) {
      setPhoneError('Please enter a valid Plivo phone number (e.g. +918031707681)');
      return;
    }

    setIsSavingPhone(true);
    setPhoneError(null);
    try {
      const res = await api.setAgentInboundNumber(clientId, agentId, phoneNumber.trim(), 'plivo');
      setCurrentAssignedPhone(res.phoneNumber);
      setPhoneSuccess('✓ Plivo virtual DID successfully linked and activated for this agent!');
      
      const updated = await api.getAgent(clientId, agentId);
      if (updated) {
        onSuccess(updated);
      }
      setTimeout(() => {
        setStep('plan');
      }, 700);
    } catch (err: any) {
      setPhoneError(err.message || 'Failed to link phone number. Ensure format is E.164 (+918031707681)');
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleDisconnectPhoneNumber = async () => {
    if (!currentAssignedPhone) return;
    if (!window.confirm(`Are you sure you want to disconnect and release phone number ${currentAssignedPhone}? This will allow you to assign it to another client or agent.`)) {
      return;
    }

    setIsDisconnectingPhone(true);
    setPhoneError(null);
    setPhoneSuccess(null);
    try {
      await api.disconnectAgentInboundNumber(clientId, agentId, currentAssignedPhone);
      setCurrentAssignedPhone(null);
      setPhoneNumber('');
      setPhoneSuccess(`✓ Phone number ${currentAssignedPhone} disconnected and released. You can now link a new number or assign it elsewhere.`);
      const updated = await api.getAgent(clientId, agentId);
      if (updated) {
        onSuccess(updated);
      }
    } catch (err: any) {
      setPhoneError(err.message || 'Failed to disconnect phone number');
    } finally {
      setIsDisconnectingPhone(false);
    }
  };

  const handleSavePlan = async () => {
    setIsSavingPlan(true);
    setPlanError(null);
    try {
      const payload: any = {
        planTier: selectedTier,
        planName: customPlanName.trim() || undefined,
        billingCycle,
        customPrice: numericPrice,
        customMinutes: parseInt(customMinutes, 10) || 500,
        customOverageRate: parseFloat(customOverageRate) || 7.0,
        adminNotes: adminNotes.trim() || undefined
      };

      const res = await api.assignAdminClientSubscription(clientId, payload);
      setPlanSuccess(res.subscription);
      setStep('complete');
    } catch (err: any) {
      setPlanError(err.message || 'Failed to assign subscription package');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleGoLive = async () => {
    setIsGoingLive(true);
    setPlanError(null);
    try {
      const res = await api.goLiveAgent(clientId, agentId, resetTestData);
      setGoLiveSuccess(true);
      setForwardingCodes(res.forwardingCodes);
      setHandoverText(res.handoverText);
      if (res.agent) {
        onSuccess(res.agent);
      }
    } catch (err: any) {
      setPlanError(err.message || 'Failed to execute Go-Live.');
    } finally {
      setIsGoingLive(false);
    }
  };

  const handleCopyHandover = () => {
    if (!handoverText) return;
    navigator.clipboard.writeText(handoverText);
    setCopiedHandover(true);
    setTimeout(() => setCopiedHandover(false), 2500);
  };

  const handleCopyCode = (key: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeKey(key);
    setTimeout(() => setCopiedCodeKey(null), 2000);
  };


  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              🚀
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                {step === 'review' && 'Step 1: Lock & Publish Agent Version'}
                {step === 'channel' && 'Step 2: Channel Selection & Inbound DID Linking'}
                {step === 'plan' && 'Step 3: Assign & Customize Client Package / Subscription'}
                {step === 'complete' && (goLiveSuccess ? '🚀 Production Live & Clinic Handover Hub' : 'Step 4: Confirm & Go Live')}
              </h2>
              <p className="text-[11px] text-gray-500">
                {agent?.name || configuration.identity?.agentName || 'Clinic Receptionist'} · Client ID: {clientId.slice(0, 8)}...
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 text-lg font-bold px-2 py-1 rounded-md transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="px-6 pt-3 pb-2 bg-white border-b border-gray-100 flex items-center justify-between text-xs">
          <div className={`flex items-center gap-1.5 font-medium ${step === 'review' ? 'text-amber-600 font-bold' : 'text-emerald-600'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'review' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {step !== 'review' ? '✓' : '1'}
            </span>
            <span>Version Lock</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-200" />
          <div className={`flex items-center gap-1.5 font-medium ${step === 'channel' ? 'text-amber-600 font-bold' : ['plan', 'complete'].includes(step) ? 'text-emerald-600' : 'text-gray-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'channel' ? 'bg-amber-100 text-amber-800' : ['plan', 'complete'].includes(step) ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
              {['plan', 'complete'].includes(step) ? '✓' : '2'}
            </span>
            <span>Channel & DID</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-200" />
          <div className={`flex items-center gap-1.5 font-medium ${step === 'plan' ? 'text-amber-600 font-bold' : step === 'complete' ? 'text-emerald-600' : 'text-gray-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'plan' ? 'bg-amber-100 text-amber-800' : step === 'complete' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
              {step === 'complete' ? '✓' : '3'}
            </span>
            <span>Pricing Plan</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-200" />
          <div className={`flex items-center gap-1.5 font-medium ${step === 'complete' ? 'text-emerald-600 font-bold' : 'text-gray-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'complete' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
              4
            </span>
            <span>Ready</span>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5 text-gray-800">
          {/* STEP 1: REVIEW & LOCK */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4">
                <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-1">
                  🔒 Immutable Version Snapshot
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Publishing creates a permanent version snapshot of all prompt rules, clinical phases, voice synthesis parameters, and active tools. This snapshot will be locked and executed in production runtime.
                </p>
              </div>

              {/* Checklist & Summary */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                  <span className="text-gray-500 font-medium block mb-1">Agent Name</span>
                  <span className="font-semibold text-gray-900">{configuration.identity?.agentName || 'Receptionist'}</span>
                </div>
                <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                  <span className="text-gray-500 font-medium block mb-1">Voice & Language</span>
                  <span className="font-semibold text-gray-900">
                    {configuration.voice?.provider || 'Cartesia'} ({configuration.language?.primary || 'en-IN'})
                  </span>
                </div>
                <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                  <span className="text-gray-500 font-medium block mb-1">Tools & Integrations</span>
                  <span className="font-semibold text-gray-900">
                    {Object.values(configuration.tools || {}).filter((t: any) => t?.enabled).length} Tools Enabled
                  </span>
                </div>
                <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                  <span className="text-gray-500 font-medium block mb-1">Publish Checklist</span>
                  <span className={`font-semibold ${checklist?.canPublish ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {checklist?.canPublish ? '✓ All Checks Passed' : '⚠️ Minor warnings'}
                  </span>
                </div>
              </div>

              {/* Release Notes Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Version Release Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Production v1.0 - Full clinic booking with WhatsApp notifications"
                  className="w-full text-xs px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white"
                />
              </div>

              {phoneError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                  {phoneError}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: CHANNEL SELECTION & PHONE NUMBER LINKING */}
          {step === 'channel' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Select Deployment Channel
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Inbound Card (Active) */}
                  <div
                    onClick={() => setSelectedChannel('inbound')}
                    className={`cursor-pointer border-2 rounded-xl p-3.5 transition-all ${
                      selectedChannel === 'inbound'
                        ? 'border-emerald-500 bg-emerald-50/30 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-lg">📥 📞</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Active Channel
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-gray-900 mb-1">Inbound AI Receptionist</h4>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      Answers incoming clinic calls 24/7. Directly bound to client Plivo virtual number.
                    </p>
                  </div>

                  {/* Outbound Card (Disabled) */}
                  <div
                    className="border-2 border-dashed border-gray-200 rounded-xl p-3.5 bg-gray-50/60 opacity-60 cursor-not-allowed"
                    title="Outbound automated calling will be activated in next release"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-lg">📤 ⏳</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                        Coming Soon
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-gray-700 mb-1">Outbound Auto Reminders</h4>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      Automated appointment reminders & follow-up callbacks (disabled to avoid overengineering).
                    </p>
                  </div>
                </div>
              </div>

              {/* Phone Number Linking Section */}
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <span>📱</span> Plivo Virtual Inbound Number (DID)
                  </h4>
                  {currentAssignedPhone && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Active: {currentAssignedPhone}
                      </span>
                      <button
                        type="button"
                        onClick={handleDisconnectPhoneNumber}
                        disabled={isDisconnectingPhone}
                        className="px-2 py-0.5 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Disconnect & release this phone number to link it to another agent or client"
                      >
                        <span>🔌</span>
                        {isDisconnectingPhone ? 'Releasing...' : 'Disconnect Number'}
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-600 leading-relaxed">
                  Enter the virtual number purchased for this clinic from your Plivo master account. All incoming calls to this number will directly trigger this agent.
                </p>

                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+918031707681 or 08031707681"
                      className="flex-1 text-xs px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSavePhoneNumber}
                      disabled={isSavingPhone || !phoneNumber.trim()}
                      className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 transition-colors shadow-2xs"
                    >
                      {isSavingPhone ? 'Linking...' : 'Link & Save DID'}
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-500 block mt-1">
                    Format: E.164 (e.g. +918031707681 or 10-digit Indian mobile/landline with STD code)
                  </span>
                </div>

                {phoneSuccess && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium">
                    {phoneSuccess}
                  </div>
                )}

                {phoneError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                    {phoneError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: ASSIGN & CUSTOMIZE PLAN (MODULE 2) */}
          {step === 'plan' && (
            <div className="space-y-4">
              {/* Billing Cycle Switch */}
              <div className="flex items-center justify-center">
                <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1 border border-gray-200 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleCycleChange('monthly')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      billingCycle === 'monthly'
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Monthly Billing
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCycleChange('yearly')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      billingCycle === 'yearly'
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span>Yearly Billing</span>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                      Save ₹50k
                    </span>
                  </button>
                </div>
              </div>

              {/* 4 Tier Cards (Starter, Growth, Pro, Custom) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* 1. Starter */}
                <div
                  onClick={() => handleTierSelect('STARTER')}
                  className={`cursor-pointer rounded-xl p-3 border-2 transition-all flex flex-col justify-between ${
                    selectedTier === 'STARTER'
                      ? 'border-amber-500 bg-amber-50/30 shadow-xs ring-2 ring-amber-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase text-gray-500">Starter</span>
                    <div className="mt-1 mb-1">
                      <span className="text-base font-extrabold text-gray-900">
                        ₹{billingCycle === 'yearly' ? '49,990' : '4,999'}
                      </span>
                      <span className="text-[9px] text-gray-500">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                    </div>
                    <div className="bg-amber-500/10 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded mb-1.5">
                      ⚡ 500 Voice Mins
                    </div>
                    <ul className="space-y-0.5 text-[10px] text-gray-600">
                      <li>✓ 1 DID & 1 Agent</li>
                      <li>✓ Hindi + English</li>
                      <li>✓ Appt booking</li>
                    </ul>
                  </div>
                  <div className={`mt-2 py-1 rounded text-center text-[10px] font-bold ${selectedTier === 'STARTER' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {selectedTier === 'STARTER' ? '● Selected' : 'Choose Starter'}
                  </div>
                </div>

                {/* 2. Growth (Popular) */}
                <div
                  onClick={() => handleTierSelect('GROWTH')}
                  className={`cursor-pointer rounded-xl p-3 border-2 transition-all flex flex-col justify-between relative ${
                    selectedTier === 'GROWTH'
                      ? 'border-emerald-500 bg-emerald-50/30 shadow-xs ring-2 ring-emerald-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded-full">
                    Popular
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-emerald-700">Growth</span>
                    <div className="mt-1 mb-1">
                      <span className="text-base font-extrabold text-gray-900">
                        ₹{billingCycle === 'yearly' ? '99,990' : '9,999'}
                      </span>
                      <span className="text-[9px] text-gray-500">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                    </div>
                    <div className="bg-emerald-500/10 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded mb-1.5">
                      ⚡ 1,200 Voice Mins
                    </div>
                    <ul className="space-y-0.5 text-[10px] text-gray-600">
                      <li>✓ Hindi/Eng/Marathi</li>
                      <li>✓ WhatsApp Confirm</li>
                      <li>✓ CRM & Transfer</li>
                    </ul>
                  </div>
                  <div className={`mt-2 py-1 rounded text-center text-[10px] font-bold ${selectedTier === 'GROWTH' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {selectedTier === 'GROWTH' ? '● Selected' : 'Choose Growth'}
                  </div>
                </div>

                {/* 3. Pro */}
                <div
                  onClick={() => handleTierSelect('PRO')}
                  className={`cursor-pointer rounded-xl p-3 border-2 transition-all flex flex-col justify-between ${
                    selectedTier === 'PRO'
                      ? 'border-indigo-500 bg-indigo-50/30 shadow-xs ring-2 ring-indigo-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase text-indigo-700">Pro</span>
                    <div className="mt-1 mb-1">
                      <span className="text-base font-extrabold text-gray-900">
                        ₹{billingCycle === 'yearly' ? '2,49,990' : '24,999'}
                      </span>
                      <span className="text-[9px] text-gray-500">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                    </div>
                    <div className="bg-indigo-500/10 text-indigo-900 text-[10px] font-bold px-2 py-0.5 rounded mb-1.5">
                      ⚡ 3,000 Voice Mins
                    </div>
                    <ul className="space-y-0.5 text-[10px] text-gray-600">
                      <li>✓ Multi-doctor & branch</li>
                      <li>✓ Advanced Analytics</li>
                      <li>✓ Priority 24/7 SLA</li>
                    </ul>
                  </div>
                  <div className={`mt-2 py-1 rounded text-center text-[10px] font-bold ${selectedTier === 'PRO' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {selectedTier === 'PRO' ? '● Selected' : 'Choose Pro'}
                  </div>
                </div>

                {/* 4. Custom */}
                <div
                  onClick={() => handleTierSelect('CUSTOM')}
                  className={`cursor-pointer rounded-xl p-3 border-2 transition-all flex flex-col justify-between ${
                    selectedTier === 'CUSTOM'
                      ? 'border-purple-500 bg-purple-50/30 shadow-xs ring-2 ring-purple-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-700">Custom Plan</span>
                    <div className="mt-1 mb-1">
                      <span className="text-base font-extrabold text-purple-900">Custom</span>
                      <span className="text-[9px] text-gray-500"> (Editable)</span>
                    </div>
                    <div className="bg-purple-500/10 text-purple-900 text-[10px] font-bold px-2 py-0.5 rounded mb-1.5">
                      ⚡ Custom Quota
                    </div>
                    <ul className="space-y-0.5 text-[10px] text-gray-600">
                      <li>✓ Set any price & mins</li>
                      <li>✓ Custom overage rate</li>
                      <li>✓ Tailored contract</li>
                    </ul>
                  </div>
                  <div className={`mt-2 py-1 rounded text-center text-[10px] font-bold ${selectedTier === 'CUSTOM' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {selectedTier === 'CUSTOM' ? '● Selected' : 'Build Custom'}
                  </div>
                </div>
              </div>

              {/* LIVE CUSTOMIZATION PANEL */}
              <div className="border border-amber-300/80 bg-amber-50/40 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-amber-200">
                  <div className="flex items-center gap-1.5">
                    <span>⚙️</span>
                    <h4 className="text-xs font-bold text-gray-900">
                      Customize Pricing & Parameters for {selectedTier === 'CUSTOM' ? 'Custom Plan' : DEFAULT_PLANS[selectedTier]?.name}
                    </h4>
                  </div>
                  {priceDifference > 0 && selectedTier !== 'CUSTOM' && (
                    <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
                      Discount: ₹{priceDifference.toLocaleString('en-IN')} off standard
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Plan Title</label>
                    <input
                      type="text"
                      value={customPlanName}
                      onChange={(e) => setCustomPlanName(e.target.value)}
                      placeholder="e.g. Starter Plan (Special)"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Final Price (₹)</label>
                    <input
                      type="number"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      placeholder="e.g. 4999"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-mono font-bold text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Included Mins</label>
                    <input
                      type="number"
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-mono font-bold text-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">Pay-As-You-Go (₹/min)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={customOverageRate}
                      onChange={(e) => setCustomOverageRate(e.target.value)}
                      placeholder="7.0"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-mono font-bold text-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-gray-700 mb-0.5">Admin Deal Notes</label>
                  <input
                    type="text"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="e.g. Negotiated customized package agreed with clinic administrator"
                    className="w-full px-2.5 py-1 border border-gray-300 rounded-lg text-xs bg-white"
                  />
                </div>
              </div>

              {planError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                  {planError}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: GO-LIVE READY & HANDOVER HUB */}
          {step === 'complete' && (
            <div className="space-y-4">
              {!goLiveSuccess ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-blue-500/10 border border-amber-200/60 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                        🚀
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-gray-900">Module 3: Ready for Final Production Go-Live</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          Review your deployment configuration below. Once confirmed, this agent will be marked as <strong className="text-emerald-700 font-semibold">ACTIVE</strong>, voice worker caches will be synchronized, and official subscription billing will commence.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Summary Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Agent & Telephony</h4>
                      <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                        <span className="text-gray-500">Published Version</span>
                        <span className="font-semibold text-gray-900 font-mono">v{publishedVersion?.versionNumber || 1}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                        <span className="text-gray-500">Active Channel</span>
                        <span className="font-semibold text-emerald-700">Inbound AI Receptionist</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-gray-500">Linked Plivo DID</span>
                        <span className="font-bold text-indigo-700 font-mono">{currentAssignedPhone || phoneNumber || 'None'}</span>
                      </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Subscription & Quota</h4>
                      <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                        <span className="text-gray-500">Plan Tier</span>
                        <span className="font-semibold text-gray-900">{planSuccess?.planName || `${selectedTier} (${billingCycle})`}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                        <span className="text-gray-500">Price & Cycle</span>
                        <span className="font-bold text-gray-900 font-mono">₹{(planSuccess?.finalPrice ?? numericPrice).toLocaleString('en-IN')} / {planSuccess?.billingCycle || billingCycle}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-gray-500">Included Minutes</span>
                        <span className="font-bold text-emerald-700 font-mono">{planSuccess?.includedMinutes || customMinutes} mins</span>
                      </div>
                    </div>
                  </div>

                  {/* Pre-launch Data Reset Option */}
                  <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={resetTestData}
                        onChange={(e) => setResetTestData(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                          <span>Purge pre-launch test data & reset usage meters to 0 mins</span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold uppercase">Recommended</span>
                        </span>
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                          Clears mock test calls, appointments, and leads recorded during development. Ensures client's live billing starts with clean 0% usage and 100% quota available.
                        </p>
                      </div>
                    </label>
                  </div>

                  {planError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                      {planError}
                    </div>
                  )}
                </div>
              ) : (
                /* POST GO-LIVE SUCCESS VIEW */
                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  {/* Live Banner */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
                        ✓
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white uppercase tracking-wider animate-pulse">
                            ● Live in Production
                          </span>
                          <h3 className="text-sm font-bold text-gray-900">AI Receptionist is Active!</h3>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Virtual DID <span className="font-mono font-bold text-gray-900">{currentAssignedPhone || phoneNumber}</span> is ready to answer calls 24/7.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Carrier Call Forwarding Reference Matrix */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                          <span>📞 Clinic Call Forwarding Reference Guide</span>
                        </h4>
                        <p className="text-[11px] text-gray-500">
                          Dial these GSM shortcodes from the clinic's primary phone/SIM to route calls to the AI:
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {forwardingCodes ? (
                        Object.entries(forwardingCodes).map(([key, code]) => {
                          const titles: Record<string, { name: string; desc: string }> = {
                            immediate: { name: 'Forward All Calls (Unconditional)', desc: 'Instant forward for all incoming calls' },
                            busy: { name: 'Forward When Busy', desc: 'Routes when clinic line is engaged' },
                            unanswered: { name: 'Forward When Unanswered', desc: 'Routes after 3 rings (15-20 sec)' },
                            unreachable: { name: 'Forward When Unreachable', desc: 'Routes if phone switched off/no network' },
                            cancelAll: { name: 'Cancel All Forwarding', desc: 'Restores default phone routing' }
                          };
                          const meta = titles[key] || { name: key, desc: '' };
                          const isCopied = copiedCodeKey === key;

                          return (
                            <div key={key} className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center justify-between shadow-2xs">
                              <div className="space-y-0.5 pr-2">
                                <div className="font-bold text-gray-800 text-[11px]">{meta.name}</div>
                                <div className="text-[10px] text-gray-500">{meta.desc}</div>
                                <div className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50/60 px-1.5 py-0.5 rounded inline-block mt-0.5">
                                  {code}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(key, code)}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors shrink-0 ${
                                  isCopied
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                }`}
                              >
                                {isCopied ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-gray-500 p-2 col-span-2">
                          Forwarding codes loaded.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WhatsApp Handover Briefing Card */}
                  {handoverText && (
                    <div className="bg-gradient-to-br from-emerald-950 to-gray-900 border border-emerald-800/60 rounded-xl p-3.5 text-white space-y-2.5 shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">💬</span>
                          <div>
                            <h4 className="text-xs font-bold text-white">Shareable WhatsApp Clinic Handover</h4>
                            <p className="text-[10px] text-emerald-200/80">
                              Send this summary directly to the clinic doctor / administrator.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyHandover}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs ${
                            copiedHandover
                              ? 'bg-emerald-500 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          {copiedHandover ? '✓ Copied to Clipboard!' : '📋 Copy WhatsApp Handover'}
                        </button>
                      </div>

                      <pre className="bg-black/40 border border-white/10 rounded-lg p-2.5 text-[10px] font-mono text-emerald-100 overflow-x-auto whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed">
                        {handoverText}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between">
          {step === 'review' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLockAndPublish}
                disabled={isPublishing}
                className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-full disabled:opacity-50 transition-colors shadow-2xs flex items-center gap-1.5"
              >
                {isPublishing ? (
                  <span>Locking Version...</span>
                ) : (
                  <>
                    <span>Lock Version & Proceed</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </>
          )}

          {step === 'channel' && (
            <>
              <button
                type="button"
                onClick={() => setStep('review')}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep('plan')}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-full transition-colors shadow-2xs flex items-center gap-1.5"
              >
                <span>Continue to Package Assignment</span>
                <span>→</span>
              </button>
            </>
          )}

          {step === 'plan' && (
            <>
              <button
                type="button"
                onClick={() => setStep('channel')}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleSavePlan}
                disabled={isSavingPlan}
                className="px-6 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-full transition-colors shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingPlan ? (
                  <span>Saving Plan...</span>
                ) : (
                  <>
                    <span>Assign Plan: ₹{numericPrice.toLocaleString('en-IN')} ({customMinutes} mins)</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </>
          )}

          {step === 'complete' && (
            <>
              {!goLiveSuccess ? (
                <>
                  <button
                    type="button"
                    onClick={() => setStep('plan')}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    ← Back to Plan
                  </button>
                  <button
                    type="button"
                    onClick={handleGoLive}
                    disabled={isGoingLive}
                    className="px-6 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-full transition-colors shadow-xs flex items-center gap-2 disabled:opacity-50"
                  >
                    {isGoingLive ? (
                      <span>Activating Production Agent...</span>
                    ) : (
                      <>
                        <span>🚀 Confirm & Go Live Now</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 text-xs font-bold bg-gray-900 hover:bg-black text-white rounded-full transition-colors shadow-2xs flex items-center justify-center gap-2"
                >
                  <span>✓ Return to Agent Workspace</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

