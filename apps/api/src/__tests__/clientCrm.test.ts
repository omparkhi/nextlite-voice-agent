import { describe, it, expect, beforeEach, vi } from 'vitest';
import { leadService } from '../services/lead';
import { appointmentService } from '../services/appointment';
import { whatsAppService } from '../services/whatsapp';
import { followUpService } from '../services/followUp';
import { analyticsService } from '../services/analytics';
import { Request, Response, NextFunction } from 'express';

// Mock DB
vi.mock('../db', () => {
  const mockDb = {
    query: {
      agents: { findFirst: vi.fn(), findMany: vi.fn() },
      deployments: { findFirst: vi.fn(), findMany: vi.fn() },
      callSessions: { findFirst: vi.fn(), findMany: vi.fn() },
      leads: { findFirst: vi.fn(), findMany: vi.fn() },
      appointments: { findFirst: vi.fn(), findMany: vi.fn() },
      phoneNumbers: { findFirst: vi.fn(), findMany: vi.fn() },
      followUps: { findFirst: vi.fn(), findMany: vi.fn() },
      tenants: { findFirst: vi.fn() },
      tenantAppointmentCounters: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  };
  return { db: mockDb };
});

import { db } from '../db';

describe('Module 1B: Client CRM, Analytics & WhatsApp Follow-up Services', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const agentA = '33333333-3333-4333-8333-333333333333';
  const leadA = '44444444-4444-4444-8444-444444444444';
  const appointmentA = '55555555-5555-4555-8555-555555555555';
  const callSessionA = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Lead & Appointment Updates with Tenant Isolation', () => {
    it('should update lead status and notes when tenant owns the lead', async () => {
      (db.query.leads.findFirst as any).mockResolvedValue({
        id: leadA,
        tenantId: tenantA,
        status: 'NEW',
        notes: null,
      });

      const updatedLead = {
        id: leadA,
        tenantId: tenantA,
        status: 'QUALIFIED',
        notes: 'Followed up via WhatsApp',
        updatedAt: new Date(),
      };

      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedLead]),
          }),
        }),
      });

      const result = await leadService.updateLead(leadA, tenantA, {
        status: 'QUALIFIED',
        notes: 'Followed up via WhatsApp',
      });

      expect(result.status).toBe('QUALIFIED');
      expect(result.notes).toBe('Followed up via WhatsApp');
    });

    it('should reject lead update if lead belongs to another tenant', async () => {
      (db.query.leads.findFirst as any).mockResolvedValue(null);

      await expect(
        leadService.updateLead(leadA, tenantB, { status: 'QUALIFIED' })
      ).rejects.toThrow(`Lead ${leadA} not found for tenant ${tenantB}`);
    });

    it('should update appointment status when tenant owns the appointment', async () => {
      (db.query.appointments.findFirst as any).mockResolvedValue({
        id: appointmentA,
        tenantId: tenantA,
        appointmentNumber: 'A-001',
        status: 'REQUESTED',
      });

      const updatedAppointment = {
        id: appointmentA,
        tenantId: tenantA,
        appointmentNumber: 'A-001',
        status: 'CONFIRMED',
        updatedAt: new Date(),
      };

      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedAppointment]),
          }),
        }),
      });

      const result = await appointmentService.updateAppointment(appointmentA, tenantA, {
        status: 'CONFIRMED',
      });

      expect(result.status).toBe('CONFIRMED');
      expect(result.appointmentNumber).toBe('A-001');
    });
  });

  describe('2. WhatsApp Follow-up Service & Demo Provider', () => {
    it('should dispatch demo WhatsApp message and persist to follow_ups table', async () => {
      (db.query.appointments.findFirst as any).mockResolvedValue({
        id: appointmentA,
        tenantId: tenantA,
      });

      const mockFollowUp = {
        id: 'followup-001',
        tenantId: tenantA,
        appointmentId: appointmentA,
        customerPhone: '+919876543210',
        channel: 'WHATSAPP',
        provider: 'DEMO',
        messageType: 'APPOINTMENT_CONFIRMATION',
        messageText: 'Your appointment A-001 is confirmed.',
        status: 'DELIVERED',
        isDemo: true,
        providerMessageId: 'demo_wa_123',
        sentAt: new Date(),
        deliveredAt: new Date(),
        createdAt: new Date(),
      };

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockFollowUp]),
        }),
      });

      const response = await whatsAppService.sendWhatsApp(tenantA, {
        appointmentId: appointmentA,
        customerPhone: '+919876543210',
        message: 'Your appointment A-001 is confirmed.',
        messageType: 'APPOINTMENT_CONFIRMATION',
        provider: 'DEMO',
      });

      expect(response.success).toBe(true);
      expect(response.isDemo).toBe(true);
      expect(response.status).toBe('DELIVERED');
      expect(response.provider).toBe('DEMO');
      expect(response.followUpId).toBe('followup-001');
    });

    it('should reject WhatsApp dispatch if referenced appointment belongs to another tenant', async () => {
      (db.query.appointments.findFirst as any).mockResolvedValue(null);

      await expect(
        whatsAppService.sendWhatsApp(tenantA, {
          appointmentId: appointmentA,
          customerPhone: '+919876543210',
          message: 'Test message',
        })
      ).rejects.toThrow(`Appointment ${appointmentA} does not belong to tenant ${tenantA}`);
    });
  });

  describe('3. Analytics Aggregation Service', () => {
    it('should aggregate metrics from database calls, leads, and appointments', async () => {
      (db.query.callSessions.findMany as any).mockResolvedValue([
        {
          id: 'call-1',
          tenantId: tenantA,
          status: 'COMPLETED',
          direction: 'INBOUND',
          durationSeconds: 120,
          primaryLanguage: 'en-IN',
          toolsUsed: ['book_appointment'],
          metricsJson: { turnLatencyMs: 850, sttLatencyMs: 300, llmLatencyMs: 400, ttsLatencyMs: 150 },
          createdAt: new Date(),
        },
        {
          id: 'call-2',
          tenantId: tenantA,
          status: 'FAILED',
          direction: 'OUTBOUND',
          durationSeconds: 10,
          primaryLanguage: 'hi-IN',
          toolsUsed: [],
          createdAt: new Date(),
        },
      ]);

      (db.query.leads.findMany as any).mockResolvedValue([
        { id: 'lead-1', tenantId: tenantA, status: 'QUALIFIED' },
        { id: 'lead-2', tenantId: tenantA, status: 'NEW' },
      ]);

      (db.query.appointments.findMany as any).mockResolvedValue([
        { id: 'appt-1', tenantId: tenantA, status: 'CONFIRMED' },
        { id: 'appt-2', tenantId: tenantA, status: 'REQUESTED' },
      ]);

      (db.query.followUps.findMany as any).mockResolvedValue([
        { id: 'fu-1', tenantId: tenantA, status: 'DELIVERED' },
      ]);

      const overview = await analyticsService.getOverview(tenantA);

      expect(overview.totalCalls).toBe(2);
      expect(overview.connectedCalls).toBe(1);
      expect(overview.totalDurationSeconds).toBe(130);
      expect(overview.averageDurationSeconds).toBe(65);
      expect(overview.totalLeads).toBe(2);
      expect(overview.qualifiedLeads).toBe(1);
      expect(overview.totalAppointments).toBe(2);
      expect(overview.confirmedAppointments).toBe(1);
      expect(overview.requestedAppointments).toBe(1);
      expect(overview.sentFollowUps).toBe(1);
      expect(overview.callOutcomes.completed).toBe(1);
      expect(overview.callOutcomes.failed).toBe(1);
      expect(overview.directions.inbound).toBe(1);
      expect(overview.directions.outbound).toBe(1);
      expect(overview.toolUsage).toEqual([{ toolName: 'book_appointment', count: 1 }]);
      expect(overview.performance.avgTurnLatencyMs).toBe(850);
    });
  });
});
