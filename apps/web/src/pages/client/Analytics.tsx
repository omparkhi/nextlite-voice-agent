import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import type { AnalyticsOverviewData } from '../../types';
import { MetricCard } from '../../components/client/MetricCard';
import {
  TrendBarChart,
  DonutBreakdown,
  LeadFunnelProgress,
  ToolUsageList,
} from '../../components/client/AnalyticsChart';
import { CardSkeleton } from '../../components/client/LoadingSkeleton';

export function ClientAnalytics() {
  const [data, setData] = useState<AnalyticsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await api.getAnalyticsOverview();
      setData(res);
    } catch (err) {
      console.error('Failed to load analytics overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();

    const handleRefresh = () => loadAnalytics();
    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefresh);

    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefresh);
    };
  }, [loadAnalytics]);

  const completionRate = data?.totalCalls
    ? Math.round(((data.connectedCalls || 0) / data.totalCalls) * 100)
    : 0;

  const leadQualificationRate = data?.totalLeads
    ? Math.round(((data.qualifiedLeads || 0) / data.totalLeads) * 100)
    : 0;

  const appointmentConfirmationRate = data?.totalAppointments
    ? Math.round(((data.confirmedAppointments || 0) / data.totalAppointments) * 100)
    : 0;

  return (
    <div className="space-y-8 font-sans animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="font-display-serif text-3xl md:text-4xl font-light text-[#0c0a09]">
          Operational & AI Intelligence Analytics
        </h1>
        <p className="text-xs text-[#777169] mt-1">
          Comprehensive performance metrics, latency benchmarks, customer conversion rates, and tool telemetry.
        </p>
      </div>

      {loading ? (
        <CardSkeleton count={4} />
      ) : (
        <>
          {/* Key Rates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Call Completion Rate"
              value={`${completionRate}%`}
              subtext={`${data?.connectedCalls ?? 0} connected / ${data?.totalCalls ?? 0} total calls`}
              badge="Reliability"
              badgeColor="green"
            />
            <MetricCard
              label="Avg Call Duration"
              value={`${data?.averageDurationSeconds ?? 0}s`}
              subtext="Average conversation length"
              badge="Voice Timing"
              badgeColor="blue"
            />
            <MetricCard
              label="Lead Qualification Rate"
              value={`${leadQualificationRate}%`}
              subtext={`${data?.qualifiedLeads ?? 0} qualified from ${data?.totalLeads ?? 0} leads`}
              badge="Funnel"
              badgeColor="purple"
            />
            <MetricCard
              label="Appointment Booking Rate"
              value={`${appointmentConfirmationRate}%`}
              subtext={`${data?.confirmedAppointments ?? 0} confirmed / ${data?.totalAppointments ?? 0} requested`}
              badge="Scheduling"
              badgeColor="amber"
            />
          </div>

          {/* AI Voice Pipeline Performance */}
          <div className="el-card p-6 bg-white space-y-4">
            <div className="flex items-center justify-between border-b border-[#f0efed] pb-3">
              <div>
                <h3 className="font-display-serif text-xl font-light text-[#0c0a09]">
                  AI Voice Pipeline Monotonic Latency Telemetry
                </h3>
                <p className="text-xs text-[#777169] mt-0.5">
                  End-to-end Sarvam STT &rarr; LLM Generation &rarr; Sarvam TTS first-chunk latency
                </p>
              </div>
              <span className="el-badge text-[10px]">Realtime Benchmarks</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-[#fafafa] rounded-xl border border-[#f0efed]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#777169] block">
                  Average Turn Latency
                </span>
                <p className="font-display-serif text-3xl font-light text-[#0c0a09] mt-1">
                  {data?.performance?.avgTurnLatencyMs ? `${data.performance.avgTurnLatencyMs} ms` : 'N/A'}
                </p>
                <span className="text-[11px] text-[#15803d] font-medium mt-1 block">LiveKit v1-mini detector</span>
              </div>

              <div className="p-4 bg-[#fafafa] rounded-xl border border-[#f0efed]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#777169] block">
                  Streaming STT Latency
                </span>
                <p className="font-display-serif text-3xl font-light text-[#0c0a09] mt-1">
                  {data?.performance?.avgSttLatencyMs ? `${data.performance.avgSttLatencyMs} ms` : 'N/A'}
                </p>
                <span className="text-[11px] text-[#777169] mt-1 block">Sarvam Saaras STT</span>
              </div>

              <div className="p-4 bg-[#fafafa] rounded-xl border border-[#f0efed]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#777169] block">
                  LLM Response Generation
                </span>
                <p className="font-display-serif text-3xl font-light text-[#0c0a09] mt-1">
                  {data?.performance?.avgLlmLatencyMs ? `${data.performance.avgLlmLatencyMs} ms` : 'N/A'}
                </p>
                <span className="text-[11px] text-[#777169] mt-1 block">Prompt Compiler v3</span>
              </div>

              <div className="p-4 bg-[#fafafa] rounded-xl border border-[#f0efed]">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#777169] block">
                  TTS First Chunk Synthesized
                </span>
                <p className="font-display-serif text-3xl font-light text-[#0c0a09] mt-1">
                  {data?.performance?.avgTtsLatencyMs ? `${data.performance.avgTtsLatencyMs} ms` : 'N/A'}
                </p>
                <span className="text-[11px] text-[#777169] mt-1 block">Bulbul Streaming Audio</span>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TrendBarChart
              data={data?.callTrend || []}
              title="Daily Call Trajectory"
              subtitle="Completed vs Missed vs Failed calls over the last 7 days"
            />

            <DonutBreakdown
              title="Spoken Language Distribution"
              subtitle="Multilingual conversation breakdown"
              items={(data?.languages || []).map((l, i) => ({
                label: l.language,
                count: l.count,
                color: ['#16a34a', '#2563eb', '#d97706', '#9333ea', '#dc2626'][i % 5],
              }))}
            />
          </div>

          {/* Funnel & Tool Execution Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LeadFunnelProgress
              funnel={
                data?.leadFunnel || {
                  new: 0,
                  contacted: 0,
                  qualified: 0,
                  closed: 0,
                }
              }
            />

            <ToolUsageList tools={data?.toolUsage || []} />
          </div>
        </>
      )}
    </div>
  );
}
