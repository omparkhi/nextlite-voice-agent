import { db } from '../db';
import { callSessions, leads, appointments, followUps } from '../db/schema';
import { eq, and, sql, desc, gte } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import { AnalyticsOverview } from '@nextlite/shared';

const logger = createChildLogger({ module: 'analytics-service' });

export class AnalyticsService {
  async getOverview(tenantId: string): Promise<AnalyticsOverview> {
    try {
      // 1. Fetch Call Sessions for this tenant
      const allCalls = await db.query.callSessions.findMany({
        where: eq(callSessions.tenantId, tenantId),
        orderBy: [desc(callSessions.createdAt)],
      });

      // 2. Fetch Leads for this tenant
      const allLeads = await db.query.leads.findMany({
        where: eq(leads.tenantId, tenantId),
      });

      // 3. Fetch Appointments for this tenant
      const allAppointments = await db.query.appointments.findMany({
        where: eq(appointments.tenantId, tenantId),
      });

      // 4. Fetch Follow-ups for this tenant
      const allFollowUps = await db.query.followUps.findMany({
        where: eq(followUps.tenantId, tenantId),
      });

      // Call metrics calculations
      const totalCalls = allCalls.length;
      let connectedCalls = 0;
      let totalDurationSeconds = 0;
      const callOutcomes = { completed: 0, missed: 0, failed: 0, active: 0 };
      const directions = { inbound: 0, outbound: 0, webTest: 0 };
      const languageMap: Record<string, number> = {};
      const toolMap: Record<string, number> = {};
      let totalTurnLatencyMs = 0;
      let totalSttLatencyMs = 0;
      let totalLlmLatencyMs = 0;
      let totalTtsLatencyMs = 0;
      let metricCount = 0;

      // Group calls by date for 7-day trend
      const dateMap: Record<string, { total: number; completed: number; missed: number; failed: number }> = {};
      
      // Initialize past 7 days dates
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dateMap[key] = { total: 0, completed: 0, missed: 0, failed: 0 };
      }

      for (const call of allCalls) {
        totalDurationSeconds += call.durationSeconds || 0;
        if (call.status === 'COMPLETED') {
          connectedCalls++;
          callOutcomes.completed++;
        } else if (call.status === 'MISSED') {
          callOutcomes.missed++;
        } else if (call.status === 'FAILED') {
          callOutcomes.failed++;
        } else if (call.status === 'ACTIVE') {
          callOutcomes.active++;
        }

        if (call.direction === 'INBOUND') directions.inbound++;
        else if (call.direction === 'OUTBOUND') directions.outbound++;
        else if (call.direction === 'WEB_TEST') directions.webTest++;

        const lang = call.primaryLanguage || 'en-IN';
        languageMap[lang] = (languageMap[lang] || 0) + 1;

        // Tool usage aggregation
        if (Array.isArray(call.toolsUsed)) {
          for (const t of call.toolsUsed) {
            const name = typeof t === 'string' ? t : t.toolName || t.name;
            if (name) {
              toolMap[name] = (toolMap[name] || 0) + 1;
            }
          }
        }

        // Metrics aggregation
        if (call.metricsJson && typeof call.metricsJson === 'object') {
          const m = call.metricsJson as any;
          if (m.turnLatencyMs || m.e2eLatencyMs || m.sttLatencyMs || m.llmLatencyMs || m.ttsLatencyMs) {
            totalTurnLatencyMs += m.turnLatencyMs || m.e2eLatencyMs || 0;
            totalSttLatencyMs += m.sttLatencyMs || 0;
            totalLlmLatencyMs += m.llmLatencyMs || 0;
            totalTtsLatencyMs += m.ttsLatencyMs || 0;
            metricCount++;
          }
        }

        // Date grouping
        if (call.createdAt) {
          const dKey = new Date(call.createdAt).toISOString().split('T')[0];
          if (dateMap[dKey]) {
            dateMap[dKey].total++;
            if (call.status === 'COMPLETED') dateMap[dKey].completed++;
            else if (call.status === 'MISSED') dateMap[dKey].missed++;
            else if (call.status === 'FAILED') dateMap[dKey].failed++;
          }
        }
      }

      const averageDurationSeconds = totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0;

      // Leads metrics
      const totalLeads = allLeads.length;
      let qualifiedLeads = 0;
      const leadFunnel = { new: 0, contacted: 0, qualified: 0, closed: 0 };
      for (const lead of allLeads) {
        if (lead.status === 'NEW') leadFunnel.new++;
        else if (lead.status === 'CONTACTED') leadFunnel.contacted++;
        else if (lead.status === 'QUALIFIED') {
          leadFunnel.qualified++;
          qualifiedLeads++;
        } else if (lead.status === 'CLOSED') leadFunnel.closed++;
      }

      // Appointments metrics
      const totalAppointments = allAppointments.length;
      let confirmedAppointments = 0;
      let requestedAppointments = 0;
      const appointmentStatus = { requested: 0, confirmed: 0, cancelled: 0 };
      for (const appt of allAppointments) {
        if (appt.status === 'CONFIRMED') {
          confirmedAppointments++;
          appointmentStatus.confirmed++;
        } else if (appt.status === 'REQUESTED') {
          requestedAppointments++;
          appointmentStatus.requested++;
        } else if (appt.status === 'CANCELLED') {
          appointmentStatus.cancelled++;
        }
      }

      // Follow-ups metrics
      let pendingFollowUps = 0;
      let sentFollowUps = 0;
      for (const f of allFollowUps) {
        if (f.status === 'PENDING') pendingFollowUps++;
        else sentFollowUps++;
      }

      // Format languages
      const languages = Object.entries(languageMap).map(([language, count]) => ({
        language,
        count,
        percentage: totalCalls > 0 ? Math.round((count / totalCalls) * 100) : 0,
      }));

      // Format tools
      const toolUsage = Object.entries(toolMap).map(([toolName, count]) => ({
        toolName,
        count,
      }));

      // Format callTrend
      const callTrend = Object.entries(dateMap).map(([date, counts]) => ({
        date,
        ...counts,
      }));

      return {
        totalCalls,
        connectedCalls,
        totalDurationSeconds,
        averageDurationSeconds,
        totalLeads,
        qualifiedLeads,
        totalAppointments,
        confirmedAppointments,
        requestedAppointments,
        pendingFollowUps,
        sentFollowUps,
        callTrend,
        callOutcomes,
        leadFunnel,
        appointmentStatus,
        languages,
        directions,
        toolUsage,
        performance: {
          avgTurnLatencyMs: metricCount > 0 ? Math.round(totalTurnLatencyMs / metricCount) : undefined,
          avgSttLatencyMs: metricCount > 0 ? Math.round(totalSttLatencyMs / metricCount) : undefined,
          avgLlmLatencyMs: metricCount > 0 ? Math.round(totalLlmLatencyMs / metricCount) : undefined,
          avgTtsLatencyMs: metricCount > 0 ? Math.round(totalTtsLatencyMs / metricCount) : undefined,
        },
      };
    } catch (error) {
      logger.error({ err: error, tenantId }, 'Error aggregating analytics overview');
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();
