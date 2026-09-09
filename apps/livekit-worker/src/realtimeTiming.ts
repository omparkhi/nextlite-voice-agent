export interface TurnTimingContext {
  callSessionId?: string | undefined;
  roomName?: string | undefined;
  turnIndex: number;
}

/**
 * Structured Realtime Timing Instrumentation
 * 
 * Uses monotonic clock (performance.now()) exclusively to measure stages across:
 * - user_transcript_final
 * - user_turn_committed
 * - llm_started
 * - tool_started
 * - tool_completed
 * - tts_started
 * - first_audio_frame / audio_forward_started
 * - audio_forward_completed
 * - tts_completed
 * - tts_interrupted
 */
export class RealtimeTimingTracker {
  private sessionMonotonicStart: number;
  private callSessionId?: string | undefined;
  private roomName?: string | undefined;
  private turnIndex: number = 0;

  // Turn-scoped monotonic timestamps
  private tTranscriptFinal?: number | undefined;
  private tTurnCommitted?: number | undefined;
  private tLlmStarted?: number | undefined;
  private tToolStarted?: number | undefined;
  private tToolCompleted?: number | undefined;
  private tTtsStarted?: number | undefined;
  private tFirstAudioFrame?: number | undefined;
  private tTtsCompleted?: number | undefined;
  private tAudioForwardCompleted?: number | undefined;

  constructor(options?: { callSessionId?: string | undefined; roomName?: string | undefined }) {
    this.sessionMonotonicStart = performance.now();
    this.callSessionId = options?.callSessionId;
    this.roomName = options?.roomName;
  }

  setCallSessionId(id: string): void {
    this.callSessionId = id;
  }

  setRoomName(name: string): void {
    this.roomName = name;
  }

  get currentTurnIndex(): number {
    return this.turnIndex;
  }

  get elapsedSessionMs(): number {
    return Math.round(performance.now() - this.sessionMonotonicStart);
  }

