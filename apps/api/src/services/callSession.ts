import { db } from '../db';
import { callSessions, agents, deployments } from '../db/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import { CallSession, CreateCallSessionRequest } from '@nextlite/shared';

const logger = createChildLogger({ module: 'call-session-service' });

export interface ListCallSessionsOptions {
  limit?: number;
  offset?: number;
  agentId?: string;
  status?: string;
}

export class CallSessionService {
  async createCallSession(data: CreateCallSessionRequest): Promise<CallSession> {
    // 1. Verify tenant ownership of agent
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, data.agentId), eq(agents.tenantId, data.tenantId)),
    });
    if (!agent) {
      throw new Error(`Agent ${data.agentId} does not belong to tenant ${data.tenantId}`);
    }

    // 2. Verify tenant ownership of deployment
    const deployment = await db.query.deployments.findFirst({
      where: and(eq(deployments.id, data.deploymentId), eq(deployments.tenantId, data.tenantId)),
    });
    if (!deployment) {
      throw new Error(`Deployment ${data.deploymentId} does not belong to tenant ${data.tenantId}`);
    }

    const now = new Date();
    const [session] = await db
      .insert(callSessions)
      .values({
        tenantId: data.tenantId,
        agentId: data.agentId,
        deploymentId: data.deploymentId,
        roomName: data.roomName,
        callerNumber: data.callerNumber || null,
        direction: (data.direction as any) || 'INBOUND',
        status: (data.status as any) || 'COMPLETED',
        durationSeconds: data.durationSeconds ?? 0,
        primaryLanguage: data.primaryLanguage || 'en-IN',
        startedAt: data.startedAt ? new Date(data.startedAt) : now,
        endedAt: data.endedAt ? new Date(data.endedAt) : null,
        transcriptText: data.transcriptText || null,
        turnsJson: data.turnsJson || null,
        toolsUsed: data.toolsUsed || null,
        metricsJson: data.metricsJson || null,
        createdAt: now,
      })
      .returning();

    logger.info({ sessionId: session.id, tenantId: data.tenantId, agentId: data.agentId }, 'Call session created');
    return session as unknown as CallSession;
  }

  async updateCallSession(
    sessionId: string,
    tenantId: string,
    updates: Partial<Omit<CreateCallSessionRequest, 'tenantId' | 'agentId' | 'deploymentId'>> & {
      status?: string;
      durationSeconds?: number;
      endedAt?: string | Date;
      transcriptText?: string;
      turnsJson?: any;
      toolsUsed?: any;
      metricsJson?: any;
    }
  ): Promise<CallSession> {
    const existing = await db.query.callSessions.findFirst({
      where: and(eq(callSessions.id, sessionId), eq(callSessions.tenantId, tenantId)),
    });

    if (!existing) {
      throw new Error(`Call session ${sessionId} not found for tenant ${tenantId}`);
    }

    const updatePayload: Record<string, any> = {};
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.durationSeconds !== undefined) updatePayload.durationSeconds = updates.durationSeconds;
    if (updates.primaryLanguage !== undefined) updatePayload.primaryLanguage = updates.primaryLanguage;
    if (updates.endedAt !== undefined) updatePayload.endedAt = updates.endedAt ? new Date(updates.endedAt) : null;
    if (updates.transcriptText !== undefined) updatePayload.transcriptText = updates.transcriptText;
    if (updates.turnsJson !== undefined) updatePayload.turnsJson = updates.turnsJson;
    if (updates.toolsUsed !== undefined) updatePayload.toolsUsed = updates.toolsUsed;
    if (updates.metricsJson !== undefined) updatePayload.metricsJson = updates.metricsJson;

    const [updated] = await db
      .update(callSessions)
      .set(updatePayload)
      .where(eq(callSessions.id, sessionId))
      .returning();

    logger.info({ sessionId, tenantId }, 'Call session updated');
    return updated as unknown as CallSession;
  }

  async getCallSession(sessionId: string, tenantId: string): Promise<CallSession | null> {
    const session = await db.query.callSessions.findFirst({
      where: and(eq(callSessions.id, sessionId), eq(callSessions.tenantId, tenantId)),
      with: {
        agent: {
          columns: { id: true, name: true, status: true },
        },
        deployment: {
          columns: { id: true, environment: true, status: true },
        },
        leads: true,
        appointments: true,
      },
    });

    return (session as unknown as CallSession) || null;
  }

  async listCallSessions(
    tenantId: string,
    options: ListCallSessionsOptions = {}
  ): Promise<{ calls: CallSession[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const offset = Math.max(Number(options.offset) || 0, 0);

    const conditions = [eq(callSessions.tenantId, tenantId)];
    if (options.agentId) {
      conditions.push(eq(callSessions.agentId, options.agentId));
    }
    if (options.status) {
      conditions.push(eq(callSessions.status, options.status as any));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db
      .select({ count: count() })
      .from(callSessions)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const calls = await db.query.callSessions.findMany({
      where: whereClause,
      orderBy: [desc(callSessions.createdAt)],
      limit,
      offset,
      with: {
        agent: {
          columns: { id: true, name: true },
        },
      },
    });

    return {
      calls: calls as unknown as CallSession[],
      total,
      limit,
      offset,
    };
  }
}

export const callSessionService = new CallSessionService();
