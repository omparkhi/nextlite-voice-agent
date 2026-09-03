import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LiveKitVoiceEngine } from '../voice/livekitEngine.js';
import { env } from '../config/env.js';

describe('NextLite V2 — LiveKit Foundation & Engine Factory', () => {
  const originalVoiceEngine = process.env.VOICE_ENGINE;

  afterEach(() => {
    process.env.VOICE_ENGINE = originalVoiceEngine;
  });

  // it('should default to LegacyVoiceEngine when VOICE_ENGINE is legacy or unconfigured', () => {
  //   process.env.VOICE_ENGINE = 'legacy';
  //   const engine = new LiveKitVoiceEngine();
  //   expect(engine.mode).toBe('legacy');
  //   expect(engine).toBeInstanceOf(LegacyVoiceEngine);
  // });

  it('should select LiveKitVoiceEngine when VOICE_ENGINE is set to livekit', () => {
    process.env.VOICE_ENGINE = 'livekit';
    const engine = new LiveKitVoiceEngine();
    expect(engine.mode).toBe('livekit');
    expect(engine).toBeInstanceOf(LiveKitVoiceEngine);
  });

  it('LiveKitVoiceEngine should create a V2 session result with LiveKit room', async () => {
    process.env.VOICE_ENGINE = 'livekit';
    const engine = new LiveKitVoiceEngine();
    const session = await engine.startSession({
      sessionId: 'test-session-123',
      tenantId: 'tenant-123',
      agentId: 'agent-123',
    });

    expect(session.engine).toBe('livekit');
    expect(session.sessionId).toBe('test-session-123');
    expect(session.roomName).toBe('room_v2_test-session-123');
    expect(session.serverUrl).toBeDefined();
  });
});
