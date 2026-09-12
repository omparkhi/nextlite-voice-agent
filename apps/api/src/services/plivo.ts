import { env } from '../config/env';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'plivo-service' });

export interface PlivoCallResponse {
  message: string;
  api_id: string;
  request_uuid: string;
}

export class PlivoServiceError extends Error {
  constructor(message: string, public readonly statusCode?: number, public readonly rawResponse?: any) {
    super(message);
    this.name = 'PlivoServiceError';
  }
}

export class PlivoService {
  private readonly baseUrl = 'https://api.plivo.com/v1/Account';

  private getAuthHeader(): string {
    if (!env.PLIVO_AUTH_ID || !env.PLIVO_AUTH_TOKEN) {
      throw new Error('Plivo credentials (PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN) are not configured');
    }
    return `Basic ${Buffer.from(`${env.PLIVO_AUTH_ID}:${env.PLIVO_AUTH_TOKEN}`).toString('base64')}`;
  }

  /**
   * Initiates an outbound phone call using Plivo REST API.
   *
   * @param toPhoneNumber Destination phone number (E.164 format)
   * @param answerUrl The URL Plivo should request when the call is answered
   * @returns Plivo API response with request_uuid
   */
  public async createOutboundPhoneCall(toPhoneNumber: string, answerUrl: string): Promise<PlivoCallResponse> {
    if (!env.PLIVO_AUTH_ID) {
      throw new Error('Plivo AUTH_ID is required to create a call');
    }

    const callerId = env.PLIVO_CALLER_ID;
    if (!callerId) {
      throw new Error('Plivo Caller ID is not configured (env.PLIVO_CALLER_ID)');
    }

    logger.info(`[PlivoService] Initiating outbound call to ${toPhoneNumber} with answer URL: ${answerUrl}`);

    const url = `${this.baseUrl}/${env.PLIVO_AUTH_ID}/Call/`;

    const requestBody = {
      from: callerId,
      to: toPhoneNumber,
      answer_url: answerUrl,
      answer_method: 'GET',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorBody: Record<string, any> = {};
        try {
          errorBody = (await response.json()) as Record<string, any>;
        } catch (e) {
          // ignore
        }
        
        logger.error(`[PlivoService] Plivo API error: ${response.status} ${response.statusText}`, errorBody);
        throw new PlivoServiceError(
          `Plivo API returned ${response.status}`,
          response.status,
          errorBody
        );
      }

      const data = await response.json() as PlivoCallResponse;
      logger.info(`[PlivoService] Call initiated successfully. Request UUID: ${data.request_uuid}`);
      return data;
    } catch (error) {
      if (error instanceof PlivoServiceError) {
        throw error;
      }
      logger.error(`[PlivoService] Failed to initiate outbound call: ${error}`);
      throw new Error('Failed to initiate outbound phone call.');
    }
  }
}

export const plivoService = new PlivoService();
