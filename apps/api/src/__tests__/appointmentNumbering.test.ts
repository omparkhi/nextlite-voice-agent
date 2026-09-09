import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tenantAppointmentCounters, appointments } from '../db/schema';

// Mock DB
const { mockInsert, mockSelect, mockQuery } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockQuery: {
    agents: { findFirst: vi.fn() },
    deployments: { findFirst: vi.fn() },
    callSessions: { findFirst: vi.fn() },
    appointments: { findFirst: vi.fn() },
  },
}));

vi.mock('../db', () => ({
  db: {
    query: mockQuery,
    select: (args: any) => mockSelect(args),
    insert: (table: any) => ({
      values: (val: any) => mockInsert(table, val),
    }),
  },
}));

vi.mock('../lib/logger', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { appointmentService } from '../services/appointment';

describe('Concurrency-Safe Tenant-Scoped Appointment Numbering', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const agentA = '33333333-3333-4333-8333-333333333333';
  const agentB = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.agents.findFirst.mockResolvedValue({ id: agentA, tenantId: tenantA });
  });

  it('1. generates sequential human-friendly appointment number A-001 for first appointment', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });

    let counterInserted = false;
    mockInsert.mockImplementation((table: any, val: any) => {
      if (table === tenantAppointmentCounters) {
        counterInserted = true;
        return {
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ lastNumber: 1 }]),
          }),
        };
      }
      // Insert into appointments
      return {
        returning: vi.fn().mockResolvedValue([
          {
            id: 'apt-001',
            ...val,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      };
    });

    const apt = await appointmentService.createAppointment({
      tenantId: tenantA,
      agentId: agentA,
      customerName: 'Aarav Patel',
      customerPhone: '+919876543210',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '10:00',
    });

    expect(counterInserted).toBe(true);
    expect(apt.appointmentNumber).toBe('A-001');
    expect(apt.status).toBe('REQUESTED');
  });

  it('2. generates A-002 on second appointment using PostgreSQL atomic counter', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    });

    mockInsert.mockImplementation((table: any, val: any) => {
      if (table === tenantAppointmentCounters) {
        return {
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ lastNumber: 2 }]),
          }),
        };
      }
      return {
        returning: vi.fn().mockResolvedValue([
          {
            id: 'apt-002',
            ...val,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      };
    });

    const apt = await appointmentService.createAppointment({
      tenantId: tenantA,
      agentId: agentA,
      customerName: 'Priya Sharma',
      customerPhone: '+919876543211',
      title: 'Doctor Consultation',
      bookingDate: '2026-09-09',
      bookingTime: '11:00',
    });

    expect(apt.appointmentNumber).toBe('A-002');
  });

  it('3. isolates counters per tenant: Tenant B receives A-001 independently', async () => {
    mockQuery.agents.findFirst.mockResolvedValue({ id: agentB, tenantId: tenantB });

    let targetedTenantId: string | undefined;
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    });

    mockInsert.mockImplementation((table: any, val: any) => {
      if (table === tenantAppointmentCounters) {
        targetedTenantId = val.tenantId;
        return {
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ lastNumber: 1 }]),
          }),
        };
      }
      return {
        returning: vi.fn().mockResolvedValue([
          {
            id: 'apt-b-001',
            ...val,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      };
    });

    const aptB = await appointmentService.createAppointment({
      tenantId: tenantB,
      agentId: agentB,
      customerName: 'Rohan Verma',
      customerPhone: '+919876543220',
      title: 'Site Visit',
      bookingDate: '2026-09-10',
      bookingTime: '14:00',
    });

    expect(targetedTenantId).toBe(tenantB);
    expect(aptB.appointmentNumber).toBe('A-001');
  });

  it('4. preserves explicit appointmentNumber if already provided', async () => {
    mockInsert.mockImplementation((table: any, val: any) => {
      return {
        returning: vi.fn().mockResolvedValue([
          {
            id: 'apt-custom',
            ...val,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      };
    });

    const apt = await appointmentService.createAppointment({
      tenantId: tenantA,
      agentId: agentA,
      customerName: 'Ananya Roy',
      customerPhone: '+919876543221',
      title: 'Demo Class',
      bookingDate: '2026-09-10',
      bookingTime: '15:00',
      appointmentNumber: 'A-999',
    });

    expect(apt.appointmentNumber).toBe('A-999');
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
