import { db } from '../db';
import { leads, agents, callSessions } from '../db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import { Lead, CreateLeadRequest } from '@nextlite/shared';

const logger = createChildLogger({ module: 'lead-service' });

export interface ListLeadsOptions {
  limit?: number;
  offset?: number;
  agentId?: string;
  status?: string;
}

export class LeadService {
  async createLead(data: CreateLeadRequest): Promise<Lead> {
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
    const [lead] = await db
      .insert(leads)
      .values({
        tenantId: data.tenantId,
        agentId: data.agentId,
        callSessionId: data.callSessionId || null,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail || null,
        interestCategory: data.interestCategory || null,
        status: (data.status as any) || 'NEW',
        notes: data.notes || null,
        metadata: data.metadata || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    logger.info({ leadId: lead.id, tenantId: data.tenantId, agentId: data.agentId }, 'Lead created');
    return lead as unknown as Lead;
  }

  async updateLead(
    leadId: string,
    tenantId: string,
    updates: Partial<Omit<CreateLeadRequest, 'tenantId' | 'agentId'>> & {
      status?: string;
    }
  ): Promise<Lead> {
    const existing = await db.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)),
    });

    if (!existing) {
      throw new Error(`Lead ${leadId} not found for tenant ${tenantId}`);
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (updates.customerName !== undefined) updatePayload.customerName = updates.customerName;
    if (updates.customerPhone !== undefined) updatePayload.customerPhone = updates.customerPhone;
    if (updates.customerEmail !== undefined) updatePayload.customerEmail = updates.customerEmail;
    if (updates.interestCategory !== undefined) updatePayload.interestCategory = updates.interestCategory;
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;
    if (updates.metadata !== undefined) updatePayload.metadata = updates.metadata;

    const [updated] = await db
      .update(leads)
      .set(updatePayload)
      .where(eq(leads.id, leadId))
      .returning();

    logger.info({ leadId, tenantId }, 'Lead updated');
    return updated as unknown as Lead;
  }

  async getLead(leadId: string, tenantId: string): Promise<Lead | null> {
    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)),
      with: {
        agent: {
          columns: { id: true, name: true },
        },
        callSession: {
          columns: { id: true, roomName: true, callerNumber: true, direction: true, status: true, durationSeconds: true },
        },
      },
    });

    return (lead as unknown as Lead) || null;
  }

  async listLeads(
    tenantId: string,
    options: ListLeadsOptions = {}
  ): Promise<{ leads: Lead[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const offset = Math.max(Number(options.offset) || 0, 0);

    const conditions = [eq(leads.tenantId, tenantId)];
    if (options.agentId) {
      conditions.push(eq(leads.agentId, options.agentId));
    }
    if (options.status) {
      conditions.push(eq(leads.status, options.status as any));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db
      .select({ count: count() })
      .from(leads)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const items = await db.query.leads.findMany({
      where: whereClause,
      orderBy: [desc(leads.createdAt)],
      limit,
      offset,
      with: {
        agent: {
          columns: { id: true, name: true },
        },
      },
    });

    return {
      leads: items as unknown as Lead[],
      total,
      limit,
      offset,
    };
  }
}

export const leadService = new LeadService();
