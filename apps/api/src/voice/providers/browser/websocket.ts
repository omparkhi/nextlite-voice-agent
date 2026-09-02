import type { VoiceAgentMessage, VoiceUserMessage } from '../../types.js';
import { BaseTransport } from '../../transports.js';
import { VoiceSession } from '../../session.js';
import { createChildLogger } from '../../../lib/logger.js';

const logger = createChildLogger({ module: 'browser-transport' });

/** WebSocket interface for browser connections */
interface BrowserWebSocket {
  readyState: number;
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  on(event: string, handler: (...args: any[]) => void): void;
}

/** Browser → Backend events */
export interface BrowserAudioEvent {
  type: 'audio';
  /** Base64-encoded PCM16 audio at sampleRate Hz */
  data: string;
}

export interface BrowserStartEvent {
  type: 'start';
  /** Sample rate the browser is sending at */
  sampleRate: number;
}

export interface BrowserStopEvent {
  type: 'stop';
}

export interface BrowserClearEvent {
  type: 'clear';
}

export type BrowserInboundEvent = BrowserAudioEvent | BrowserStartEvent | BrowserStopEvent | BrowserClearEvent;

/** Backend → Browser events */
export interface BrowserAudioOutEvent {
  type: 'audio';
  /** Base64-encoded PCM16 audio */
  data: string;
  /** Sample rate of the audio */
  sampleRate: number;
}

export interface BrowserStateEvent {
  type: 'state';
  state: 'listening' | 'thinking' | 'speaking' | 'ended';
}

export interface BrowserTranscriptEvent {
  type: 'transcript';
  text: string;
  isFinal: boolean;
}

export interface BrowserErrorEvent {
  type: 'error';
  message: string;
}

export type BrowserOutboundEvent = BrowserAudioOutEvent | BrowserStateEvent | BrowserTranscriptEvent | BrowserErrorEvent;

export interface BrowserTransportOptions {
  /** Sample rate for audio exchange (default: 16000) */
  sampleRate?: number;
}

/**
 * Browser Web Voice transport.
 * Handles bidirectional WebSocket audio streaming with browser clients.
 *
 * Audio format: 16-bit linear PCM, mono, 16kHz.
 *
 * Flow:
 *   Browser mic → WebSocket → PCM buffer → STT → VoiceRuntime → TTS
 *   → PCM buffer → WebSocket → Browser playback
 */
export class BrowserTransport extends BaseTransport {
  readonly type = 'web_voice' as const;

  private ws: BrowserWebSocket;
  private sampleRate: number;
  private _supportsStreaming = true;

  constructor(
    ws: BrowserWebSocket,
    session: VoiceSession,
    options: BrowserTransportOptions = {},
  ) {
    super('web_voice', session);
    this.ws = ws;
    this.sampleRate = options.sampleRate ?? 16000;

    this.setupWebSocketHandlers();
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Send agent response to browser.
   * If response has audio, send it as base64 PCM16.
   * Always send transcript for display.
   * Send state updates for UI feedback.
   */
  async send(message: VoiceAgentMessage): Promise<void> {
    if (this._closed) return;

    // Send state: thinking → speaking
    this.sendJSON({ type: 'state', state: 'speaking' });

    // Send transcript for display
    if (message.transcript) {
      this.sendJSON({
        type: 'transcript',
        text: message.transcript,
        isFinal: true,
      });
    }

    // Send audio if available
    if (message.audio && message.audio.length > 0) {
      const base64Payload = message.audio.toString('base64');
      this.sendJSON({
        type: 'audio',
        data: base64Payload,
        sampleRate: this.sampleRate,
      });
    }

    // After sending audio, transition back to listening
    // (the runtime will manage actual state transitions)
  }

  /**
   * Send state update to browser.
   */
  sendState(state: 'listening' | 'thinking' | 'speaking' | 'ended'): void {
    this.sendJSON({ type: 'state', state });
  }

  /**
   * Send partial transcript to browser.
   */
  sendPartialTranscript(text: string): void {
    this.sendJSON({ type: 'transcript', text, isFinal: false });
  }

  /**
   * Send error to browser.
   */
  sendError(message: string): void {
    this.sendJSON({ type: 'error', message });
  }

  /**
   * Stop current playback (for interruption).
   */
  async stopPlayback(): Promise<void> {
    // Send clear event to browser to stop audio playback
    this.sendJSON({ type: 'state', state: 'listening' });
  }

  supportsStreaming(): boolean {
    return this._supportsStreaming;
  }

  async close(): Promise<void> {
    if (this._closed) return;

    // Send ended state before closing
    this.sendJSON({ type: 'state', state: 'ended' });

    this._closed = true;
    this.handleClose();
  }

  private setupWebSocketHandlers(): void {
    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString()) as BrowserInboundEvent;
        this.handleBrowserEvent(event);
      } catch (error) {
        logger.error({ error }, 'Failed to parse browser event');
      }
    });

    this.ws.on('close', (code, reason) => {
      logger.info({ code, reason: reason.toString() }, 'Browser WebSocket closed');
      this.handleClose();
    });

    this.ws.on('error', (error) => {
      logger.error({ error }, 'Browser WebSocket error');
      this.handleClose();
    });
  }

  private handleBrowserEvent(event: BrowserInboundEvent): void {
    switch (event.type) {
      case 'audio': {
        // Decode base64 PCM16 audio and forward to STT
        const audioBuffer = Buffer.from(event.data, 'base64');
        this.handleUserMessage({
          type: 'speech',
          audio: audioBuffer,
          isFinal: true,
          timestamp: Date.now(),
        });
        break;
      }

      case 'start':
        // Browser indicates it's starting to send audio
        logger.info({ sampleRate: event.sampleRate }, 'Browser audio started');
        break;

      case 'stop':
        // Browser indicates it stopped sending audio
        logger.info('Browser audio stopped');
        break;

      case 'clear':
        // Browser requests interruption
        logger.info('Browser requested clear');
        this.session.stopPlayback().catch(() => {});
        break;

      default:
        break;
    }
  }

  private sendJSON(event: BrowserOutboundEvent): void {
    if (this._closed) return;
    try {
      this.ws.send(JSON.stringify(event));
    } catch (error) {
      logger.error({ error }, 'Failed to send to browser');
    }
  }
}
