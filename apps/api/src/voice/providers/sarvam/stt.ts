// Sarvam Saaras v3 Realtime Streaming STT Adapter
// Reference: https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/realtime-streaming

import type { STTAdapter, STTConfig, STTError } from '../../types.js';
import { createChildLogger } from '../../../lib/logger.js';

const logger = createChildLogger({ module: 'sarvam-stt' });

/** Generic WebSocket interface */
interface STTWebSocket {
  readyState: number;
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  on(event: string, handler: (...args: any[]) => void): void;
}

/** WebSocket constructor interface */
export interface WebSocketConstructor {
  new (url: string, protocols?: string | string[], options?: any): STTWebSocket;
}

export interface SarvamSTTConfig {
  apiKey: string;
  baseUrl?: string;
  /** Optional WebSocket constructor for testing */
  wsConstructor?: WebSocketConstructor;
}

/**
 * Sarvam Saaras v3 Realtime Streaming STT Adapter.
 *
 * Uses the new `saaras:v3-realtime` model for:
 * - True partial transcripts
 * - Millisecond-based VAD tuning
 * - Live mid-stream reconfiguration
 *
 * Audio format: 16-bit linear PCM, mono, 8kHz or 16kHz.
 * Exotel provides 8kHz PCM by default.
 */
export class SarvamSTTAdapter implements STTAdapter {
  readonly name = 'sarvam-saaras-v3';

  private apiKey: string;
  private baseUrl: string;
  private wsConstructor: WebSocketConstructor;
  private ws: STTWebSocket | null = null;
  private config: STTConfig | null = null;
  private connected = false;

  // Event handlers
  private partialHandler: ((text: string, language?: string) => void) | null = null;
  private finalHandler: ((text: string, language?: string, confidence?: number) => void) | null = null;
  private speechStartHandler: (() => void) | null = null;
  private speechEndHandler: (() => void) | null = null;
  private errorHandler: ((error: STTError) => void) | null = null;
  private closeHandler: ((code: number, reason: string) => void) | null = null;

  constructor(sarvamConfig: SarvamSTTConfig) {
    this.apiKey = sarvamConfig.apiKey;
    this.baseUrl = sarvamConfig.baseUrl ?? 'wss://api.sarvam.ai';
    this.wsConstructor = sarvamConfig.wsConstructor ?? this.loadWebSocketConstructor();
  }

