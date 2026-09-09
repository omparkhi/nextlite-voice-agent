import { db } from '../db';
import { phoneNumbers, agents, deployments } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import { PhoneNumber, CreatePhoneNumberRequest } from '@nextlite/shared';

const logger = createChildLogger({ module: 'phone-number-service' });

export class PhoneNumberService {
  async createPhoneNumber(data: CreatePhoneNumberRequest): Promise<PhoneNumber> {
    // 1. If agentId is provided, verify tenant ownership
    if (data.agentId) {
      const agent = await db.query.agents.findFirst({
        where: and(eq(agents.id, data.agentId), eq(agents.tenantId, data.tenantId)),
      });
      if (!agent) {
        throw new Error(`Agent ${data.agentId} does not belong to tenant ${data.tenantId}`);
      }
    }

    // 2. If deploymentId is provided, verify tenant ownership
    if (data.deploymentId) {
      const deployment = await db.query.deployments.findFirst({
        where: and(eq(deployments.id, data.deploymentId), eq(deployments.tenantId, data.tenantId)),
      });
      if (!deployment) {
        throw new Error(`Deployment ${data.deploymentId} does not belong to tenant ${data.tenantId}`);
      }
    }

    const now = new Date();
    const [record] = await db
      .insert(phoneNumbers)
      .values({
        tenantId: data.tenantId,
        agentId: data.agentId || null,
        deploymentId: data.deploymentId || null,
        phoneNumber: data.phoneNumber,
        provider: data.provider || 'plivo',
        status: data.status || 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    logger.info({ id: record.id, phoneNumber: record.phoneNumber, tenantId: data.tenantId }, 'Phone number created');
    return record as unknown as PhoneNumber;
  }

  async lookupPhoneNumber(phoneNumber: string): Promise<PhoneNumber | null> {
    const record = await db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.phoneNumber, phoneNumber),
      with: {
        agent: {
          columns: { id: true, name: true, status: true },
        },
        deployment: {
          columns: { id: true, environment: true, status: true },
        },
        tenant: {
          columns: { id: true, name: true, status: true },
        },
      },
    });

    return (record as unknown as PhoneNumber) || null;
  }

  async listPhoneNumbers(tenantId: string): Promise<PhoneNumber[]> {
    const items = await db.query.phoneNumbers.findMany({
      where: eq(phoneNumbers.tenantId, tenantId),
      orderBy: [desc(phoneNumbers.createdAt)],
      with: {
        agent: {
          columns: { id: true, name: true },
        },
        deployment: {
          columns: { id: true, environment: true, status: true },
        },
      },
    });

    return items as unknown as PhoneNumber[];
  }

  async getPhoneNumber(id: string, tenantId: string): Promise<PhoneNumber | null> {
    const record = await db.query.phoneNumbers.findFirst({
      where: and(eq(phoneNumbers.id, id), eq(phoneNumbers.tenantId, tenantId)),
      with: {
        agent: {
          columns: { id: true, name: true },
        },
        deployment: {
          columns: { id: true, environment: true, status: true },
        },
      },
    });

    return (record as unknown as PhoneNumber) || null;
  }

  async updatePhoneNumber(
    id: string,
    tenantId: string,
    updates: {
      agentId?: string | null;
      deploymentId?: string | null;
      status?: string;
    }
  ): Promise<PhoneNumber> {
    const existing = await db.query.phoneNumbers.findFirst({
      where: and(eq(phoneNumbers.id, id), eq(phoneNumbers.tenantId, tenantId)),
    });

    if (!existing) {
      throw new Error(`Phone number ${id} not found for tenant ${tenantId}`);
    }

    if (updates.agentId) {
      const agent = await db.query.agents.findFirst({
        where: and(eq(agents.id, updates.agentId), eq(agents.tenantId, tenantId)),
      });
      if (!agent) {
        throw new Error(`Agent ${updates.agentId} does not belong to tenant ${tenantId}`);
      }
    }

    if (updates.deploymentId) {
      const deployment = await db.query.deployments.findFirst({
        where: and(eq(deployments.id, updates.deploymentId), eq(deployments.tenantId, tenantId)),
      });
      if (!deployment) {
        throw new Error(`Deployment ${updates.deploymentId} does not belong to tenant ${tenantId}`);
      }
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (updates.agentId !== undefined) updatePayload.agentId = updates.agentId;
    if (updates.deploymentId !== undefined) updatePayload.deploymentId = updates.deploymentId;
    if (updates.status !== undefined) updatePayload.status = updates.status;

    const [updated] = await db
      .update(phoneNumbers)
      .set(updatePayload)
      .where(eq(phoneNumbers.id, id))
      .returning();

    logger.info({ id, tenantId }, 'Phone number updated');
    return updated as unknown as PhoneNumber;
  }
}

export const phoneNumberService = new PhoneNumberService();
