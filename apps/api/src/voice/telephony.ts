import type { ExotelConfig, ExotelOutboundCallParams, ExotelCallResponse } from './providers/exotel/types.js';
import { ExotelClient } from './providers/exotel/client.js';
import { createChildLogger } from '../lib/logger.js';

const logger = createChildLogger({ module: 'telephony-service' });

export interface TelephonyService {
  makeOutboundCall(params: {
    from: string;
    callerId: string;
    streamUrl: string;
    record?: boolean;
    statusCallback?: string;
    statusCallbackEvents?: string[];
    timeLimit?: number;
    customField?: string;
  }): Promise<{ callSid: string; status: string }>;

  getCall(callSid: string): Promise<{ callSid: string; status: string }>;
  hangupCall(callSid: string): Promise<void>;
}

class ExotelTelephonyAdapter implements TelephonyService {
  private client: ExotelClient;

  constructor(config: ExotelConfig) {
    this.client = new ExotelClient(config);
  }

  async makeOutboundCall(params: {
    from: string;
    callerId: string;
    streamUrl: string;
    record?: boolean;
    statusCallback?: string;
    statusCallbackEvents?: string[];
    timeLimit?: number;
    customField?: string;
  }): Promise<{ callSid: string; status: string }> {
    const result = await this.client.makeOutboundCall({
      from: params.from,
      callerid: params.callerId,
      streamUrl: params.streamUrl,
      streamType: 'bidirectional',
      record: params.record,
      statusCallback: params.statusCallback,
      statusCallbackEvents: params.statusCallbackEvents,
      timeLimit: params.timeLimit,
      customField: params.customField,
    });

    return {
      callSid: result.call?.sid ?? (result as any).callSid ?? 'unknown',
      status: result.call?.status ?? (result as any).status ?? 'in-progress',
    };
  }

  async getCall(callSid: string): Promise<{ callSid: string; status: string }> {
    const result = await this.client.getCall(callSid);
    return {
      callSid: result.call?.sid ?? callSid,
      status: result.call?.status ?? 'active',
    };
  }

  async hangupCall(callSid: string): Promise<void> {
    await this.client.hangupCall(callSid);
  }
}

import { PlivoTelephonyAdapter } from './providers/plivo/client.js';

export function createTelephonyService(providerPreference?: 'exotel' | 'plivo'): TelephonyService | null {
  const selectedProvider = providerPreference || process.env.TELEPHONY_PROVIDER || 'exotel';

  if (selectedProvider === 'exotel') {
    const accountSid = process.env.EXOTEL_ACCOUNT_SID;
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const callerId = process.env.EXOTEL_CALLER_ID;
    const baseUrl = process.env.EXOTEL_BASE_URL ?? 'https://api.in.exotel.com';

    if (!accountSid || !apiKey || !apiToken || !callerId) {
      logger.warn('Exotel credentials not configured, telephony disabled');
      return null;
    }

    return new ExotelTelephonyAdapter({
      accountSid,
      apiKey,
      apiToken,
      callerId,
      baseUrl,
    });
  }

  if (selectedProvider === 'plivo') {
    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const callerId = process.env.PLIVO_CALLER_ID;
    const baseUrl = process.env.PLIVO_BASE_URL;

    if (!authId || !authToken || !callerId) {
      logger.warn('Plivo credentials not configured (PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_CALLER_ID required)');
      return null;
    }

    return new PlivoTelephonyAdapter({
      authId,
      authToken,
      callerId,
      baseUrl,
    });
  }

  throw new Error(`Unsupported telephony provider: ${selectedProvider}`);
}
