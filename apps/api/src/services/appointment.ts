import { db } from '../db';
import { appointments, agents, callSessions, tenantAppointmentCounters } from '../db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import { Appointment, CreateAppointmentRequest } from '@nextlite/shared';

const logger = createChildLogger({ module: 'appointment-service' });

export interface ListAppointmentsOptions {
  limit?: number;
  offset?: number;
  agentId?: string;
  status?: string;
  bookingDate?: string;
}

export class AppointmentService {
  async createAppointment(data: CreateAppointmentRequest): Promise<Appointment> {
    // 1. Verify tenant ownership of agent
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, data.agentId), eq(agents.tenantId, data.tenantId)),
    });
    if (!agent) {
      throw new Error(`Agent ${data.agentId} does not belong to tenant ${data.tenantId}`);
    }

    // 2. If callSessionId is provided, verify tenant ownership of callSession
    if (data.callSessionId) {
      const session = await db.query.callSessions.findFirst({
        where: and(eq(callSessions.id, data.callSessionId), eq(callSessions.tenantId, data.tenantId)),
      });
      if (!session) {
        throw new Error(`Call session ${data.callSessionId} does not belong to tenant ${data.tenantId}`);
      }
    }

    const now = new Date();

    // 3. Concurrency-safe, atomic PostgreSQL-backed tenant-scoped appointment number generation
    let effectiveAppointmentNumber = data.appointmentNumber?.trim();
    if (!effectiveAppointmentNumber) {
      const existingCountResult = await db
        .select({ count: count() })
        .from(appointments)
        .where(eq(appointments.tenantId, data.tenantId));
      const existingCount = Number(existingCountResult[0]?.count || 0);

      const [counter] = await db
        .insert(tenantAppointmentCounters)
        .values({
          tenantId: data.tenantId,
          lastNumber: existingCount + 1,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tenantAppointmentCounters.tenantId,
          set: {
            lastNumber: sql`${tenantAppointmentCounters.lastNumber} + 1`,
            updatedAt: now,
          },
        })
        .returning({ lastNumber: tenantAppointmentCounters.lastNumber });

      const seqNumber = counter?.lastNumber || 1;
      effectiveAppointmentNumber = `A-${String(seqNumber).padStart(3, '0')}`;
    }

    const [appointment] = await db
      .insert(appointments)
      .values({
        tenantId: data.tenantId,
        agentId: data.agentId,
        callSessionId: data.callSessionId || null,
        appointmentNumber: effectiveAppointmentNumber,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        title: data.title,
        resourceName: data.resourceName || null,
        bookingDate: data.bookingDate,
        bookingTime: data.bookingTime,
        status: (data.status as any) || 'REQUESTED',
        notes: data.notes || null,
        metadata: data.metadata || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    logger.info(
      {
        appointmentId: appointment.id,
        appointmentNumber: appointment.appointmentNumber,
        tenantId: data.tenantId,
        agentId: data.agentId,
      },
      'Appointment created',
    );
    return appointment as unknown as Appointment;
  }

  async updateAppointment(
    appointmentId: string,
    tenantId: string,
    updates: Partial<Omit<CreateAppointmentRequest, 'tenantId' | 'agentId'>> & {
      status?: string;
    }
  ): Promise<Appointment> {
    const existing = await db.query.appointments.findFirst({
      where: and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)),
    });

    if (!existing) {
      throw new Error(`Appointment ${appointmentId} not found for tenant ${tenantId}`);
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (updates.customerName !== undefined) updatePayload.customerName = updates.customerName;
    if (updates.customerPhone !== undefined) updatePayload.customerPhone = updates.customerPhone;
    if (updates.title !== undefined) updatePayload.title = updates.title;
    if (updates.resourceName !== undefined) updatePayload.resourceName = updates.resourceName;
    if (updates.bookingDate !== undefined) updatePayload.bookingDate = updates.bookingDate;
    if (updates.bookingTime !== undefined) updatePayload.bookingTime = updates.bookingTime;
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;
    if (updates.metadata !== undefined) updatePayload.metadata = updates.metadata;

    const [updated] = await db
      .update(appointments)
      .set(updatePayload)
      .where(eq(appointments.id, appointmentId))
      .returning();

    logger.info({ appointmentId, tenantId }, 'Appointment updated');
    return updated as unknown as Appointment;
  }

  async getAppointment(appointmentId: string, tenantId: string): Promise<Appointment | null> {
    const appointment = await db.query.appointments.findFirst({
      where: and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)),
      with: {
        agent: {
          columns: { id: true, name: true },
        },
        callSession: {
          columns: { id: true, roomName: true, callerNumber: true, direction: true, status: true, durationSeconds: true },
        },
      },
    });

    return (appointment as unknown as Appointment) || null;
  }

  async listAppointments(
    tenantId: string,
    options: ListAppointmentsOptions = {}
  ): Promise<{ appointments: Appointment[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const offset = Math.max(Number(options.offset) || 0, 0);

    const conditions = [eq(appointments.tenantId, tenantId)];
    if (options.agentId) {
      conditions.push(eq(appointments.agentId, options.agentId));
    }
    if (options.status) {
      conditions.push(eq(appointments.status, options.status as any));
    }
    if (options.bookingDate) {
      conditions.push(eq(appointments.bookingDate, options.bookingDate));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db
      .select({ count: count() })
      .from(appointments)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const items = await db.query.appointments.findMany({
      where: whereClause,
      orderBy: [desc(appointments.createdAt)],
      limit,
      offset,
      with: {
        agent: {
          columns: { id: true, name: true },
        },
      },
    });

    return {
      appointments: items as unknown as Appointment[],
      total,
      limit,
      offset,
    };
  }
}

export const appointmentService = new AppointmentService();
