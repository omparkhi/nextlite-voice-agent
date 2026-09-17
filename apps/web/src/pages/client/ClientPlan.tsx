import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import type { Subscription } from '../../types';
import { CardSkeleton } from '../../components/client/LoadingSkeleton';

export function ClientPlan() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sub = await api.getClientSubscription();
      setSubscription(sub);
    } catch (err) {
      console.error('Failed to load subscription plan:', err);
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

  const usage = subscription?.usage;
  const includedMins = subscription?.includedMinutes || 500;
  const usedMins = usage?.usedMinutes || 0;
  const remainingMins = usage?.remainingMinutes ?? Math.max(0, includedMins - usedMins);
  const usagePercentage = usage?.usagePercentage ?? (includedMins > 0 ? Math.min(100, Math.round((usedMins / includedMins) * 100)) : 0);
  const totalCalls = usage?.totalCalls || 0;

  const defaultFeatures = [
    '24/7 Full-Duplex Voice Receptionist',
    'Hindi + English + Multilingual Synthesis',
    'Instant Real-Time Appointment Booking',
    'Live WhatsApp Confirmation Messages',
    'Google Calendar & CRM Synchronization',
    'Instant Doctor/Staff Call Transfer',
    'Clinical FAQ & Knowledge Base Answers'
  ];

  return (
    <div className="space-y-8 font-sans animate-in fade-in duration-300">
      {/* Page Header */}
      <div>
        <h1 className="font-display-serif text-3xl md:text-4xl font-light text-[#0c0a09]">
          My Plan & Voice Usage
        </h1>
        <p className="text-xs text-[#777169] mt-1">
          Detailed overview of your active voice package, telephony minutes consumption, and overage rates.
        </p>
      </div>

      {loading ? (
        <CardSkeleton count={3} />
      ) : subscription ? (
        <div className="space-y-6">
          {/* Top 2 Cards: Plan Info & Live Voice Meter */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Card: Active Plan Overview (5 Cols) */}
            <div className="lg:col-span-5 bg-white border border-[#e7e5e4] rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                    {subscription.planTier || 'Active'} Tier
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    {subscription.status.toUpperCase()}
                  </span>
                </div>

                <div className="mt-4">
                  <h2 className="text-2xl font-extrabold text-[#0c0a09]">
                    {subscription.planName || `${subscription.planTier || 'Starter'} Plan`}
                  </h2>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold text-gray-900 font-mono">
                      ₹{subscription.finalPrice?.toLocaleString('en-IN') || (subscription.billingCycle === 'yearly' ? '49,990' : '4,999')}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                      / {subscription.billingCycle || 'month'}
                    </span>
                  </div>
                </div>

                <div className="mt-5 pt-5 border-t border-gray-100 space-y-3 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Billing Cycle:</span>
                    <span className="font-semibold text-gray-900 capitalize">{subscription.billingCycle || 'Monthly'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Allocated Voice Quota:</span>
                    <span className="font-semibold text-gray-900 font-mono">{includedMins} Minutes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pay-As-You-Go Overage:</span>
                    <span className="font-semibold text-gray-900 font-mono">₹{subscription.payAsYouGoRate || 7.0} / min</span>
                  </div>
                  {subscription.currentPeriodEnd && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Next Renewal Date:</span>
                      <span className="font-semibold text-gray-900">
                        {new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {subscription.adminNotes && (
                <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900">
                  <span className="font-bold block text-[10px] uppercase text-amber-800 tracking-wider mb-0.5">Custom Plan Note</span>
                  {subscription.adminNotes}
                </div>
              )}
            </div>

            {/* Right Card: Live Usage Meter & Statistics (7 Cols) */}
            <div className="lg:col-span-7 bg-white border border-[#e7e5e4] rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm">
                      ⚡
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Live Voice Minutes Meter</h3>
                      <p className="text-[11px] text-gray-500">Real-time tracking computed across all completed calls</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-md">
                    {totalCalls} Calls Logged
                  </span>
                </div>

                {/* 3 Metric Pills */}
                <div className="grid grid-cols-3 gap-3 my-5">
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 text-center">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Quota Included</span>
                    <span className="text-lg font-extrabold text-gray-900 font-mono mt-0.5 block">{includedMins}</span>
                    <span className="text-[10px] text-gray-400">minutes</span>
                  </div>
                  <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3.5 text-center">
                    <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block">Minutes Used</span>
                    <span className="text-lg font-extrabold text-amber-900 font-mono mt-0.5 block">{usedMins}</span>
                    <span className="text-[10px] text-amber-600">minutes</span>
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5 text-center">
                    <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">Remaining</span>
                    <span className="text-lg font-extrabold text-emerald-800 font-mono mt-0.5 block">{remainingMins}</span>
                    <span className="text-[10px] text-emerald-600">minutes</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2 mt-4">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-700">Quota Utilization</span>
                    <span className="font-bold text-gray-900 font-mono">{usagePercentage}%</span>
                  </div>
                  <div className="w-full h-3.5 bg-gray-100 rounded-full overflow-hidden p-0.5 border border-gray-200">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        usagePercentage >= 90
                          ? 'bg-rose-500'
                          : usagePercentage >= 70
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(2, usagePercentage))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-500 pt-1">
                    <span>0 mins</span>
                    <span>50%</span>
                    <span>{includedMins} mins</span>
                  </div>
                </div>
              </div>

              {/* Pay As You Go Info Banner */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-gray-900 block">Pay-As-You-Go Overage Protection</span>
                  <p className="text-gray-500 text-[11px] mt-0.5">
                    If monthly quota is exceeded, calls continue seamlessly at ₹{subscription.payAsYouGoRate || 7.0}/min.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100/70 px-2.5 py-1 rounded-md">
                  Active
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Section: Features Included & Account Support */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Features Included */}
            <div className="bg-white border border-[#e7e5e4] rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-[#0c0a09] flex items-center gap-2">
                <span>🛡️</span> Included Plan Features & Automations
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-gray-700">
                {(subscription.features && subscription.features.length > 0
                  ? subscription.features
                  : defaultFeatures
                ).map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2 bg-gray-50/70 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span className="font-medium text-[11px] leading-tight text-gray-800">{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Plan Upgrades / Custom Minutes Contact */}
            <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/30 border border-amber-200/80 rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                  Need Help or Upgrades?
                </span>
                <h3 className="text-sm font-bold text-[#0c0a09] mt-2">
                  Dedicated NextLite Account Manager
                </h3>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Want to increase your monthly voice minutes quota, add multiple doctor appointment calendars, or enable custom CRM webhook integrations? Contact your account executive directly.
                </p>
              </div>

              <div className="bg-white border border-amber-200 rounded-xl p-3.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                    💬
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 block">NextLite Voice Support</span>
                    <span className="text-[11px] text-gray-500 font-mono">support@nextlite.ai</span>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  Priority 24/7 SLA
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#e7e5e4] rounded-2xl p-8 text-center max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl mx-auto">
            💳
          </div>
          <h3 className="text-sm font-bold text-gray-900">No Active Plan Assigned</h3>
          <p className="text-xs text-gray-500">
            Your workspace subscription package is being provisioned by your system administrator.
          </p>
        </div>
      )}
    </div>
  );
}
