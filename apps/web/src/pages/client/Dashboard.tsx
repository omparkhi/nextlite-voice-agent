import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import type { AnalyticsOverviewData, CallSession, Lead, Appointment, FollowUpItem } from '../../types';
import { MetricCard } from '../../components/client/MetricCard';
import {
  TrendBarChart,
  DonutBreakdown,
  LeadFunnelProgress,
  ToolUsageList,
} from '../../components/client/AnalyticsChart';
import { ActivityFeed, ActivityItem } from '../../components/client/ActivityFeed';
import { CardSkeleton } from '../../components/client/LoadingSkeleton';
import { areEntitiesEqual, areObjectsEqual } from '../../utils/fastDiff';

export function ClientDashboard() {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: any }>();
  const [analytics, setAnalytics] = useState<AnalyticsOverviewData | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const getGreetingTime = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [overviewData, callsRes, leadsRes, apptsRes, followUpsRes] = await Promise.all([
        api.getAnalyticsOverview().catch(() => null),
        api.getClientCalls({ limit: 10 }).catch(() => ({ calls: [] })),
        api.getClientLeads({ limit: 10 }).catch(() => ({ leads: [] })),
        api.getClientAppointments({ limit: 10 }).catch(() => ({ appointments: [] })),
        api.getClientFollowUps({ limit: 10 }).catch(() => ({ followUps: [] })),
      ]);

      if (overviewData) {
        setAnalytics((prev) => areObjectsEqual(prev, overviewData) ? prev : overviewData);
      }

      // Build consolidated real activity stream
      const items: ActivityItem[] = [];

      (callsRes.calls || []).forEach((c: CallSession) => {
        items.push({
          id: `call-${c.id}`,
          type: 'CALL',
          title: `Voice Call ${c.status === 'COMPLETED' ? 'Completed' : c.status}`,
          subtitle: `${c.callerNumber || 'Anonymous'} · ${Math.floor(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s · ${c.primaryLanguage || 'en-IN'}`,
          timestamp: c.createdAt,
          badge: c.status === 'COMPLETED' ? 'Connected' : undefined,
          targetPath: '/dashboard/calls',
        });
      });

      (leadsRes.leads || []).forEach((l: Lead) => {
        items.push({
          id: `lead-${l.id}`,
          type: 'LEAD',
          title: `Lead Captured: ${l.customerName}`,
          subtitle: `${l.customerPhone} · ${l.interestCategory || 'General Inquiry'}`,
          timestamp: l.createdAt,
          badge: l.status,
          targetPath: '/dashboard/leads',
        });
      });

      (apptsRes.appointments || []).forEach((a: Appointment) => {
        items.push({
          id: `appt-${a.id}`,
          type: 'APPOINTMENT',
          title: `Appointment ${a.appointmentNumber || 'A-001'}: ${a.customerName}`,
          subtitle: `${a.bookingDate} at ${a.bookingTime} · ${a.title}`,
          timestamp: a.createdAt,
          badge: a.status,
          targetPath: '/dashboard/appointments',
        });
      });

      (followUpsRes.followUps || []).forEach((f: FollowUpItem) => {
        items.push({
          id: `fu-${f.id}`,
          type: 'FOLLOW_UP',
          title: `WhatsApp Follow-up: ${f.customerName || f.customerPhone}`,
          subtitle: `${f.messageText.substring(0, 50)}...`,
          timestamp: f.createdAt,
          badge: f.status,
          targetPath: '/dashboard/follow-ups',
        });
      });

      // Sort chronological descending
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const nextActivities = items.slice(0, 8);
      setActivities((prev) => areEntitiesEqual(prev, nextActivities) ? prev : nextActivities);
    } catch (err) {
      console.error('Failed to load dashboard overview:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleRefresh = () => loadData(false);
    const handleRefreshSilent = () => loadData(true);
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefreshSilent);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefreshSilent);
    };
  }, [loadData]);

  const tenantName = profile?.tenant?.name || 'Workspace';

  return (
    <div className="space-y-5 sm:space-y-6 md:space-y-8 font-sans animate-in fade-in duration-300 w-full min-w-0">
      {/* Header Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl md:text-3xl font-light text-[#0c0a09] tracking-tight leading-tight">
            {getGreetingTime()}, {tenantName}
          </h1>
          <p className="text-[11px] sm:text-xs text-[#777169] mt-0.5 leading-normal">
            Here's what's happening across your AI voice operations and customer pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={() => navigate('/dashboard/calls')}
            className="bg-black text-white rounded-full font-light h-8 sm:h-9 px-3.5 sm:px-4 text-xs sm:text-sm shadow-2xs hover:opacity-90 transition leading-none cursor-pointer"
          >
            + View Recent Calls
          </button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      {loading ? (
        <CardSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <MetricCard
            label="Total Calls"
            value={analytics?.totalCalls ?? 0}
            subtext={`${analytics?.connectedCalls ?? 0} connected`}
            badge="Live Voice"
            badgeColor="green"
            onClick={() => navigate('/dashboard/calls')}
          />
          <MetricCard
            label="Connected Calls"
            value={analytics?.connectedCalls ?? 0}
            subtext={`Avg ${analytics?.averageDurationSeconds ?? 0}s per call`}
            badge="Healthy"
            badgeColor="green"
            onClick={() => navigate('/dashboard/calls')}
          />
          <MetricCard
            label="Leads Generated"
            value={analytics?.totalLeads ?? 0}
            subtext={`${analytics?.leadFunnel?.new ?? 0} new pipeline`}
            badge="CRM"
            badgeColor="blue"
            onClick={() => navigate('/dashboard/leads')}
          />
          <MetricCard
            label="Qualified Leads"
            value={analytics?.qualifiedLeads ?? 0}
            subtext={
              analytics?.totalLeads
                ? `${Math.round(((analytics?.qualifiedLeads ?? 0) / analytics.totalLeads) * 100)}% qualification`
                : 'Ready for closing'
            }
            badge="High Intent"
            badgeColor="purple"
            onClick={() => navigate('/dashboard/leads')}
          />
          <MetricCard
            label="Appointments"
            value={analytics?.totalAppointments ?? 0}
            subtext={`${analytics?.confirmedAppointments ?? 0} confirmed · ${analytics?.requestedAppointments ?? 0} pending`}
            badge="Schedule"
            badgeColor="amber"
            onClick={() => navigate('/dashboard/appointments')}
          />
          {/* <MetricCard
            label="WhatsApp Follow-ups"
            value={analytics?.sentFollowUps ?? 0}
            subtext={`${analytics?.pendingFollowUps ?? 0} pending action`}
            badge="Automation"
            badgeColor="green"
            onClick={() => navigate('/dashboard/follow-ups')}
          /> */}
        </div>
      )}

      {/* Analytics & Breakdown Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrendBarChart
            data={analytics?.callTrend || []}
            title="Daily Call Volume & Outcomes"
            subtitle="7-day aggregated volume across all AI voice channels"
          />
        </div>

        <div className="space-y-6">
          <DonutBreakdown
            title="Call Outcomes Breakdown"
            subtitle="Connection success and completion status"
            items={[
              { label: 'Completed', count: analytics?.callOutcomes?.completed ?? 0, color: '#16a34a' },
              { label: 'Missed', count: analytics?.callOutcomes?.missed ?? 0, color: '#d97706' },
              { label: 'Failed', count: analytics?.callOutcomes?.failed ?? 0, color: '#dc2626' },
              { label: 'Active', count: analytics?.callOutcomes?.active ?? 0, color: '#2563eb' },
            ]}
          />
        </div>
      </div>

      {/* Funnel & Tool Execution Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LeadFunnelProgress
          funnel={
            analytics?.leadFunnel || {
              new: 0,
              contacted: 0,
              qualified: 0,
              closed: 0,
            }
          }
        />

        <ToolUsageList tools={analytics?.toolUsage || []} />
      </div>

      {/* Live Activity Feed */}
      <ActivityFeed activities={activities} />
    </div>
  );
}
