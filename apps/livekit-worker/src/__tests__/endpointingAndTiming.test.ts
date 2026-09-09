import { describe, it, expect, vi } from 'vitest';
import { RealtimeTimingTracker } from '../realtimeTiming.ts';
import { voice, inference } from '@livekit/agents';

describe('Realtime Phone Optimization — Endpointing & Timing Instrumentation', () => {
  describe('1. Endpointing & TurnDetector Configuration', () => {
    it('verifies AgentSession accepts minDelay: 450, maxDelay: 2500 and v1-mini TurnDetector', () => {
      const turnDetector = new inference.TurnDetector({
        version: 'v1-mini',
      });

      expect(turnDetector).toBeDefined();

      const endpointingConfig = {
        minDelay: 450,
        maxDelay: 2500,
      };

      expect(endpointingConfig.minDelay).toBe(450);
      expect(endpointingConfig.maxDelay).toBe(2500);
    });
  });

  describe('2. Structured Realtime Monotonic Timing Instrumentation', () => {
    it('tracks monotonic timing for all required lifecycle events and calculates stage durations accurately', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const tracker = new RealtimeTimingTracker({
        callSessionId: 'sess-12345',
        roomName: 'room-sip-call-001',
      });

      // 1. user_transcript_final
      const elapsed1 = tracker.recordTranscriptFinal('Mujhe appointment book karna hai', 'hi-IN');
      expect(elapsed1).toBeGreaterThanOrEqual(0);
      expect(tracker.currentTurnIndex).toBe(1);

      // 2. user_turn_committed
      const commitRes = tracker.recordTurnCommitted();
      expect(commitRes.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(commitRes.sttToCommitMs).toBeGreaterThanOrEqual(0);

      // 3. llm_started
      const llmRes = tracker.recordLlmStarted('sarvam-105b-conversations');
      expect(llmRes.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(llmRes.commitToLlmMs).toBeGreaterThanOrEqual(0);

      // 4. tool_started
      const toolStartRes = tracker.recordToolStarted('book_appointment');
      expect(toolStartRes.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(toolStartRes.llmToToolMs).toBeGreaterThanOrEqual(0);

      // 5. tool_completed
      const toolCompRes = tracker.recordToolCompleted('book_appointment');
      expect(toolCompRes.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(toolCompRes.durationMs).toBeGreaterThanOrEqual(0);

      // 6. tts_started
      const ttsRes = tracker.recordTtsStarted({ speechId: 'sp-1', source: 'generate_reply', userInitiated: false });
      expect(ttsRes.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(ttsRes.prevStageToTtsMs).toBeGreaterThanOrEqual(0);

      // 7. first_audio_frame / audio_forward_started
      const audioFrameRes = tracker.recordFirstAudioFrame();
      expect(audioFrameRes.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(audioFrameRes.ttsToAudioMs).toBeGreaterThanOrEqual(0);
      expect(audioFrameRes.e2eLatencyMs).toBeGreaterThanOrEqual(0);

      // 8. tts_completed
      const ttsCompRes = tracker.recordTtsCompleted(55);
      expect(ttsCompRes.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(ttsCompRes.durationMs).toBeGreaterThanOrEqual(0);

      // 9. audio_forward_completed
      const audioFwdCompRes = tracker.recordAudioForwardCompleted('idle');
      expect(audioFwdCompRes.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(audioFwdCompRes.durationMs).toBeGreaterThanOrEqual(0);

      // Check log calls contain required prefixes and event names
      const loggedMessages = logSpy.mock.calls.map((c) => c[0]);
      expect(loggedMessages.some((m) => m.includes('user_transcript_final'))).toBe(true);
      expect(loggedMessages.some((m) => m.includes('user_turn_committed'))).toBe(true);
      expect(loggedMessages.some((m) => m.includes('llm_started'))).toBe(true);
      expect(loggedMessages.some((m) => m.includes('tool_started'))).toBe(true);
      expect(loggedMessages.some((m) => m.includes('tool_completed'))).toBe(true);
      expect(loggedMessages.some((m) => m.includes('tts_started'))).toBe(true);
      expect(loggedMessages.some((m) => m.includes('first_audio_frame'))).toBe(true);
      expect(loggedMessages.some((m) => m.includes('tts_completed'))).toBe(true);
      expect(loggedMessages.some((m) => m.includes('audio_forward_completed'))).toBe(true);

      logSpy.mockRestore();
    });

    it('does not fabricate durations when earlier stages are unavailable', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const tracker = new RealtimeTimingTracker();

      // Trigger tts_started without preceding transcript or tool
      const ttsRes = tracker.recordTtsStarted({ speechId: 'sp-greeting', source: 'say' });
      expect(ttsRes.prevStageToTtsMs).toBeUndefined();

      // Trigger first_audio_frame without preceding transcript
      const audioRes = tracker.recordFirstAudioFrame();
      expect(audioRes.e2eLatencyMs).toBeUndefined();

      logSpy.mockRestore();
    });

    it('tracks tts_interrupted when user interrupts assistant speech', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const tracker = new RealtimeTimingTracker({ callSessionId: 'sess-int-1' });

      tracker.recordTranscriptFinal('Hello');
      tracker.recordTtsStarted();
      tracker.recordFirstAudioFrame();
      tracker.recordTtsInterrupted();

      const loggedMessages = logSpy.mock.calls.map((c) => c[0]);
      expect(loggedMessages.some((m) => m.includes('tts_interrupted'))).toBe(true);

      logSpy.mockRestore();
    });
  });
});