  private loadWebSocketConstructor(): WebSocketConstructor {
    // Dynamic import to avoid TypeScript module resolution issues
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ws = require('ws');
      return ws.WebSocket;
    } catch {
      throw new Error('ws module not found. Install ws package or provide wsConstructor.');
    }
  }

  async connect(config: STTConfig): Promise<void> {
    if (this.connected) {
      throw new Error('STT adapter already connected');
    }

    this.config = config;

    // Build WebSocket URL with query parameters
    const params = new URLSearchParams({
      language_code: config.languageCode,
      model: 'saaras:v3-realtime',
      stream_type: config.streamType ?? 'fast',
      mode: 'transcribe',
      endpointing: config.endpointing ?? 'vad',
      encoding: config.encoding,
      sample_rate: String(config.sampleRate),
    });

    // Add VAD parameters if in vad mode (with robust defaults to prevent noise endpointing)
    if (config.endpointing === 'vad' || !config.endpointing) {
      const threshold = config.threshold ?? 0.5;
      const silenceDurationMs = config.silenceDurationMs ?? 600;
      const minSpeechDurationMs = config.minSpeechDurationMs ?? 250;

      params.set('threshold', String(threshold));
      params.set('silence_duration_ms', String(silenceDurationMs));
      params.set('min_speech_duration_ms', String(minSpeechDurationMs));
    }

    const url = `${this.baseUrl}/speech-to-text-realtime/ws?${params.toString()}`;

    logger.info({ languageCode: config.languageCode, sampleRate: config.sampleRate }, 'Connecting to Sarvam STT');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new this.wsConstructor(url, [], {
          headers: {
            'api-subscription-key': this.apiKey,
          },
        });

        this.ws.on('open', () => {
          this.connected = true;
          logger.info('Sarvam STT connected');
          resolve();
        });

        this.ws.on('message', (data: any) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', (code: number, reason: any) => {
          const reasonStr = reason?.toString() ?? '';
          logger.info({ code, reason: reasonStr }, 'Sarvam STT connection closed');
          this.connected = false;
          if (this.closeHandler) {
            this.closeHandler(code, reasonStr);
          }
        });

        this.ws.on('error', (error: any) => {
          logger.error({ error }, 'Sarvam STT WebSocket error');
          this.connected = false;
          if (this.errorHandler) {
            this.errorHandler({
              code: 'WEBSOCKET_ERROR',
              message: error.message ?? 'WebSocket error',
              isFatal: true,
            });
          }
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async sendAudio(audioBuffer: Buffer): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error('STT adapter not connected');
    }

    const message = {
      event: 'audio_input',
      audio: audioBuffer.toString('base64'),
    };

    this.ws.send(JSON.stringify(message));
  }

  async sendSpeechStart(): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error('STT adapter not connected');
    }

    this.ws.send(JSON.stringify({ event: 'speech_start' }));
  }

  async sendSpeechEnd(): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error('STT adapter not connected');
    }

    this.ws.send(JSON.stringify({ event: 'speech_end' }));
  }

  async sendFlush(): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error('STT adapter not connected');
    }

    this.ws.send(JSON.stringify({ event: 'flush' }));
  }

  async updateConfig(config: Partial<STTConfig>): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error('STT adapter not connected');
    }

    const updateMessage: Record<string, unknown> = {
      event: 'config.update',
    };

    // Only include configurable fields
    if (config.languageCode !== undefined) updateMessage.language_code = config.languageCode;
    if (config.streamType !== undefined) updateMessage.stream_type = config.streamType;
    if (config.endpointing !== undefined) updateMessage.endpointing = config.endpointing;
    if (config.threshold !== undefined) updateMessage.threshold = config.threshold;
    if (config.silenceDurationMs !== undefined) updateMessage.silence_duration_ms = config.silenceDurationMs;
    if (config.minSpeechDurationMs !== undefined) updateMessage.min_speech_duration_ms = config.minSpeechDurationMs;

    this.ws.send(JSON.stringify(updateMessage));
    logger.debug({ config: updateMessage }, 'STT config updated');
  }

  onPartialTranscript(handler: (text: string, language?: string) => void): void {
    this.partialHandler = handler;
  }

  onFinalTranscript(handler: (text: string, language?: string, confidence?: number) => void): void {
    this.finalHandler = handler;
  }

  onSpeechStart(handler: () => void): void {
    this.speechStartHandler = handler;
  }

  onSpeechEnd(handler: () => void): void {
    this.speechEndHandler = handler;
  }

  onError(handler: (error: STTError) => void): void {
    this.errorHandler = handler;
  }

  onClose(handler: (code: number, reason: string) => void): void {
    this.closeHandler = handler;
  }

  async close(): Promise<void> {
    if (!this.connected || !this.ws) {
      return;
    }

    // Send end message for graceful close
    try {
      this.ws.send(JSON.stringify({ event: 'end' }));
    } catch {
      // Ignore errors during close
    }

    // Close the WebSocket
    this.ws.close(1000, 'Client closing');
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.event) {
        case 'session.begin':
          logger.info({ eventType: 'STT EVENT', eventName: 'session.begin', timestamp: Date.now() }, 'STT EVENT: session.begin');
          break;

        case 'transcript.partial':
          logger.info({ eventType: 'STT PARTIAL', isFinal: false, text: message.text, language: message.language, timestamp: Date.now() }, 'STT PARTIAL');
          if (this.partialHandler) {
            this.partialHandler(message.text, message.language);
          }
          break;

        case 'transcript.final':
          logger.info({
            eventType: 'STT FINAL',
            isFinal: true,
            text: message.text,
            confidence: message.language_confidence,
            language: message.language,
            timestamp: Date.now(),
          }, `STT FINAL: text="${message.text}" confidence=${message.language_confidence ?? 'n/a'}`);
          if (this.finalHandler) {
            this.finalHandler(message.text, message.language, message.language_confidence);
          }
          break;

        case 'vad.speech_start':
          logger.info({ eventType: 'STT EVENT', eventName: 'vad.speech_start', timestamp: Date.now() }, 'STT EVENT: vad.speech_start');
          if (this.speechStartHandler) {
            this.speechStartHandler();
          }
          break;

        case 'vad.speech_end':
          logger.info({ eventType: 'STT EVENT', eventName: 'vad.speech_end', timestamp: Date.now() }, 'STT EVENT: vad.speech_end');
          if (this.speechEndHandler) {
            this.speechEndHandler();
          }
          break;

        case 'config.updated':
          logger.debug('STT config update acknowledged');
          break;

        case 'pong':
          // Keepalive response
          break;

        case 'session.end':
          logger.info({ audioDurationS: message.audio_duration_s }, 'STT session ended');
          this.connected = false;
          break;

        case 'error':
          logger.error({ code: message.code, message: message.message, isFatal: message.is_fatal }, 'STT error');
          if (this.errorHandler) {
            this.errorHandler({
              code: message.code ?? 'UNKNOWN',
              message: message.message ?? 'Unknown error',
              isFatal: message.is_fatal ?? false,
            });
          }
          break;

        default:
          logger.debug({ event: message.event }, 'Unknown STT event');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to parse STT message');
    }
  }
}

export function createSarvamSTTAdapter(apiKey: string): SarvamSTTAdapter {
  return new SarvamSTTAdapter({ apiKey });
}
