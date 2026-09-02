import type { VoiceAgentMessage, VoiceUserMessage, AudioFormat } from '../../types.js';
import { BaseTransport } from '../../transports.js';
import { VoiceSession } from '../../session.js';
import type { ExotelTransportOptions } from './types.js';
import { createChildLogger } from '../../../lib/logger.js';

const logger = createChildLogger({ module: 'exotel-transport' });

/** Generic WebSocket interface compatible with Exotel AgentStream */
interface AgentStreamWebSocket {
  readyState: number;
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  on(event: string, handler: (...args: any[]) => void): void;
}

/**
 * Exotel AgentStream transport.
 * Handles bidirectional WebSocket audio streaming with Exotel.
 *
 * Audio format: 16-bit linear PCM, mono, 8kHz (default).
 * Reference: https://docs.exotel.com/exotel-agentstream/voicebot-applet
 *
 * IMPORTANT: Exotel uses snake_case event fields:
 * - stream_sid (not streamSid)
 * - call_sid (not callSid)
 * - sequence_number
 * - The start event has a nested start object
 *
 * Audio is PCM16 (16-bit, 8kHz, mono, little-endian) encoded in base64.
 * NOT μ-law.
 */
export class ExotelTransport extends BaseTransport {
  readonly type = 'real_call' as const;

  private ws: AgentStreamWebSocket;
  private streamSid: string | null = null;
  private callSid: string | null = null;
  private sampleRate: number;
  private _supportsStreaming = true;

  // TTS output format (what we expect from Sarvam TTS — default 16kHz PCM16)
  private ttsOutputFormat: AudioFormat = { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 };

  // Playback queue for sequential audio output
  private playbackQueue: Buffer[] = [];
  private isPlaying = false;

  // Diagnostic mode: send test audio instead of going through STT→LLM→TTS
  private diagnosticMode: boolean;

  constructor(
    ws: AgentStreamWebSocket,
    session: VoiceSession,
    options: ExotelTransportOptions = {},
  ) {
    super('real_call', session);
    this.ws = ws;
    this.sampleRate = options.sampleRate ?? 8000;
    this.diagnosticMode = process.env.EXOTEL_DIAGNOSTIC === 'true';

    this.setupWebSocketHandlers();
  }

  getStreamSid(): string | null {
    return this.streamSid;
  }

  getCallSid(): string | null {
    return this.callSid;
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Set the TTS output format so we know what to convert from.
   */
  setTTSOutputFormat(format: AudioFormat): void {
    this.ttsOutputFormat = format;
  }

  /**
   * Send agent audio response to Exotel.
   * Converts audio to Exotel format (PCM16 8kHz) and sends via media event.
   */
  async sendAudioToExotel(pcmBuffer: Buffer): Promise<void> {
    if (this._closed) return;
    if (!this.streamSid) {
      logger.warn({ bufferSize: pcmBuffer.length }, 'Queuing audio — no streamSid yet');
      this.playbackQueue.push(pcmBuffer);
      return;
    }

    // Convert audio to Exotel format (PCM16 8kHz)
    const exotelAudio = this.convertToExotelFormat(pcmBuffer);

    logger.info({
      inputSize: pcmBuffer.length,
      inputRate: this.ttsOutputFormat.sampleRate,
      outputSize: exotelAudio.length,
      outputRate: 8000,
      codec: 'pcm_s16le',
      streamSid: this.streamSid,
    }, 'Sending audio to Exotel');

    // 80ms chunk size for 8kHz PCM16 (1280 bytes = 640 samples = 80ms)
    // Paced with a 25ms delay and 8-chunk pre-buffer so Exotel jitter buffer never starves
    const chunkSize = 1280; // 80ms chunk
    const frameDelayMs = 25;
    const PREBUFFER_CHUNKS = 8;

    this.isPlaying = true;
    let chunkIndex = 0;

    for (let offset = 0; offset < exotelAudio.length; offset += chunkSize) {
      if (this._closed || !this.isPlaying) break;

      const chunk = exotelAudio.subarray(offset, Math.min(offset + chunkSize, exotelAudio.length));
      const base64Payload = chunk.toString('base64');

      const event = {
        event: 'media',
        stream_sid: this.streamSid,
        media: {
          payload: base64Payload,
        },
      };

      this.sendJSON(event);
      chunkIndex++;

      // Pre-buffer initial chunks without delay to populate telephony jitter buffer, then pace smoothly
      if (chunkIndex > PREBUFFER_CHUNKS && offset + chunkSize < exotelAudio.length) {
        await new Promise((resolve) => setTimeout(resolve, frameDelayMs));
      }
    }

    this.isPlaying = false;
  }

  /**
   * Convert audio buffer to Exotel format (PCM16 8kHz).
   * Exotel expects: raw/slin (16-bit, 8kHz, mono PCM little-endian) encoded in base64.
   * NOT μ-law.
   */
  private convertToExotelFormat(buffer: Buffer): Buffer {
    const sourceRate = this.ttsOutputFormat?.sampleRate ?? 16000;

    // If Sarvam TTS 16kHz PCM16, downsample 2:1 to 8kHz PCM16 for Exotel
    if (sourceRate === 16000) {
      return this.downsample16kTo8k(buffer);
    }

    // If already 8kHz PCM16, return as-is
    if (sourceRate === 8000) {
      return buffer;
    }

    // General downsample for other rates (e.g. 24kHz)
    return this.downsample(buffer, sourceRate, 8000);
  }

  /**
   * Fast, exact 2:1 downsampler for 16kHz PCM16 mono -> 8kHz PCM16 mono.
   */
  private downsample16kTo8k(buffer: Buffer): Buffer {
    const inputSamples = Math.floor(buffer.length / 2);
    const outputSamples = Math.floor(inputSamples / 2);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      const byteOffset = i * 4;
      if (byteOffset + 1 < buffer.length) {
        output.writeInt16LE(buffer.readInt16LE(byteOffset), i * 2);
      }
    }

    return output;
  }

