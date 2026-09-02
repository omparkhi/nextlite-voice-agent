import { EventEmitter } from 'events';
import type { VoiceTransport, VoiceUserMessage, VoiceAgentMessage, TransportType } from './types.js';
import { VoiceSession } from './session.js';

/**
 * Base transport class with common logic.
 * Concrete transports (Web Voice, Plivo) extend this.
 */
export abstract class BaseTransport extends EventEmitter implements VoiceTransport {
  readonly type: TransportType;
  readonly sessionId: string;

  protected session: VoiceSession;
  protected messageHandler: ((msg: VoiceUserMessage) => void) | null = null;
  protected closeHandler: (() => void) | null = null;
  protected _closed = false;

  constructor(type: TransportType, session?: VoiceSession) {
    super();
    this.type = type;
    this.sessionId = session?.id ?? 'test-session-id';
    this.session = session!;
  }

  onMessage(handler: (msg: VoiceUserMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  abstract send(message: VoiceAgentMessage): Promise<void>;
  abstract stopPlayback(): Promise<void>;
  abstract supportsStreaming(): boolean;

  /** Handle incoming user message — subclasses call this */
  protected handleUserMessage(msg: VoiceUserMessage): void {
    if (this._closed) return;
    if (this.messageHandler) {
      this.messageHandler(msg);
    }
  }

  /** Handle transport close — subclasses call this */
  protected handleClose(): void {
    if (this._closed) return;
    this._closed = true;
    if (this.closeHandler) {
      this.closeHandler();
    }
  }

  async close(): Promise<void> {
    this._closed = true;
  }
}

/**
 * In-memory transport for text-based chat testing.
 * This is the simplest transport — no audio, no WebSocket.
 */
export class ChatTestTransport extends BaseTransport {
  readonly type = 'chat_test' as const;

  constructor(session: VoiceSession) {
    super('chat_test', session);
  }

  /** Simulate a user message from text input */
  async sendText(text: string): Promise<void> {
    this.handleUserMessage({
      type: 'text',
      transcript: text,
      isFinal: true,
      timestamp: Date.now(),
    });
  }

  async send(message: VoiceAgentMessage): Promise<void> {
    // Chat test just returns text — no audio to send
    // The runtime will handle displaying the text
  }

  async stopPlayback(): Promise<void> {
    // No audio playback in chat mode
  }

  supportsStreaming(): boolean {
    return false;
  }
}
