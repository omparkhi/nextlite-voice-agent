import { SipClient, RoomServiceClient } from 'livekit-server-sdk';
import { env } from '../../../config/env.js';
import { createChildLogger } from '../../../lib/logger.js';
import { PlivoTelephonyAdapter, PlivoClientConfig } from './client.js';

const logger = createChildLogger({ module: 'livekit-sip-outbound' });

export class LiveKitOutboundSIPService {
  private sipClient: SipClient;
  private roomClient: RoomServiceClient;

  constructor() {
    this.sipClient = new SipClient(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    this.roomClient = new RoomServiceClient(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  }

  /**
   * Initiates an outbound SIP call using LiveKit's native SipClient.
   * Creates the LiveKit room, attaches tenant & agent metadata, and dispatches the SIP call.
   */
  async initiateOutboundCall(options: {
    tenantId: string;
    agentId: string;
    agentVersionId?: string;
    destinationPhone: string;
    callerId?: string;
  }): Promise<{ callSid: string; roomName: string; sessionId: string; status: string }> {
    const sipTrunkId = env.LIVEKIT_SIP_TRUNK_ID || process.env.LIVEKIT_SIP_TRUNK_ID || 'ST_default';
    const sessionId = `session_${Date.now()}`;
    const roomName = `room_${options.agentId}_${sessionId}`;

    const metadataPayload = JSON.stringify({
      tenantId: options.tenantId,
      agentId: options.agentId,
      agentVersionId: options.agentVersionId,
      sessionId,
      transport: 'phone',
    });

    // 1. Create LiveKit Room with metadata so worker agent resolves correct RuntimeAgentConfig
    logger.info({ roomName, tenantId: options.tenantId, agentId: options.agentId }, '[VOICE_DEBUG] Creating LiveKit room for SIP participant');
    await this.roomClient.createRoom({
      name: roomName,
      metadata: metadataPayload,
      emptyTimeout: 300,
    }).catch((err) => {
      logger.warn(err, 'LiveKit room creation warning (continuing to SIP participant creation)');
    });

    // 2. Create SIP Participant via LiveKit SipClient
    logger.info({ sipTrunkId, destinationPhone: options.destinationPhone, roomName }, '[VOICE_DEBUG] Creating SIP Participant via LiveKit SipClient');
    
    let callSid = `sip_${sessionId}`;
    try {
      const participantInfo = await this.sipClient.createSipParticipant(
        sipTrunkId,
        options.destinationPhone,
        roomName,
        {
          participantIdentity: `phone_${sessionId}`,
          participantName: `Caller (${options.destinationPhone})`,
          participantMetadata: metadataPayload,
          fromNumber: options.callerId || process.env.PLIVO_CALLER_ID,
        }
      );
      if (participantInfo && participantInfo.sipCallId) {
        callSid = participantInfo.sipCallId;
      }
    } catch (err: any) {
      logger.error(err, 'LiveKit SipClient.createSipParticipant error');
      throw new Error(`LiveKit SIP call initiation failed: ${err.message}`);
    }

    logger.info({ callSid, roomName }, 'Outbound LiveKit SIP Call initiated successfully');

    return {
      callSid,
      roomName,
      sessionId,
      status: 'in-progress',
    };
  }
}

export function createLiveKitOutboundService(): LiveKitOutboundSIPService {
  return new LiveKitOutboundSIPService();
}

export function createPlivoControlService(): PlivoTelephonyAdapter | undefined {
  const cfg: PlivoClientConfig = {
    authId: process.env.PLIVO_AUTH_ID ?? '',
    authToken: process.env.PLIVO_AUTH_TOKEN ?? '',
    callerId: process.env.PLIVO_CALLER_ID ?? '',
  };
  if (!cfg.authId || !cfg.authToken) {
    return undefined;
  }
  return new PlivoTelephonyAdapter(cfg);
}
