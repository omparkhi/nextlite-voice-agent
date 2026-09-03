import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { VoiceEngineMode } from '@nextlite/shared';

export interface VoiceEngine {
  mode: VoiceEngineMode;
  startSession(config: any): Promise<any>;
}

export class LiveKitVoiceEngine implements VoiceEngine {
  public mode: VoiceEngineMode = 'livekit';

  async startSession(config: any): Promise<any> {
    logger.info({ sessionId: config.sessionId, agentId: config.agentId }, 'Starting V2 LiveKit Voice Engine session');
    const roomName = `room_v2_${config.sessionId}`;
    return {
      engine: 'livekit',
      sessionId: config.sessionId,
      roomName,
      serverUrl: env.LIVEKIT_URL,
    };
  }
}
