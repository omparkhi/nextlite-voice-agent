import { db } from '../db';
import { followUps, leads, appointments, callSessions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import {
  SendWhatsAppRequest,
  SendWhatsAppResponse,
  FollowUpStatus,
} from '@nextlite/shared';

const logger = createChildLogger({ module: 'whatsapp-service' });

export interface WhatsAppSendResult {
  providerMessageId: string;
  status: FollowUpStatus;
  isDemo: boolean;
  provider: string;
  deliveredAt?: Date;
  metadata?: Record<string, any>;
}

export interface WhatsAppProvider {
  name: string;
  sendMessage(to: string, message: string, options?: Record<string, any>): Promise<WhatsAppSendResult>;
}

export class DemoWhatsAppProvider implements WhatsAppProvider {
  name = 'DEMO';

  async sendMessage(to: string, message: string, options?: Record<string, any>): Promise<WhatsAppSendResult> {
    const demoId = `demo_wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();

    logger.info(
      {
        to,
        messageLength: message.length,
        providerMessageId: demoId,
        options,
      },
      '📢 [DEMO WHATSAPP] Simulated WhatsApp message delivery',
    );

    return {
      providerMessageId: demoId,
      status: 'DELIVERED',
      isDemo: true,
      provider: 'DEMO',
      deliveredAt: now,
      metadata: {
        simulated: true,
        channel: 'WHATSAPP',
        preview: message.substring(0, 100),
      },
    };
  }
}

export class WhatsAppService {
  private providers: Map<string, WhatsAppProvider> = new Map();

  constructor() {
    // Register Demo provider by default
    const demoProvider = new DemoWhatsAppProvider();
    this.providers.set('DEMO', demoProvider);
  }

  registerProvider(name: string, provider: WhatsAppProvider) {
    this.providers.set(name.toUpperCase(), provider);
  }

  getProvider(name = 'DEMO'): WhatsAppProvider {
    const provider = this.providers.get(name.toUpperCase());
    if (!provider) {
      logger.warn({ requestedProvider: name }, 'Provider not found, defaulting to DEMO provider');
      return this.providers.get('DEMO')!;
    }
    return provider;
  }

  async sendWhatsApp(tenantId: string, request: SendWhatsAppRequest): Promise<SendWhatsAppResponse> {
    // 1. Verify tenant ownership of referenced lead if provided
    if (request.leadId) {
      const lead = await db.query.leads.findFirst({
        where: and(eq(leads.id, request.leadId), eq(leads.tenantId, tenantId)),
      });
      if (!lead) {
        throw new Error(`Lead ${request.leadId} does not belong to tenant ${tenantId}`);
      }
    }

    // 2. Verify tenant ownership of referenced appointment if provided
    if (request.appointmentId) {
      const appointment = await db.query.appointments.findFirst({
        where: and(eq(appointments.id, request.appointmentId), eq(appointments.tenantId, tenantId)),
      });
      if (!appointment) {
        throw new Error(`Appointment ${request.appointmentId} does not belong to tenant ${tenantId}`);
      }
    }

    // 3. Verify tenant ownership of referenced callSession if provided
    if (request.callSessionId) {
      const session = await db.query.callSessions.findFirst({
        where: and(eq(callSessions.id, request.callSessionId), eq(callSessions.tenantId, tenantId)),
      });
      if (!session) {
        throw new Error(`Call session ${request.callSessionId} does not belong to tenant ${tenantId}`);
      }
    }

    // 4. Resolve provider and send message
    const provider = this.getProvider(request.provider || 'DEMO');
    const result = await provider.sendMessage(request.customerPhone, request.message, {
      leadId: request.leadId,
      appointmentId: request.appointmentId,
      callSessionId: request.callSessionId,
      customerName: request.customerName,
    });

    const now = new Date();

    // 5. Persist follow_ups record
    const [record] = await db
      .insert(followUps)
      .values({
        tenantId,
        leadId: request.leadId || null,
        appointmentId: request.appointmentId || null,
        callSessionId: request.callSessionId || null,
        customerName: request.customerName || null,
        customerPhone: request.customerPhone,
        channel: 'WHATSAPP',
        provider: result.provider,
        messageType: request.messageType || 'CUSTOM',
        messageText: request.message,
        status: result.status,
        providerMessageId: result.providerMessageId,
        isDemo: result.isDemo,
        sentAt: now,
        deliveredAt: result.deliveredAt || now,
        metadata: result.metadata || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    logger.info(
      {
        followUpId: record.id,
        tenantId,
        customerPhone: request.customerPhone,
        status: record.status,
        isDemo: record.isDemo,
      },
      'Follow-up message recorded',
    );

    return {
      success: true,
      followUpId: record.id,
      status: record.status as FollowUpStatus,
      provider: record.provider,
      providerMessageId: record.providerMessageId || undefined,
      isDemo: record.isDemo,
      message: result.isDemo
        ? 'Message simulated and delivered via Demo WhatsApp Provider'
        : 'Message dispatched successfully',
    };
  }
}

export const whatsAppService = new WhatsAppService();
