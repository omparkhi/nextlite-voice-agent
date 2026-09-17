import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Subscription } from '../../types';

interface ClientPlanModalProps {
  clientId: string;
  clientName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (sub: Subscription) => void;
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

export function ClientPlanModal({
  clientId,
  clientName,
  isOpen,
  onClose,
  onSuccess,
}: ClientPlanModalProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Form State
  const [selectedTier, setSelectedTier] = useState<'STARTER' | 'GROWTH' | 'PRO' | 'CUSTOM'>('GROWTH');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [customPlanName, setCustomPlanName] = useState<string>('');
  const [customPrice, setCustomPrice] = useState<string>('9999');
  const [customMinutes, setCustomMinutes] = useState<string>('1200');
  const [customOverageRate, setCustomOverageRate] = useState<string>('7.0');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setStatusMessage(null);
      api.getAdminClientSubscription(clientId)
        .then((sub) => {
          if (sub) {
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
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, clientId]);

  const handleTierSelect = (tier: 'STARTER' | 'GROWTH' | 'PRO' | 'CUSTOM', cycle: 'monthly' | 'yearly' = billingCycle) => {
    setSelectedTier(tier);
    const plan = DEFAULT_PLANS[tier];
    if (plan) {
      setCustomPlanName(tier === 'CUSTOM' ? 'Custom Enterprise Plan' : `${plan.name} (${cycle === 'yearly' ? 'Yearly' : 'Monthly'})`);
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

  const handleSavePlan = async () => {
    setSaving(true);
    setStatusMessage(null);
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
      setStatusMessage({ type: 'success', text: `✓ Successfully assigned ${res.subscription.planName}!` });
      if (onSuccess) {
        onSuccess(res.subscription);
      }
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update subscription' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-base shadow-xs">
              💳
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Assign & Customize Client Package / Subscription
              </h2>
              <p className="text-[11px] text-gray-500">
                Clinic: <strong className="text-gray-800">{clientName || clientId.slice(0, 8)}</strong> · Full live customization for any plan (No payment gateway)
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

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5 text-gray-800">
          {loading ? (
            <div className="py-20 text-center text-gray-400 text-xs font-medium">
              Loading pricing catalog & active client subscription...
            </div>
          ) : (
            <>
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
                      Save up to ₹50k
                    </span>
                  </button>
                </div>
              </div>

              {/* 4 Plan Cards (Starter, Growth, Pro, Custom) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. STARTER */}
                <div
                  onClick={() => handleTierSelect('STARTER')}
                  className={`cursor-pointer rounded-xl p-3.5 border-2 transition-all flex flex-col justify-between ${
                    selectedTier === 'STARTER'
                      ? 'border-amber-500 bg-amber-50/30 shadow-xs ring-2 ring-amber-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase text-gray-500 block">Starter</span>
                    <div className="mt-1 mb-1">
                      <span className="text-lg font-extrabold text-gray-900">
                        ₹{billingCycle === 'yearly' ? '49,990' : '4,999'}
                      </span>
                      <span className="text-[10px] text-gray-500">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                    </div>
                    <div className="bg-amber-500/10 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded mb-2 inline-block">
                      ⚡ 500 Voice Mins
                    </div>
                    <ul className="space-y-1 text-[11px] text-gray-600">
                      <li>✓ 1 DID & 1 AI Agent</li>
                      <li>✓ Hindi + English voice</li>
                      <li>✓ Appt booking & FAQ</li>
                    </ul>
                  </div>
                  <div className={`mt-3 py-1 rounded text-center text-[10px] font-bold ${
                    selectedTier === 'STARTER' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedTier === 'STARTER' ? '● Selected' : 'Select Starter'}
                  </div>
                </div>

                {/* 2. GROWTH (Popular) */}
                <div
                  onClick={() => handleTierSelect('GROWTH')}
                  className={`cursor-pointer rounded-xl p-3.5 border-2 transition-all flex flex-col justify-between relative ${
                    selectedTier === 'GROWTH'
                      ? 'border-emerald-500 bg-emerald-50/30 shadow-xs ring-2 ring-emerald-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shadow-xs">
                    Popular
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-emerald-700 block">Growth</span>
                    <div className="mt-1 mb-1">
                      <span className="text-lg font-extrabold text-gray-900">
                        ₹{billingCycle === 'yearly' ? '99,990' : '9,999'}
                      </span>
                      <span className="text-[10px] text-gray-500">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                    </div>
                    <div className="bg-emerald-500/10 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded mb-2 inline-block">
                      ⚡ 1,200 Voice Mins
                    </div>
                    <ul className="space-y-1 text-[11px] text-gray-600">
                      <li>✓ Hindi/Eng/Marathi</li>
                      <li>✓ WhatsApp Confirm</li>
                      <li>✓ CRM & Call Transfer</li>
                    </ul>
                  </div>
                  <div className={`mt-3 py-1 rounded text-center text-[10px] font-bold ${
                    selectedTier === 'GROWTH' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedTier === 'GROWTH' ? '● Selected' : 'Select Growth'}
                  </div>
                </div>

                {/* 3. PRO */}
                <div
                  onClick={() => handleTierSelect('PRO')}
                  className={`cursor-pointer rounded-xl p-3.5 border-2 transition-all flex flex-col justify-between ${
                    selectedTier === 'PRO'
                      ? 'border-indigo-500 bg-indigo-50/30 shadow-xs ring-2 ring-indigo-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase text-indigo-700 block">Pro Enterprise</span>
                    <div className="mt-1 mb-1">
                      <span className="text-lg font-extrabold text-gray-900">
                        ₹{billingCycle === 'yearly' ? '2,49,990' : '24,999'}
                      </span>
                      <span className="text-[10px] text-gray-500">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                    </div>
                    <div className="bg-indigo-500/10 text-indigo-900 text-[10px] font-bold px-2 py-0.5 rounded mb-2 inline-block">
                      ⚡ 3,000 Voice Mins
                    </div>
                    <ul className="space-y-1 text-[11px] text-gray-600">
                      <li>✓ Multi-doctor & branch</li>
                      <li>✓ Advanced Analytics</li>
                      <li>✓ Priority 24/7 SLA</li>
                    </ul>
                  </div>
                  <div className={`mt-3 py-1 rounded text-center text-[10px] font-bold ${
                    selectedTier === 'PRO' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedTier === 'PRO' ? '● Selected' : 'Select Pro'}
                  </div>
                </div>

                {/* 4. FULLY CUSTOM PLAN */}
                <div
                  onClick={() => handleTierSelect('CUSTOM')}
                  className={`cursor-pointer rounded-xl p-3.5 border-2 transition-all flex flex-col justify-between ${
                    selectedTier === 'CUSTOM'
                      ? 'border-purple-500 bg-purple-50/30 shadow-xs ring-2 ring-purple-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-700 block">Custom Plan</span>
                    <div className="mt-1 mb-1">
                      <span className="text-lg font-extrabold text-purple-900">
                        Custom
                      </span>
                      <span className="text-[10px] text-gray-500"> (Editable)</span>
                    </div>
                    <div className="bg-purple-500/10 text-purple-900 text-[10px] font-bold px-2 py-0.5 rounded mb-2 inline-block">
                      ⚡ Custom Quota
                    </div>
                    <ul className="space-y-1 text-[11px] text-gray-600">
                      <li>✓ Set any price & mins</li>
                      <li>✓ Set custom overage rate</li>
                      <li>✓ Tailored clinic terms</li>
                    </ul>
                  </div>
                  <div className={`mt-3 py-1 rounded text-center text-[10px] font-bold ${
                    selectedTier === 'CUSTOM' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedTier === 'CUSTOM' ? '● Selected' : 'Build Custom'}
                  </div>
                </div>
              </div>

              {/* LIVE CUSTOMIZATION PANEL FOR SELECTED PLAN */}
              <div className="border border-amber-300/80 bg-amber-50/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚙️</span>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900">
                        Customize Pricing & Parameters for {selectedTier === 'CUSTOM' ? 'Custom Plan' : DEFAULT_PLANS[selectedTier]?.name}
                      </h4>
                      <p className="text-[11px] text-gray-600">
                        You can edit and customize the price, minutes, and pay-as-you-go rate for this client directly below.
                      </p>
                    </div>
                  </div>
                  {priceDifference > 0 && selectedTier !== 'CUSTOM' && (
                    <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-1 rounded border border-emerald-300">
                      Discount: ₹{priceDifference.toLocaleString('en-IN')} off standard
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {/* Plan Name */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Plan Name / Label
                    </label>
                    <input
                      type="text"
                      value={customPlanName}
                      onChange={(e) => setCustomPlanName(e.target.value)}
                      placeholder="e.g. Growth Plan (Special)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white font-medium"
                    />
                  </div>

                  {/* Final Price */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Final Price (₹)
                    </label>
                    <input
                      type="number"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      placeholder="e.g. 4999"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white font-mono font-bold text-gray-900"
                    />
                  </div>

                  {/* Included Minutes */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Included Voice Minutes
                    </label>
                    <input
                      type="number"
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white font-mono font-bold text-emerald-700"
                    />
                  </div>

                  {/* Pay As You Go Rate */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Pay-As-You-Go (₹/min)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={customOverageRate}
                      onChange={(e) => setCustomOverageRate(e.target.value)}
                      placeholder="7.0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white font-mono font-bold text-gray-900"
                    />
                  </div>
                </div>

                {/* Deal Notes */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Admin Deal & Offer Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="e.g. Customized pricing package agreed with clinic administrator"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                  />
                </div>
              </div>

              {/* Status Message */}
              {statusMessage && (
                <div className={`p-3 rounded-xl text-xs font-medium ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-700'
                }`}>
                  {statusMessage.text}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSavePlan}
            disabled={saving || loading}
            className="px-6 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-full transition-colors shadow-2xs flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? 'Saving Package...' : `Assign Plan: ₹${numericPrice.toLocaleString('en-IN')} (${customMinutes} mins @ ₹${customOverageRate}/min)`}
          </button>
        </div>
      </div>
    </div>
  );
}