  recordTranscriptFinal(transcript: string, language?: string | null): number {
    this.turnIndex++;
    this.tTranscriptFinal = performance.now();
    this.tTurnCommitted = undefined;
    this.tLlmStarted = undefined;
    this.tToolStarted = undefined;
    this.tToolCompleted = undefined;
    this.tTtsStarted = undefined;
    this.tFirstAudioFrame = undefined;
    this.tTtsCompleted = undefined;
    this.tAudioForwardCompleted = undefined;

    const elapsed = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] user_transcript_final transcript="${transcript}" language=${language || 'none'} callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} elapsedMs=${elapsed}`,
    );
    return elapsed;
  }

  recordTurnCommitted(): { elapsedMs: number; sttToCommitMs?: number | undefined } {
    this.tTurnCommitted = performance.now();
    const sttToCommitMs = this.tTranscriptFinal !== undefined ? Math.round(this.tTurnCommitted - this.tTranscriptFinal) : undefined;
    const elapsedMs = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] user_turn_committed callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} ${sttToCommitMs !== undefined ? `sttToCommitMs=${sttToCommitMs} ` : ''}elapsedMs=${elapsedMs}`,
    );
    return { elapsedMs, sttToCommitMs };
  }

  recordLlmStarted(model?: string): { elapsedMs: number; commitToLlmMs?: number | undefined } {
    this.tLlmStarted = performance.now();
    const commitToLlmMs = this.tTurnCommitted !== undefined ? Math.round(this.tLlmStarted - this.tTurnCommitted) : undefined;
    const elapsedMs = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] llm_started model=${model || 'default'} callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} ${commitToLlmMs !== undefined ? `commitToLlmMs=${commitToLlmMs} ` : ''}elapsedMs=${elapsedMs}`,
    );
    return { elapsedMs, commitToLlmMs };
  }

  recordToolStarted(toolName: string): { elapsedMs: number; llmToToolMs?: number | undefined } {
    this.tToolStarted = performance.now();
    const llmToToolMs = this.tLlmStarted !== undefined ? Math.round(this.tToolStarted - this.tLlmStarted) : undefined;
    const elapsedMs = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] tool_started tool=${toolName} callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} ${llmToToolMs !== undefined ? `llmToToolMs=${llmToToolMs} ` : ''}elapsedMs=${elapsedMs}`,
    );
    return { elapsedMs, llmToToolMs };
  }

  recordToolCompleted(toolName: string): { elapsedMs: number; durationMs?: number | undefined } {
    this.tToolCompleted = performance.now();
    const durationMs = this.tToolStarted !== undefined ? Math.round(this.tToolCompleted - this.tToolStarted) : undefined;
    const elapsedMs = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] tool_completed tool=${toolName} callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} ${durationMs !== undefined ? `durationMs=${durationMs} ` : ''}elapsedMs=${elapsedMs}`,
    );
    return { elapsedMs, durationMs };
  }

  recordTtsStarted(details?: { speechId?: string | undefined; source?: string | undefined; userInitiated?: boolean | undefined }): {
    elapsedMs: number;
    prevStageToTtsMs?: number | undefined;
  } {
    this.tTtsStarted = performance.now();
    const prevStage = this.tToolCompleted ?? this.tLlmStarted ?? this.tTurnCommitted;
    const prevStageToTtsMs = prevStage !== undefined ? Math.round(this.tTtsStarted - prevStage) : undefined;
    const elapsedMs = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] tts_started speech_id=${details?.speechId || 'none'} source=${details?.source || 'unknown'} userInitiated=${details?.userInitiated ?? false} callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} ${prevStageToTtsMs !== undefined ? `prevStageToTtsMs=${prevStageToTtsMs} ` : ''}elapsedMs=${elapsedMs}`,
    );
    return { elapsedMs, prevStageToTtsMs };
  }

  recordFirstAudioFrame(): {
    elapsedMs: number;
    ttsToAudioMs?: number | undefined;
    e2eLatencyMs?: number | undefined;
  } {
    this.tFirstAudioFrame = performance.now();
    const ttsToAudioMs = this.tTtsStarted !== undefined ? Math.round(this.tFirstAudioFrame - this.tTtsStarted) : undefined;
    const e2eLatencyMs = this.tTranscriptFinal !== undefined ? Math.round(this.tFirstAudioFrame - this.tTranscriptFinal) : undefined;
    const elapsedMs = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] first_audio_frame / audio_forward_started state=speaking callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} ${ttsToAudioMs !== undefined ? `ttsToAudioMs=${ttsToAudioMs} ` : ''}${e2eLatencyMs !== undefined ? `e2eLatencyMs=${e2eLatencyMs} ` : ''}elapsedMs=${elapsedMs}`,
    );
    return { elapsedMs, ttsToAudioMs, e2eLatencyMs };
  }

  recordAudioForwardCompleted(newState?: string): { elapsedMs: number; durationMs?: number | undefined } {
    this.tAudioForwardCompleted = performance.now();
    const durationMs = this.tFirstAudioFrame !== undefined ? Math.round(this.tAudioForwardCompleted - this.tFirstAudioFrame) : undefined;
    const elapsedMs = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] audio_forward_completed oldState=speaking newState=${newState || 'idle'} callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} ${durationMs !== undefined ? `durationMs=${durationMs} ` : ''}elapsedMs=${elapsedMs}`,
    );
    return { elapsedMs, durationMs };
  }

  recordTtsCompleted(textLength: number): { elapsedMs: number; durationMs?: number | undefined } {
    this.tTtsCompleted = performance.now();
    const durationMs = this.tTtsStarted !== undefined ? Math.round(this.tTtsCompleted - this.tTtsStarted) : undefined;
    const elapsedMs = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] tts_completed textLength=${textLength} callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} ${durationMs !== undefined ? `durationMs=${durationMs} ` : ''}elapsedMs=${elapsedMs}`,
    );
    return { elapsedMs, durationMs };
  }

  recordTtsInterrupted(): { elapsedMs: number } {
    const elapsedMs = this.elapsedSessionMs;
    console.log(
      `[AudioTiming] tts_interrupted callSessionId=${this.callSessionId || 'none'} roomName=${this.roomName || 'none'} turn=${this.turnIndex} elapsedMs=${elapsedMs}`,
    );
    return { elapsedMs };
  }
}
