import { db } from '../db';
import { followUps } from '../db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import { FollowUp } from '@nextlite/shared';

const logger = createChildLogger({ module: 'follow-up-service' });

export interface ListFollowUpsOptions {
  limit?: number;
  offset?: number;
  status?: string;
  channel?: string;
  customerPhone?: string;
}

export class FollowUpService {
  async getFollowUp(id: string, tenantId: string): Promise<FollowUp | null> {
    const record = await db.query.followUps.findFirst({
      where: and(eq(followUps.id, id), eq(followUps.tenantId, tenantId)),
      with: {
        lead: {
          columns: { id: true, customerName: true, customerPhone: true, status: true },
        },
        appointment: {
          columns: { id: true, appointmentNumber: true, customerName: true, bookingDate: true, bookingTime: true, status: true },
        },
        callSession: {
          columns: { id: true, roomName: true, callerNumber: true, direction: true, durationSeconds: true },
        },
      },
    });

    return (record as unknown as FollowUp) || null;
  }

  async listFollowUps(
    tenantId: string,
    options: ListFollowUpsOptions = {}
  ): Promise<{ followUps: FollowUp[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const offset = Math.max(Number(options.offset) || 0, 0);

    const conditions = [eq(followUps.tenantId, tenantId)];
    if (options.status) {
      conditions.push(eq(followUps.status, options.status as any));
    }
    if (options.channel) {
      conditions.push(eq(followUps.channel, options.channel));
    }
    if (options.customerPhone) {
      conditions.push(eq(followUps.customerPhone, options.customerPhone));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db
      .select({ count: count() })
      .from(followUps)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const items = await db.query.followUps.findMany({
      where: whereClause,
      orderBy: [desc(followUps.createdAt)],
      limit,
      offset,
      with: {
        lead: {
          columns: { id: true, customerName: true, customerPhone: true, status: true },
        },
        appointment: {
          columns: { id: true, appointmentNumber: true, customerName: true, bookingDate: true, bookingTime: true, status: true },
        },
        callSession: {
          columns: { id: true, roomName: true, callerNumber: true, direction: true },
        },
      },
    });

    return {
      followUps: items as unknown as FollowUp[],
      total,
      limit,
      offset,
    };
  }
}

export const followUpService = new FollowUpService();
