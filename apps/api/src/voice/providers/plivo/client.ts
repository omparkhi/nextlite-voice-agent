import * as plivo from 'plivo';
import { createChildLogger } from '../../../lib/logger.js';
import { TelephonyService } from '../../telephony.js';
import { PlivoCallResponse, PlivoRecordingRecord } from './types.js';

const logger = createChildLogger({ module: 'plivo-client' });

function getPlivoClientClass(): any {
  if (plivo && typeof (plivo as any).Client === 'function') {
    return (plivo as any).Client;
  }
  if ((plivo as any)?.default && typeof (plivo as any).default.Client === 'function') {
    return (plivo as any).default.Client;
  }
  return plivo;
}

export interface PlivoClientConfig {
  authId: string;
  authToken: string;
  callerId: string;
  baseUrl?: string;
}

export class PlivoClient {
  private client: any;
  private config: PlivoClientConfig;

  constructor(config: PlivoClientConfig) {
    if (!config.authId || !config.authToken) {
      throw new Error('Plivo authId and authToken are required');
    }
    this.config = config;
    const ClientClass = getPlivoClientClass();
    this.client = new ClientClass(config.authId, config.authToken);
  }

  /**
   * Initiate an outbound call via Plivo Calls API.
   */
  async makeOutboundCall(options: {
    from?: string;
    to: string;
    answerUrl: string;
    answerMethod?: string;
    statusCallbackUrl?: string;
    statusCallbackMethod?: string;
    timeLimit?: number;
  }): Promise<PlivoCallResponse> {
    const fromNumber = options.from || this.config.callerId;
    if (!fromNumber) {
      throw new Error('Plivo callerId is not configured');
    }

    try {
      const res = await this.client.calls.create(
        fromNumber,
        options.to,
        options.answerUrl,
        {
          answerMethod: options.answerMethod || 'POST',
          statusUrl: options.statusCallbackUrl,
          statusMethod: options.statusCallbackMethod || 'POST',
          timeLimit: options.timeLimit,
        },
      );

      logger.info({
        callUuid: res.requestUuid,
        message: res.message,
        to: options.to,
      }, 'Plivo outbound call initiated');

      const callUuid = Array.isArray(res.requestUuid) ? res.requestUuid[0] : (res.requestUuid || '');

      return {
        callUuid,
        message: res.message,
        apiId: res.apiId,
        status: 'in-progress',
      };
    } catch (error: any) {
      logger.error({ error: error.message || error }, 'Plivo outbound call failed');
      throw new Error(`Plivo outbound call failed: ${error.message || error}`);
    }
  }

  /**
   * Fetch call details by Call UUID.
   */
  async getCall(callUuid: string): Promise<{ callSid: string; status: string }> {
    try {
      const res: any = await this.client.calls.get(callUuid);
      return {
        callSid: callUuid,
        status: res.callState || res.callStatus || 'in-progress',
      };
    } catch (error: any) {
      logger.warn({ callUuid, error: error.message || error }, 'Failed to fetch Plivo call details (using fallback status)');
      return {
        callSid: callUuid,
        status: 'in-progress',
      };
    }
  }

  /**
   * Hang up an ongoing call.
   */
  async hangupCall(callUuid: string): Promise<void> {
    try {
      await this.client.calls.hangup(callUuid);
    } catch (error: any) {
      logger.warn({ callUuid, error: error.message || error }, 'Failed to hang up Plivo call');
    }
  }

  /**
   * Start call recording via Plivo Record API.
   */
  async startRecording(callUuid: string, callbackUrl?: string): Promise<PlivoRecordingRecord | null> {
    try {
      const res = await this.client.calls.record(callUuid, {
        callbackUrl,
        callbackMethod: 'POST',
      });
      return {
        recordingId: res.recordingId || callUuid,
        recordingUrl: res.url || '',
        callUuid,
        status: 'recording',
      };
    } catch (error: any) {
      logger.error({ callUuid, error: error.message || error }, 'Failed to start Plivo call recording');
      return null;
    }
  }
}

/**
 * Adapter bridging PlivoClient to NextLite's TelephonyService interface.
 */
export class PlivoTelephonyAdapter implements TelephonyService {
  private client: PlivoClient;

  constructor(config: PlivoClientConfig) {
    this.client = new PlivoClient(config);
  }

  async makeOutboundCall(options: {
    from: string;
    callerId: string;
    streamUrl: string;
    record?: boolean;
    statusCallback?: string;
    statusCallbackEvents?: string[];
    timeLimit?: number;
    customField?: string;
  }): Promise<{ callSid: string; status: string }> {
    const streamHost = process.env.PLIVO_STREAM_HOST ?? process.env.EXOTEL_STREAM_HOST ?? process.env.HOST ?? 'localhost';
    const isPublicDomain = streamHost.includes('.') && !streamHost.startsWith('127.') && !streamHost.startsWith('192.');
    const httpProtocol = isPublicDomain || process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const portStr = isPublicDomain ? '' : `:${process.env.PORT || '3001'}`;

    const tenantId = options.customField ? (JSON.parse(options.customField)?.tenantId || '') : '';
    const agentId = options.customField ? (JSON.parse(options.customField)?.agentId || '') : '';

    const answerUrl = options.streamUrl.startsWith('http')
      ? options.streamUrl
      : `${httpProtocol}://${streamHost}${portStr}/api/telephony/plivo/answer?tenant-id=${tenantId}&agent-id=${agentId}`;

    const statusCallbackUrl = options.statusCallback || `${httpProtocol}://${streamHost}${portStr}/api/telephony/plivo/status`;

    const res = await this.client.makeOutboundCall({
      from: options.callerId,
      to: options.from,
      answerUrl,
      statusCallbackUrl,
      timeLimit: options.timeLimit,
    });

    return {
      callSid: res.callUuid,
      status: res.status || 'in-progress',
    };
  }

  async getCall(callSid: string): Promise<{ callSid: string; status: string }> {
    return this.client.getCall(callSid);
  }

  async hangupCall(callSid: string): Promise<void> {
    await this.client.hangupCall(callSid);
  }
}