  /**
   * Simple linear interpolation downsampling for PCM16.
   */
  private downsample(buffer: Buffer, fromRate: number, toRate: number): Buffer {
    const ratio = fromRate / toRate;
    const samples = Math.floor(buffer.length / 2);
    const outputSamples = Math.floor(samples / ratio);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      const srcIndex = Math.floor(i * ratio) * 2;
      if (srcIndex + 1 < buffer.length) {
        output.writeInt16LE(buffer.readInt16LE(srcIndex), i * 2);
      }
    }

    return output;
  }

  /**
   * Send clear event to Exotel (for interruption/barge-in).
   */
  async sendClear(): Promise<void> {
    if (this._closed || !this.streamSid) return;

    const event = {
      event: 'clear',
      stream_sid: this.streamSid,
    };

    this.sendJSON(event);
  }

  /**
   * Send agent response to Exotel.
   * If audio is present, sends it. Otherwise logs transcript.
   */
  async send(message: VoiceAgentMessage): Promise<void> {
    if (this._closed) return;

    // If audio is present, send it to Exotel
    if (message.audio && message.audio.length > 0) {
      await this.sendAudioToExotel(message.audio);
    }

    logger.info({ transcript: message.transcript?.substring(0, 100) }, 'Agent response sent');
  }

  /**
   * Stop current playback (for interruption).
   */
  /**
   * Stop current playback (for interruption).
   */
  async stopPlayback(): Promise<void> {
    this.playbackQueue = [];
    this.isPlaying = false;
    await this.sendClear();
  }

  /**
   * Clear audio queue on Exotel stream (Barge-in / Interruption).
   */
  clearAudio(): void {
    this.playbackQueue = [];
    this.isPlaying = false;
    this.sendClear().catch(() => {});
  }

  supportsStreaming(): boolean {
    return this._supportsStreaming;
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;

    // Send clear before closing
    try {
      await this.sendClear();
    } catch {
      // Ignore errors during close
    }

    this.handleClose();
  }

  private setupWebSocketHandlers(): void {
    this.ws.on('message', (data) => {
      try {
        const raw = data.toString();
        const event = JSON.parse(raw);

        // Only log raw message for non-media events to avoid flooding stdout 50x per second
        if (event.event !== 'media') {
          logger.info({ eventType: event.event, rawMessage: raw.substring(0, 500) }, 'RAW EXOTEL EVENT');
        }
        this.handleExotelEvent(event);
      } catch (error) {
        logger.error({ error, rawData: data.toString().substring(0, 200) }, 'Failed to parse Exotel event');
      }
    });

    this.ws.on('close', (code, reason) => {
      // DIAGNOSTIC: Log close code and reason
      logger.warn({
        code,
        reason: reason?.toString() ?? 'unknown',
        streamSid: this.streamSid,
        callSid: this.callSid,
      }, 'EXOTEL WEBSOCKET CLOSED');
      this.handleClose();
    });

    this.ws.on('error', (error) => {
      // DIAGNOSTIC: Log error but DON'T close — provider errors shouldn't kill the connection
      logger.error({
        error: error.message ?? error,
        streamSid: this.streamSid,
        callSid: this.callSid,
      }, 'EXOTEL WEBSOCKET ERROR (not closing)');
      // DO NOT call handleClose() — only the close event should close the connection
    });
  }

  private handleExotelEvent(event: any): void {
    const eventType = event.event;

    if (!this.streamSid && event.stream_sid) {
      this.streamSid = event.stream_sid;
    }

    // Log non-media events at INFO level (media events stream 50x/sec)
    if (eventType !== 'media') {
      logger.info({
        eventType,
        streamSid: event.stream_sid ?? event.streamSid,
        callSid: event.call_sid ?? event.callSid,
        hasStart: !!event.start,
        hasStop: !!event.stop,
      }, 'EXOTEL EVENT PARSED');
    }

    switch (eventType) {
      case 'connected':
        logger.info('EXOTEL CONNECTED EVENT RECEIVED');
        break;

      case 'start':
        this.handleStart(event);
        break;

      case 'media':
        this.handleMedia(event);
        break;

      case 'stop':
        this.handleStop(event);
        break;

      case 'mark':
        logger.info({ mark: event.mark }, 'EXOTEL MARK EVENT');
        break;

      case 'dtmf':
        logger.info({ dtmf: event.dtmf }, 'EXOTEL DTMF EVENT');
        break;

      case 'clear':
        logger.info('EXOTEL CLEAR EVENT');
        break;

      default:
        logger.warn({ eventType, event }, 'UNKNOWN EXOTEL EVENT');
    }
  }

  /**
   * Handle Exotel start event.
   *
   * IMPORTANT: Exotel start event has a nested structure:
   * {
   *   "event": "start",
   *   "sequence_number": 1,
   *   "stream_sid": "...",
   *   "start": {
   *     "stream_sid": "...",
   *     "call_sid": "...",
   *     "account_sid": "...",
   *     "from": "...",
   *     "to": "...",
   *     "custom_parameters": {...},
   *     "media_format": {
   *       "encoding": "...",
   *       "sample_rate": "...",
   *       "bit_rate": "..."
   *     }
   *   }
   * }
   *
   * Fields use snake_case: stream_sid, call_sid (NOT camelCase).
   */
  private async handleStart(event: any): Promise<void> {
    // Support both snake_case (official) and camelCase (legacy)
    const startData = event.start ?? event;
    this.streamSid = event.stream_sid ?? event.streamSid ?? startData.stream_sid ?? startData.streamSid;
    this.callSid = startData.call_sid ?? startData.callSid ?? event.call_sid ?? event.callSid;

    // DIAGNOSTIC: Log all start event fields
    logger.info({
      streamSid: this.streamSid,
      callSid: this.callSid,
      from: startData.from,
      to: startData.to,
      accountSid: startData.account_sid ?? startData.accountSid,
      mediaFormat: startData.media_format ?? startData.mediaFormat,
      customParameters: startData.custom_parameters ?? startData.customParameters,
      sequenceNumber: event.sequence_number ?? event.sequenceNumber,
    }, 'EXOTEL START EVENT — Stream parameters');

    if (!this.streamSid) {
      logger.error({ event }, 'NO stream_sid found in start event!');
    }

    // Notify session that call has started
    this.session.setState('listening');

    // Flush any audio queued before start event
    while (this.playbackQueue.length > 0) {
      const queued = this.playbackQueue.shift()!;
      logger.info({ bufferSize: queued.length }, 'Flushing queued audio');
      await this.sendAudioToExotel(queued);
    }
  }

  /**
   * Handle Exotel media event.
   *
   * Exotel sends audio as PCM16 (16-bit, 8kHz, mono, little-endian) encoded in base64.
   * NOT μ-law.
   *
   * Event format:
   * {
   *   "event": "media",
   *   "sequence_number": 3,
   *   "stream_sid": "...",
   *   "media": {
   *     "chunk": 2,
   *     "timestamp": "10",
   *     "payload": "<base64 PCM16>"
   *   }
   * }
   */
  private handleMedia(event: any): void {
    const media = event.media;
    if (!media || !media.payload) {
      logger.warn({ event }, 'Media event missing payload');
      return;
    }

    const payloadBuffer = Buffer.from(media.payload, 'base64');

    // Decode base64 payload to PCM16 buffer
    const pcmBuffer = payloadBuffer;

    // Notify transport that we have user audio
    this.handleUserMessage({
      type: 'speech',
      audio: pcmBuffer,
      isFinal: true,
      timestamp: Date.now(),
    });

    // Set state to listening only if idle (do not overwrite processing or speaking)
    if (this.session.state === 'idle') {
      this.session.setState('listening');
    }
  }

  /**
   * Handle Exotel stop event.
   *
   * Event format:
   * {
   *   "event": "stop",
   *   "sequence_number": 10,
   *   "stream_sid": "...",
   *   "stop": {
   *     "call_sid": "...",
   *     "account_sid": "...",
   *     "reason": "stopped or callended"
   *   }
   * }
   */
  private handleStop(event: any): void {
    const stopData = event.stop ?? {};
    logger.info({
      streamSid: event.stream_sid ?? event.streamSid,
      callSid: stopData.call_sid ?? stopData.callSid ?? event.call_sid ?? event.callSid,
      accountSid: stopData.account_sid ?? stopData.accountSid,
      reason: stopData.reason,
      sequenceNumber: event.sequence_number ?? event.sequenceNumber,
    }, 'EXOTEL STOP EVENT');

    this.session.end('exotel_stream_stopped');
  }

  private sendJSON(data: unknown): void {
    if (this.ws.readyState === 1) { // WebSocket.OPEN
      this.ws.send(JSON.stringify(data));
    } else {
      logger.warn({ readyState: this.ws.readyState }, 'Cannot send — WebSocket not open');
    }
  }
}
