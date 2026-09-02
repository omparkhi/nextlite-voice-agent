import { EventEmitter } from 'events';
import type {
  VoiceSessionConfig,
  VoiceUserMessage,
  VoiceAgentMessage,
  VoiceTransport,
  SessionState,
} from './types.js';

export class VoiceSession extends EventEmitter {
  readonly id: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly transport: string;
  readonly inputFormat: VoiceSessionConfig['inputFormat'];
  readonly outputFormat: VoiceSessionConfig['outputFormat'];

  private _state: SessionState = 'idle';
  private _history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> = [];
  private _transport: VoiceTransport | null = null;
  private _createdAt: number;
  private _endedAt: number | null = null;
  private _maxDurationMs: number;
  private _silenceTimeoutMs: number;
  private _durationTimer: NodeJS.Timeout | null = null;
  private _silenceTimer: NodeJS.Timeout | null = null;

  constructor(config: VoiceSessionConfig) {
    super();
    this.id = config.sessionId;
    this.tenantId = config.tenantId;
    this.agentId = config.agentId;
    this.transport = config.transport;
    this.inputFormat = config.inputFormat;
    this.outputFormat = config.outputFormat;
    this._maxDurationMs = config.maxDurationMs ?? 10 * 60 * 1000; // 10 minutes
    this._silenceTimeoutMs = config.silenceTimeoutMs ?? 30_000; // 30 seconds
    this._createdAt = Date.now();
  }

  get state(): SessionState {
    return this._state;
  }

  get history(): ReadonlyArray<{ role: 'user' | 'assistant'; content: string; timestamp: number }> {
    return this._history;
  }

  get createdAt(): number {
    return this._createdAt;
  }

  get endedAt(): number | null {
    return this._endedAt;
  }

  get durationMs(): number {
    const end = this._endedAt ?? Date.now();
    return end - this._createdAt;
  }

  attachTransport(transport: VoiceTransport): void {
    this._transport = transport;
    this.setState('idle');
  }

  /** Add a user message to conversation history */
  addUserMessage(content: string): void {
    this._history.push({
      role: 'user',
      content,
      timestamp: Date.now(),
    });
    this.emit('user_message', content);
  }

  /** Add an assistant message to conversation history */
  addAssistantMessage(content: string): void {
    this._history.push({
      role: 'assistant',
      content,
      timestamp: Date.now(),
    });
    this.emit('assistant_message', content);
  }

  /** Send agent response to the transport */
  async sendToTransport(message: VoiceAgentMessage): Promise<void> {
    if (!this._transport) {
      throw new Error('No transport attached to session');
    }
    await this._transport.send(message);
  }

  /** Stop current playback */
  async stopPlayback(): Promise<void> {
    if (this._transport) {
      await this._transport.stopPlayback();
    }
  }

  /** Transition to a new state */
  setState(newState: SessionState): void {
    const oldState = this._state;
    if (oldState === newState) return;

    if (oldState === 'ended') {
      throw new Error('Cannot change state of ended session');
    }

    this._state = newState;
    this.emit('state_change', newState, oldState);

    // Reset silence timer when entering listening state
    if (newState === 'listening') {
      this.resetSilenceTimer();
    } else {
      this.clearSilenceTimer();
    }
  }

  /** Start session duration timer */
  startDurationTimer(): void {
    this.clearDurationTimer();
    this._durationTimer = setTimeout(() => {
      this.emit('timeout', 'max_duration');
      this.end('timeout');
    }, this._maxDurationMs);
  }

  /** End the session */
  async end(reason: string): Promise<void> {
    if (this._state === 'ended') return;

    this._endedAt = Date.now();
    this._state = 'ended';
    this.clearDurationTimer();
    this.clearSilenceTimer();

    if (this._transport) {
      try {
        await this._transport.close();
      } catch {
        // Ignore close errors
      }
    }

    this.emit('end', { reason, duration: this.durationMs });
  }

  /** Get conversation history in LLM format */
  getLLMHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this._history.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this._silenceTimer = setTimeout(() => {
      this.emit('timeout', 'silence');
    }, this._silenceTimeoutMs);
  }

  private clearSilenceTimer(): void {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  private clearDurationTimer(): void {
    if (this._durationTimer) {
      clearTimeout(this._durationTimer);
      this._durationTimer = null;
    }
  }
}
