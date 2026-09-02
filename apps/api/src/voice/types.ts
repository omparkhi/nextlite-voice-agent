// Voice runtime types — shared across all transports

export type AudioCodec = 'pcm_s16le' | 'mulaw' | 'mp3';

export type TransportType = 'chat_test' | 'web_voice' | 'real_call';

export type SessionState = 'idle' | 'listening' | 'processing' | 'speaking' | 'ended';

export type AudioFormat = {
  codec: AudioCodec;
  sampleRate: 8000 | 16000 | 24000;
  channels: 1;
};

// Predefined audio format configurations
export const TELEPHONY_FORMAT: AudioFormat = { codec: 'mulaw', sampleRate: 8000, channels: 1 };
export const WEB_FORMAT: AudioFormat = { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 };

// --- STT Interface ---

export interface STTConfig {
  /** Language code in BCP-47 format (e.g., 'hi-IN', 'en-IN', 'auto') */
  languageCode: string;
  /** Sample rate (8000 for telephony, 16000 for web) */
  sampleRate: 8000 | 16000;
  /** Audio encoding */
  encoding: 'linear16' | 'mulaw' | 'alaw';
  /** Stream type: 'fast' for low latency, 'balanced' for accuracy */
  streamType?: 'fast' | 'balanced' | 'simulated';
  /** VAD mode: 'vad' for auto-detection, 'manual' for client-controlled */
  endpointing?: 'vad' | 'manual';
  /** VAD threshold (0.0-1.0, only for vad mode) */
  threshold?: number;
  /** Silence duration in ms to mark end-of-turn (only for vad mode) */
  silenceDurationMs?: number;
  /** Minimum speech duration in ms (only for vad mode) */
  minSpeechDurationMs?: number;
}

export interface STTAdapter {
  readonly name: string;

  /** Connect to STT service */
  connect(config: STTConfig): Promise<void>;

  /** Send audio chunk to STT service */
  sendAudio(audioBuffer: Buffer): Promise<void>;

  /** Signal speech start (manual endpointing mode) */
  sendSpeechStart(): Promise<void>;

  /** Signal speech end (manual endpointing mode) */
  sendSpeechEnd(): Promise<void>;

  /** Flush buffered audio (force finalization) */
  sendFlush(): Promise<void>;

  /** Update configuration mid-stream */
  updateConfig(config: Partial<STTConfig>): Promise<void>;

  /** Register callback for partial transcripts */
  onPartialTranscript(handler: (text: string, language?: string) => void): void;

  /** Register callback for final transcripts */
  onFinalTranscript(handler: (text: string, language?: string, confidence?: number) => void): void;

  /** Register callback for speech start */
  onSpeechStart(handler: () => void): void;

  /** Register callback for speech end */
  onSpeechEnd(handler: () => void): void;

  /** Register callback for errors */
  onError(handler: (error: STTError) => void): void;

  /** Register callback for connection close */
  onClose(handler: (code: number, reason: string) => void): void;

  /** Close the STT connection */
  close(): Promise<void>;

  /** Whether the connection is active */
  isConnected(): boolean;
}

export interface STTError {
  code: string;
  message: string;
  isFatal: boolean;
}

// --- TTS Interface ---

export interface TTSConfig {
  /** Voice ID (provider-specific) */
  voiceId?: string;
  /** Language code in BCP-47 format (e.g., 'hi-IN', 'en-IN') */
  languageCode?: string;
  /** Sample rate for output audio */
  sampleRate?: 8000 | 16000 | 24000;
  /** Audio encoding for output */
  encoding?: 'linear16' | 'mulaw' | 'alaw';
  /** Speech rate multiplier (0.5-2.0) */
  pace?: number;
  /** Temperature (0.0-1.0) */
  temperature?: number;
}

export interface TTSAdapter {
  readonly name: string;

  /** Connect to TTS service */
  connect(config?: TTSConfig): Promise<void>;

  /** Convert text to speech and return audio chunks */
  synthesize(text: string): Promise<Buffer>;

