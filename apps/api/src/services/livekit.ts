import { AccessToken, RoomServiceClient, AgentDispatchClient, SipClient, TrackSource } from 'livekit-server-sdk';
import { env } from '../config/env';
import { agentService } from './agent';
import { createChildLogger } from '../lib/logger';

const logger = createChildLogger({ module: 'livekit-service' });

export interface TestTokenResult {
  livekitUrl: string;
  token: string;
  roomName: string;
  dispatchId?: string;
}

export interface OutboundPhoneCallResult {
  success: boolean;
  roomName: string;
  callId?: string;
  participantId?: string;
  participantIdentity: string;
  deploymentId: string;
  dispatchId?: string;
}

export function isValidE164(phoneNumber: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phoneNumber.trim());
}

export class LiveKitService {
  private getRoomServiceClient(): RoomServiceClient {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new Error('LiveKit credentials are not configured');
    }
    const host = env.LIVEKIT_URL.replace(/^ws/, 'http');
    return new RoomServiceClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  }

  private getAgentDispatchClient(): AgentDispatchClient {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new Error('LiveKit credentials are not configured');
    }
    const host = env.LIVEKIT_URL.replace(/^ws/, 'http');
    return new AgentDispatchClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  }

  private getSipClient(): SipClient {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new Error('LiveKit credentials are not configured');
    }
    const host = env.LIVEKIT_URL.replace(/^ws/, 'http');
    return new SipClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  }

  /**
   * Generates a short-lived test token, creates a LiveKit test room
   * pointing to the agent's ACTIVE TEST deployment, and explicitly dispatches
   * the registered agent worker to the room.
   */
  async createTestToken(agentId: string, tenantId: string, userId: string): Promise<TestTokenResult> {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      logger.error('LiveKit credentials missing in environment');
      throw new Error('LiveKit service is not configured');
    }

    // 1. Verify agent existence & tenant ownership
    const agent = await agentService.getAgent(agentId, tenantId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // 2. Resolve the agent's ACTIVE TEST deployment
    const testDeployment = await agentService.getActiveDeployment(agentId, tenantId, 'TEST');
    if (!testDeployment) {
      throw new Error('No active TEST deployment found for this agent');
    }

    // 3. Generate unique test room name
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const roomName = `test-${agentId}-${timestamp}-${randomSuffix}`;

    const roomMetadata = JSON.stringify({
      deploymentId: testDeployment.id,
    });

    // 4. Ensure / create room on LiveKit server with deploymentId metadata
    const roomService = this.getRoomServiceClient();
    try {
      await roomService.createRoom({
        name: roomName,
        metadata: roomMetadata,
        emptyTimeout: 300, // 5 minutes after all participants leave
        maxParticipants: 5,
      });
      logger.info(
        {
          agentId,
          tenantId,
          deploymentId: testDeployment.id,
          roomName,
        },
        'Created LiveKit test room with deploymentId metadata',
      );
    } catch (err: any) {
      logger.error({ err, roomName, deploymentId: testDeployment.id }, 'Failed to create LiveKit room');
      throw new Error('Failed to create LiveKit test room');
    }

    // 5. Explicitly dispatch the LiveKit agent worker to the test room
    const agentName = env.LIVEKIT_AGENT_NAME || 'my-agent';
    const dispatchClient = this.getAgentDispatchClient();
    let dispatchId: string | undefined;
    try {
      const dispatch = await dispatchClient.createDispatch(roomName, agentName, {
        metadata: roomMetadata,
      });
      dispatchId = dispatch.id;
      logger.info(
        {
          agentId,
          tenantId,
          deploymentId: testDeployment.id,
          roomName,
          agentName,
          dispatchId,
        },
        'Explicitly dispatched LiveKit agent worker to test room',
      );
    } catch (err: any) {
      logger.error(
        { err, roomName, agentName, deploymentId: testDeployment.id },
        'Failed to dispatch LiveKit agent worker to room',
      );
      throw new Error('Failed to dispatch LiveKit agent worker');
    }

    // 6. Generate browser AccessToken
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: `tester-${userId}-${timestamp}`,
      name: 'Admin Tester',
      ttl: '15m', // 15 minutes TTL for browser testing session
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return {
      livekitUrl: env.LIVEKIT_URL,
      token,
      roomName,
      dispatchId,
    };
  }

  /**
   * Initiates an outbound SIP phone test call to a destination phone number.
   * Resolves the agent's ACTIVE TEST deployment, creates a LiveKit room with
   * deploymentId metadata, dispatches the registered agent worker, and dials
   * the destination phone number via the configured LiveKit SIP Outbound Trunk.
   */
  async createOutboundPhoneCall(
    agentId: string,
    tenantId: string,
    toPhoneNumber: string,
  ): Promise<OutboundPhoneCallResult> {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      logger.error('LiveKit credentials missing in environment');
      throw new Error('LiveKit service is not configured');
    }

    if (!env.LIVEKIT_SIP_TRUNK_ID) {
      logger.error('LiveKit SIP trunk ID missing in environment');
      throw new Error('LiveKit SIP trunk is not configured');
    }

    // 1. Validate destination phone number format (E.164 required)
    const normalizedPhone = (toPhoneNumber || '').trim();
    if (!isValidE164(normalizedPhone)) {
      throw new Error('Invalid phone number: Must be in E.164 format (e.g. +919876543210)');
    }

    // 2. Verify agent existence & tenant ownership
    const agent = await agentService.getAgent(agentId, tenantId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // 3. Resolve the agent's ACTIVE TEST deployment
    const testDeployment = await agentService.getActiveDeployment(agentId, tenantId, 'TEST');
    if (!testDeployment) {
      throw new Error('No active TEST deployment found for this agent');
    }

    // 4. Generate unique phone test room name
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const roomName = `phone-test-${agentId}-${timestamp}-${randomSuffix}`;

    const roomMetadata = JSON.stringify({
      deploymentId: testDeployment.id,
    });

    // 5. Ensure / create room on LiveKit server with deploymentId metadata
    const roomService = this.getRoomServiceClient();
    try {
      await roomService.createRoom({
        name: roomName,
        metadata: roomMetadata,
        emptyTimeout: 300, // 5 minutes after all participants leave
        maxParticipants: 5,
      });
      logger.info(
        {
          agentId,
          tenantId,
          deploymentId: testDeployment.id,
          roomName,
        },
        'Created LiveKit phone test room with deploymentId metadata',
      );
    } catch (err: any) {
      logger.error({ err, roomName, deploymentId: testDeployment.id }, 'Failed to create LiveKit room for phone test');
      throw new Error('Failed to create LiveKit room for phone test');
    }

    // 6. Explicitly dispatch the LiveKit agent worker to the phone test room
    const agentName = env.LIVEKIT_AGENT_NAME || 'my-agent';
    const dispatchClient = this.getAgentDispatchClient();
    let dispatchId: string | undefined;
    try {
      const dispatch = await dispatchClient.createDispatch(roomName, agentName, {
        metadata: roomMetadata,
      });
      dispatchId = dispatch.id;
      logger.info(
        {
          agentId,
          tenantId,
          deploymentId: testDeployment.id,
          roomName,
          agentName,
          dispatchId,
        },
        'Explicitly dispatched LiveKit agent worker to phone test room',
      );
    } catch (err: any) {
      logger.error(
        { err, roomName, agentName, deploymentId: testDeployment.id },
        'Failed to dispatch LiveKit agent worker to phone test room',
      );
      throw new Error('Failed to dispatch LiveKit agent worker');
    }

    // 7. Initiate outbound SIP call via LiveKit SipClient
    const sipClient = this.getSipClient();
    const participantIdentity = `sip-${normalizedPhone.replace(/[^a-zA-Z0-9]/g, '')}-${timestamp}`;
    let sipParticipant: any;
    try {
      sipParticipant = await sipClient.createSipParticipant(
        env.LIVEKIT_SIP_TRUNK_ID,
        normalizedPhone,
        roomName,
        {
          participantIdentity,
          participantName: 'Phone Tester',
          playDialtone: true,
          waitUntilAnswered: false,
        },
      );
      logger.info(
        {
          agentId,
          tenantId,
          deploymentId: testDeployment.id,
          roomName,
          trunkId: env.LIVEKIT_SIP_TRUNK_ID,
          to: normalizedPhone,
          sipParticipantId: sipParticipant?.participantId,
          sipCallId: sipParticipant?.sipCallId,
        },
        'Initiated LiveKit SIP outbound phone call',
      );
    } catch (err: any) {
      logger.error(
        {
          err,
          agentId,
          tenantId,
          roomName,
          trunkId: env.LIVEKIT_SIP_TRUNK_ID,
          to: normalizedPhone,
        },
        'Failed to create LiveKit SIP participant',
      );
      throw new Error('Failed to initiate SIP outbound call');
    }

    return {
      success: true,
      roomName,
      callId: sipParticipant?.sipCallId || sipParticipant?.participantId,
      participantId: sipParticipant?.participantId,
      participantIdentity,
      deploymentId: testDeployment.id,
      dispatchId,
    };
  }
}

export const livekitService = new LiveKitService();

