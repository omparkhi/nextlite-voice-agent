import type {
  ExotelConfig,
  ExotelOutboundCallParams,
  ExotelCallResponse,
  ExotelCallStatus,
} from './types.js';
import { createChildLogger } from '../../../lib/logger.js';

const logger = createChildLogger({ module: 'exotel-client' });

export class ExotelClient {
  private config: ExotelConfig;

  constructor(config: ExotelConfig) {
    this.config = config;
  }

  /**
   * Initiate an outbound call via Exotel Connect Voice AI API.
   * POST /v1/Accounts/{AccountSid}/Calls/connect
   *
   * IMPORTANT: This is the Connect Voice AI API, NOT the Flow/Voicebot Applet API.
   * Do NOT send `Url` parameter — it is not part of this API.
   * Only send: From, CallerId, StreamUrl, StreamType=bidirectional
   */
  async makeOutboundCall(params: ExotelOutboundCallParams): Promise<ExotelCallResponse> {
    const url = `${this.config.baseUrl}/v1/Accounts/${this.config.accountSid}/Calls/connect`;

    const formData = new URLSearchParams();
    // Connect Voice AI API required parameters
    formData.append('From', params.from);
    formData.append('CallerId', params.callerid);
    formData.append('StreamUrl', params.streamUrl);
    formData.append('StreamType', params.streamType);

    // NOTE: Do NOT append 'Url' — it's a Voicebot Applet parameter, not Connect Voice AI

    if (params.record !== undefined) {
      formData.append('Record', String(params.record));
    }
    if (params.statusCallback) {
      formData.append('StatusCallback', params.statusCallback);
    }
    if (params.statusCallbackEvents) {
      params.statusCallbackEvents.forEach(event => {
        formData.append('StatusCallbackEvents[]', event);
      });
    }
    if (params.timeLimit !== undefined) {
      formData.append('TimeLimit', String(params.timeLimit));
    }
    if (params.customField) {
      formData.append('CustomField', params.customField);
    }

    const auth = Buffer.from(`${this.config.apiKey}:${this.config.apiToken}`).toString('base64');

    logger.info({
      from: params.from,
      callerid: params.callerid,
      streamUrl: params.streamUrl,
      streamType: params.streamType,
    }, 'Initiating outbound call via Connect Voice AI API');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, errorText }, 'Exotel outbound call failed');
      const match = errorText.match(/<Message>(.*?)<\/Message>/i);
      const cleanMessage = match ? match[1] : errorText;
      throw new Error(`Exotel API error: ${response.status} ${cleanMessage}`);
    }

    const responseText = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json());
    let sid = 'unknown';
    let status = 'in-progress';
    let accountSid = this.config.accountSid;

    try {
      const rawData = JSON.parse(responseText) as any;
      const callObj = rawData.Call ?? rawData.call ?? rawData;
      sid = callObj.Sid ?? callObj.sid ?? 'unknown';
      status = callObj.Status ?? callObj.status ?? 'in-progress';
      accountSid = callObj.AccountSid ?? callObj.accountSid ?? this.config.accountSid;
    } catch {
      const sidMatch = responseText.match(/<Sid>(.*?)<\/Sid>/i);
      const statusMatch = responseText.match(/<Status>(.*?)<\/Status>/i);
      if (sidMatch) sid = sidMatch[1];
      if (statusMatch) status = statusMatch[1];
    }

    const data: ExotelCallResponse = {
      call: {
        sid,
        status,
        accountSid,
        to: params.callerid,
        from: params.from,
        direction: 'outbound-api',
      }
    };

    logger.info({ callSid: sid, status }, 'Outbound call initiated');
    return data;
  }

  /**
   * Get call details by SID.
   */
  async getCall(callSid: string): Promise<ExotelCallResponse> {
    const url = `${this.config.baseUrl}/v1/Accounts/${this.config.accountSid}/Calls/${callSid}.json`;

    const auth = Buffer.from(`${this.config.apiKey}:${this.config.apiToken}`).toString('base64');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ callSid, status: response.status, error }, 'Get call failed');
      throw new Error(`Exotel API error: ${response.status} ${error}`);
    }

    const responseText = await response.text();
    let sid = callSid;
    let status = 'in-progress';

    try {
      const rawData = JSON.parse(responseText) as any;
      const callObj = rawData.Call ?? rawData.call ?? rawData;
      sid = callObj.Sid ?? callObj.sid ?? callSid;
      status = callObj.Status ?? callObj.status ?? 'completed';
    } catch {
      const sidMatch = responseText.match(/<Sid>(.*?)<\/Sid>/i);
      const statusMatch = responseText.match(/<Status>(.*?)<\/Status>/i);
      if (sidMatch) sid = sidMatch[1];
      if (statusMatch) status = statusMatch[1];
    }

    return {
      call: {
        sid,
        status,
        accountSid: this.config.accountSid,
        to: '',
        from: '',
        direction: 'outbound-api',
      }
    };
  }

  /**
   * Hang up an active call.
   */
  async hangupCall(callSid: string): Promise<void> {
    const url = `${this.config.baseUrl}/v1/Accounts/${this.config.accountSid}/Calls/${callSid}.json`;

    const auth = Buffer.from(`${this.config.apiKey}:${this.config.apiToken}`).toString('base64');

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ callSid, status: response.status, error }, 'Hangup call failed');
      throw new Error(`Exotel API error: ${response.status} ${error}`);
    }

    logger.info({ callSid }, 'Call hung up');
  }

  /**
   * Map Exotel status to our internal status.
   */
  static mapStatus(exotelStatus: string): ExotelCallStatus {
    const statusMap: Record<string, ExotelCallStatus> = {
      'queued': 'queued',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'completed-final': 'completed',
      'failed': 'failed',
      'busy': 'busy',
      'no-answer': 'no-answer',
      'canceled': 'failed',
      'ringing': 'queued',
    };
    return statusMap[exotelStatus] ?? 'failed';
  }
}

export function createExotelClient(config: ExotelConfig): ExotelClient {
  return new ExotelClient(config);
}