  /** Stream text to speech (returns async iterator of audio chunks) */
  synthesizeStream(text: string): AsyncIterable<Buffer>;

  /** Update configuration mid-stream */
  updateConfig(config: Partial<TTSConfig>): Promise<void>;

  /** Register callback for audio chunks (streaming mode) */
  onAudio(handler: (chunk: Buffer, metadata?: { sampleRate?: number; encoding?: string }) => void): void;

  /** Register callback for speech marks (word boundaries) */
  onSpeechMark(handler: (mark: { word: string; startTime: number; endTime: number }) => void): void;

  /** Register callback for errors */
  onError(handler: (error: { code: string; message: string; isFatal: boolean }) => void): void;

  /** Register callback for connection close */
  onClose(handler: (code: number, reason: string) => void): void;

  /** Close the TTS connection */
  close(): Promise<void>;

  /** Whether the connection is active */
  isConnected(): boolean;

  /** Convert 16kHz PCM to output format (utility) */
  encode(buffer: Buffer, outputFormat: AudioFormat): Buffer;

  /** Convert output format to 16kHz PCM (utility) */
  decode(buffer: Buffer, inputFormat: AudioFormat): Buffer;
}

// --- LLM Interface (reuses existing) ---

export interface VoiceLLMAdapter {
  /** Generate a response given conversation history + system prompt */
  generateResponse(params: {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
}

// --- Voice Message Types ---

export interface VoiceUserMessage {
  type: 'speech' | 'text';
  /** Transcribed text from STT, or raw text for text mode */
  transcript?: string;
  /** Raw audio data (only for speech) */
  audio?: Buffer;
  isFinal: boolean;
  timestamp: number;
}

export interface TurnLatencyMetrics {
  turnId: string;
  t0_userSpeechStart?: number;
  t1_sttPartialStart?: number;
  t2_sttFinalReceived: number;
  t3_llmRequestSent: number;
  t4_llmFirstTokenReceived?: number;
  t5_ttsRequestSent: number;
  t6_ttsFirstAudioReceived: number;
  t7_exotelFirstAudioSent: number;
  t8_ttsComplete?: number;

  // Derived latencies (ms)
  sttLatencyMs?: number;
  llmFirstTokenMs?: number;
  ttsFirstAudioMs?: number;
  transportLatencyMs?: number;
  totalResponseLatencyMs: number;
}

export interface VoiceAgentMessage {
  type: 'speech' | 'text';
  /** Generated text response */
  transcript: string;
  /** Audio data to play (only for speech mode) */
  audio?: Buffer;
  /** Whether this is a partial/streaming response */
  isPartial: boolean;
  timestamp: number;
}

// --- Transport Interface ---

export interface VoiceTransport {
  readonly type: TransportType;
  readonly sessionId: string;

  /** Called when the transport receives user input (audio or text) */
  onMessage(handler: (msg: VoiceUserMessage) => void): void;

  /** Called when the session is ended (by user or timeout) */
  onClose(handler: () => void): void;

  /** Send agent response to the transport */
  send(message: VoiceAgentMessage): Promise<void>;

  /** Stop current playback / interrupt */
  stopPlayback(): Promise<void>;

  /** Close the transport and clean up */
  close(): Promise<void>;

  /** Whether this transport supports real-time audio streaming */
  supportsStreaming(): boolean;
}

// --- Voice Session Config ---

export interface VoiceSessionConfig {
  sessionId: string;
  tenantId: string;
  agentId: string;
  transport: TransportType;
  inputFormat: AudioFormat;
  outputFormat: AudioFormat;
  /** Max session duration in ms (default: 10 minutes) */
  maxDurationMs?: number;
  /** Max silence before timeout in ms (default: 30s) */
  silenceTimeoutMs?: number;
}

// --- Voice Runtime Interface ---

export interface IVoiceRuntime {
  /** Start a new voice session */
  startSession(config: VoiceSessionConfig): Promise<unknown>;

  /** Get active session by ID */
  getSession(sessionId: string): unknown | undefined;

  /** End a session */
  endSession(sessionId: string): Promise<void>;
}
