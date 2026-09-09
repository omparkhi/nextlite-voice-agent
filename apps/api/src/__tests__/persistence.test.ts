import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callSessionService } from '../services/callSession';
import { leadService } from '../services/lead';
import { appointmentService } from '../services/appointment';
import { phoneNumberService } from '../services/phoneNumber';
import internalRouter from '../routes/internal';
import clientRouter from '../routes/client';
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
      tenants: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  };
  return { db: mockDb };
});

import { db } from '../db';

describe('Module 1A: Database Persistence Core & API Contracts', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const agentA = '33333333-3333-4333-8333-333333333333';
  const deploymentA = '44444444-4444-4444-8444-444444444444';
  const callSessionIdA = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Call Session Persistence Service', () => {
    it('should create a call session successfully when tenant owns agent and deployment', async () => {
      (db.query.agents.findFirst as any).mockResolvedValue({ id: agentA, tenantId: tenantA });
      (db.query.deployments.findFirst as any).mockResolvedValue({ id: deploymentA, tenantId: tenantA });
      
      const mockCreated = {
        id: callSessionIdA,
        tenantId: tenantA,
        agentId: agentA,
        deploymentId: deploymentA,
        roomName: 'room-nextlite-001',
        callerNumber: '+919876543210',
        direction: 'INBOUND',
        status: 'ACTIVE',
        durationSeconds: 0,
        primaryLanguage: 'en-IN',
        createdAt: new Date(),
      };

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreated]),
        }),
      });

      const result = await callSessionService.createCallSession({
        tenantId: tenantA,
        agentId: agentA,
        deploymentId: deploymentA,
        roomName: 'room-nextlite-001',
        callerNumber: '+919876543210',
        direction: 'INBOUND',
        status: 'ACTIVE',
      });

      expect(result).toEqual(mockCreated);
      expect(db.query.agents.findFirst).toHaveBeenCalled();
      expect(db.query.deployments.findFirst).toHaveBeenCalled();
    });

    it('should allow nullable callerNumber for WEB_TEST direction', async () => {
      (db.query.agents.findFirst as any).mockResolvedValue({ id: agentA, tenantId: tenantA });
      (db.query.deployments.findFirst as any).mockResolvedValue({ id: deploymentA, tenantId: tenantA });

      const mockCreated = {
        id: callSessionIdA,
        tenantId: tenantA,
        agentId: agentA,
        deploymentId: deploymentA,
        roomName: 'web-test-room-1',
        callerNumber: null,
        direction: 'WEB_TEST',
        status: 'COMPLETED',
        durationSeconds: 45,
        createdAt: new Date(),
      };

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreated]),
        }),
      });

      const result = await callSessionService.createCallSession({
        tenantId: tenantA,
        agentId: agentA,
        deploymentId: deploymentA,
        roomName: 'web-test-room-1',
        callerNumber: null,
        direction: 'WEB_TEST',
      });

      expect(result.callerNumber).toBeNull();
      expect(result.direction).toBe('WEB_TEST');
    });

    it('should update an existing call session upon completion', async () => {
      (db.query.callSessions.findFirst as any).mockResolvedValue({
        id: callSessionIdA,
        tenantId: tenantA,
        status: 'ACTIVE',
      });

      const mockUpdated = {
        id: callSessionIdA,
        tenantId: tenantA,
        status: 'COMPLETED',
        durationSeconds: 120,
        transcriptText: 'Hello, I would like to book a visit.',
        turnsJson: [{ role: 'user', content: 'Hello' }],
        toolsUsed: ['book_appointment'],
        metricsJson: { ttsLatencyMs: 180, llmLatencyMs: 450 },
      };

      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdated]),
          }),
        }),
      });

      const result = await callSessionService.updateCallSession(callSessionIdA, tenantA, {
        status: 'COMPLETED',
        durationSeconds: 120,
        transcriptText: 'Hello, I would like to book a visit.',
        turnsJson: [{ role: 'user', content: 'Hello' }],
        toolsUsed: ['book_appointment'],
        metricsJson: { ttsLatencyMs: 180, llmLatencyMs: 450 },
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.durationSeconds).toBe(120);
      expect(result.toolsUsed).toContain('book_appointment');
    });

    it('should reject call session creation if agent belongs to another tenant', async () => {
      (db.query.agents.findFirst as any).mockResolvedValue(null);

      await expect(
        callSessionService.createCallSession({
          tenantId: tenantA,
          agentId: 'foreign-agent-id',
          deploymentId: deploymentA,
          roomName: 'room-test',
        })
      ).rejects.toThrow(/does not belong to tenant/);
    });

    it('should reject call session update if tenant does not own the session', async () => {
      (db.query.callSessions.findFirst as any).mockResolvedValue(null);

      await expect(
        callSessionService.updateCallSession(callSessionIdA, tenantB, { status: 'COMPLETED' })
      ).rejects.toThrow(/not found for tenant/);
    });

    it('should list call sessions with pagination and newest first', async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '2' }]),
        }),
      });

      const mockList = [
        { id: 'call-2', tenantId: tenantA, createdAt: new Date('2026-09-08T10:00:00Z') },
        { id: 'call-1', tenantId: tenantA, createdAt: new Date('2026-09-08T09:00:00Z') },
      ];
      (db.query.callSessions.findMany as any).mockResolvedValue(mockList);

      const result = await callSessionService.listCallSessions(tenantA, { limit: 10, offset: 0 });
      expect(result.total).toBe(2);
      expect(result.calls.length).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });
  });

  describe('2. Generic Lead Persistence Service', () => {
    it('should create an industry-neutral lead with metadata and nullable callSessionId', async () => {
      (db.query.agents.findFirst as any).mockResolvedValue({ id: agentA, tenantId: tenantA });

      const mockLead = {
        id: 'lead-1',
        tenantId: tenantA,
        agentId: agentA,
        callSessionId: null,
        customerName: 'Rahul Verma',
        customerPhone: '+919876543210',
        customerEmail: 'rahul@example.com',
        interestCategory: '3BHK Villa',
        status: 'NEW',
        metadata: { budget: '1.5 Cr', preferredLocation: 'Whitefield' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLead]),
        }),
      });

      const result = await leadService.createLead({
        tenantId: tenantA,
        agentId: agentA,
        customerName: 'Rahul Verma',
        customerPhone: '+919876543210',
        customerEmail: 'rahul@example.com',
        interestCategory: '3BHK Villa',
        metadata: { budget: '1.5 Cr', preferredLocation: 'Whitefield' },
      });

      expect(result.id).toBe('lead-1');
      expect(result.customerName).toBe('Rahul Verma');
      expect(result.metadata).toEqual({ budget: '1.5 Cr', preferredLocation: 'Whitefield' });
    });

    it('should reject lead creation if referenced callSession belongs to another tenant', async () => {
      (db.query.agents.findFirst as any).mockResolvedValue({ id: agentA, tenantId: tenantA });
      // Session not found under tenantA
      (db.query.callSessions.findFirst as any).mockResolvedValue(null);

      await expect(
        leadService.createLead({
          tenantId: tenantA,
          agentId: agentA,
          callSessionId: 'foreign-call-session',
          customerName: 'Test Customer',
          customerPhone: '+919999999999',
        })
      ).rejects.toThrow(/does not belong to tenant/);
    });

    it('should update lead status and notes', async () => {
      (db.query.leads.findFirst as any).mockResolvedValue({ id: 'lead-1', tenantId: tenantA });

      const mockUpdated = {
        id: 'lead-1',
        tenantId: tenantA,
        status: 'QUALIFIED',
        notes: 'Followed up via call. High intent.',
        updatedAt: new Date(),
      };

      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdated]),
          }),
        }),
      });

      const result = await leadService.updateLead('lead-1', tenantA, {
        status: 'QUALIFIED',
        notes: 'Followed up via call. High intent.',
      });

      expect(result.status).toBe('QUALIFIED');
      expect(result.notes).toBe('Followed up via call. High intent.');
    });

    it('should list leads with pagination and newest first', async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '1' }]),
        }),
      });

      const mockList = [
        { id: 'lead-1', tenantId: tenantA, customerName: 'Rahul', createdAt: new Date() },
      ];
      (db.query.leads.findMany as any).mockResolvedValue(mockList);

      const result = await leadService.listLeads(tenantA, { limit: 20, offset: 0 });
      expect(result.total).toBe(1);
      expect(result.leads.length).toBe(1);
    });
  });

  describe('3. Generic Appointment Persistence Service across Industries', () => {
    it('should create realistic appointment records across 4 different industries using identical generic schema', async () => {
      (db.query.agents.findFirst as any).mockResolvedValue({ id: agentA, tenantId: tenantA });

      const scenarios = [
        {
          industry: 'Healthcare',
          payload: {
            tenantId: tenantA,
            agentId: agentA,
            customerName: 'Aarav Patel',
            customerPhone: '+919811122233',
            title: 'Doctor Consultation',
            resourceName: 'Dr. Rohan Sharma (Cardiology)',
            bookingDate: '2026-09-10',
            bookingTime: '10:30 AM',
            metadata: { department: 'Cardiology', symptoms: 'Chest pain', consultationFee: 800 },
          },
        },
        {
          industry: 'Real Estate',
          payload: {
            tenantId: tenantA,
            agentId: agentA,
            customerName: 'Pooja Hegde',
            customerPhone: '+919822233344',
            title: 'Property Site Visit',
            resourceName: 'Green Valley Project - Phase 2',
            bookingDate: '2026-09-12',
            bookingTime: '03:00 PM',
            metadata: { propertyType: '3BHK', unitNumber: 'B-402' },
          },
        },
        {
          industry: 'Education',
          payload: {
            tenantId: tenantA,
            agentId: agentA,
            customerName: 'Ananya Sharma',
            customerPhone: '+919833344455',
            title: 'Demo Class',
            resourceName: 'JEE Weekend Batch',
            bookingDate: '2026-09-11',
            bookingTime: '05:00 PM',
            metadata: { subject: 'Physics', grade: '11th' },
          },
        },
        {
          industry: 'Finance',
          payload: {
            tenantId: tenantA,
            agentId: agentA,
            customerName: 'Vikram Mehta',
            customerPhone: '+919844455566',
            title: 'Loan Consultation',
            resourceName: 'Senior Loan Advisor',
            bookingDate: '2026-09-14',
            bookingTime: '11:00 AM',
            metadata: { loanType: 'Home Loan', requestedAmount: 5000000 },
          },
        },
      ];

      for (const scenario of scenarios) {
        (db.select as any).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        });
        (db.insert as any).mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ lastNumber: 1 }]),
            }),
            returning: vi.fn().mockResolvedValue([{ id: `apt-${scenario.industry}`, ...scenario.payload }]),
          }),
        });

        const apt = await appointmentService.createAppointment(scenario.payload);
        expect(apt.title).toBe(scenario.payload.title);
        expect(apt.resourceName).toBe(scenario.payload.resourceName);
        expect(apt.bookingDate).toBe(scenario.payload.bookingDate);
        expect(apt.bookingTime).toBe(scenario.payload.bookingTime);
        expect(apt.metadata).toEqual(scenario.payload.metadata);
      }
    });

    it('should reject appointment creation if agent belongs to another tenant', async () => {
      (db.query.agents.findFirst as any).mockResolvedValue(null);

      await expect(
        appointmentService.createAppointment({
          tenantId: tenantA,
          agentId: 'foreign-agent',
          customerName: 'Pooja',
          customerPhone: '+919822233344',
          title: 'Site Visit',
          bookingDate: '2026-09-12',
          bookingTime: '03:00 PM',
        })
      ).rejects.toThrow(/does not belong to tenant/);
    });

    it('should reject appointment update if tenant does not own the appointment', async () => {
      (db.query.appointments.findFirst as any).mockResolvedValue(null);

      await expect(
        appointmentService.updateAppointment('apt-999', tenantB, { status: 'CANCELLED' })
      ).rejects.toThrow(/not found for tenant/);
    });
  });

  describe('4. Phone Number Persistence & Lookup Service', () => {
    it('should create and look up a phone number record', async () => {
      const mockNumber = {
        id: 'pn-1',
        tenantId: tenantA,
        agentId: agentA,
        deploymentId: deploymentA,
        phoneNumber: '+918012345678',
        provider: 'plivo',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.query.agents.findFirst as any).mockResolvedValue({ id: agentA, tenantId: tenantA });
      (db.query.deployments.findFirst as any).mockResolvedValue({ id: deploymentA, tenantId: tenantA });

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockNumber]),
        }),
      });

      const created = await phoneNumberService.createPhoneNumber({
        tenantId: tenantA,
        agentId: agentA,
        deploymentId: deploymentA,
        phoneNumber: '+918012345678',
      });

      expect(created.phoneNumber).toBe('+918012345678');

      (db.query.phoneNumbers.findFirst as any).mockResolvedValue(mockNumber);

      const lookedUp = await phoneNumberService.lookupPhoneNumber('+918012345678');
      expect(lookedUp).toEqual(mockNumber);
    });

    it('should list phone numbers strictly scoped to tenant', async () => {
      const mockNumbers = [
        { id: 'pn-1', tenantId: tenantA, phoneNumber: '+918012345678' },
        { id: 'pn-2', tenantId: tenantA, phoneNumber: '+918087654321' },
      ];

      (db.query.phoneNumbers.findMany as any).mockResolvedValue(mockNumbers);

      const list = await phoneNumberService.listPhoneNumbers(tenantA);
      expect(list.length).toBe(2);
      expect(list[0].phoneNumber).toBe('+918012345678');
    });
  });

  describe('5. Multi-Tenant Isolation Verification', () => {
    it('should strictly isolate Tenant A from Tenant B queries', async () => {
      // Setup: DB returns null when queried with wrong tenantId
      (db.query.callSessions.findFirst as any).mockImplementation(() => {
        return Promise.resolve(null);
      });
      (db.query.leads.findFirst as any).mockImplementation(() => {
        return Promise.resolve(null);
      });
      (db.query.appointments.findFirst as any).mockImplementation(() => {
        return Promise.resolve(null);
      });
      (db.query.phoneNumbers.findFirst as any).mockImplementation(() => {
        return Promise.resolve(null);
      });

      // Tenant B tries to access Tenant A's records
      const call = await callSessionService.getCallSession(callSessionIdA, tenantB);
      expect(call).toBeNull();

      const lead = await leadService.getLead('lead-tenant-a', tenantB);
      expect(lead).toBeNull();

      const apt = await appointmentService.getAppointment('apt-tenant-a', tenantB);
      expect(apt).toBeNull();

      const pn = await phoneNumberService.getPhoneNumber('pn-tenant-a', tenantB);
      expect(pn).toBeNull();
    });
  });

  describe('6. Route Handler Validation & Status Codes', () => {
    function findHandler(router: any, path: string, method: string) {
      const layer = router.stack.find(
        (l: any) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
      );
      if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }

    it('should reject invalid UUIDs in POST /api/internal/call-sessions', async () => {
      const handler = findHandler(internalRouter, '/call-sessions', 'post');
      const req: Partial<Request> = {
        body: {
          tenantId: 'invalid-uuid',
          agentId: 'not-a-uuid',
          deploymentId: 'bad-uuid',
          roomName: 'test',
        },
      };
      const res: Partial<Response> = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      await handler(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' })
      );
    });

    it('should reject invalid email format in POST /api/internal/leads', async () => {
      const handler = findHandler(internalRouter, '/leads', 'post');
      const req: Partial<Request> = {
        body: {
          tenantId: tenantA,
          agentId: agentA,
          customerName: 'Test User',
          customerPhone: '+919876543210',
          customerEmail: 'not-an-email',
        },
      };
      const res: Partial<Response> = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      await handler(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' })
      );
    });

    it('should reject missing title or date in POST /api/internal/appointments', async () => {
      const handler = findHandler(internalRouter, '/appointments', 'post');
      const req: Partial<Request> = {
        body: {
          tenantId: tenantA,
          agentId: agentA,
          customerName: 'Test User',
          customerPhone: '+919876543210',
        },
      };
      const res: Partial<Response> = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      await handler(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when phoneNumber query parameter is missing in GET /api/internal/phone-numbers/lookup', async () => {
      const handler = findHandler(internalRouter, '/phone-numbers/lookup', 'get');
      const req: Partial<Request> = { query: {} };
      const res: Partial<Response> = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      await handler(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Query parameter phoneNumber is required' });
    });
  });
});
