import WebSocket from 'ws';
import { BaseTransport } from '../../transports.js';
import { VoiceAgentMessage, VoiceUserMessage } from '../../types.js';
import { createChildLogger } from '../../../lib/logger.js';
import { mulawToPcm16, pcm16ToMulaw, pcm16ToPcm8, pcm8ToPcm16 } from '../../audio.js';
import { PlivoIncomingWebSocketEvent, PlivoPlayAudioOutbound, PlivoClearAudioOutbound, PlivoCheckpointOutbound } from './types.js';

const logger = createChildLogger({ module: 'plivo-transport' });

export class PlivoTransport extends BaseTransport {
  readonly type = 'real_call' as const;

  private ws: WebSocket;
  private streamId: string | null = null;
  private callId: string | null = null;
  private contentType: string = 'audio/x-l16';
  private sampleRate: number = 8000;
  private isPlaying = false;

  constructor(ws: WebSocket, session?: any) {
    super('real_call', session);
    this.ws = ws;
    this.setupWebSocket();
  }

  supportsStreaming(): boolean {
    return true;
  }

  async stopPlayback(): Promise<void> {
    this.clearAudio();
  }

  override async close(): Promise<void> {
    this.handleClose();
  }

  protected override handleClose(): void {
    if (this._closed) return;
    this._closed = true;
    try {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Transport closed');
      }
    } catch {
      // Ignore close errors
    }
    this.emit('close');
  }

  private setupWebSocket(): void {
    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const message = JSON.parse(data.toString()) as PlivoIncomingWebSocketEvent;
        this.handlePlivoEvent(message);
      } catch (error) {
        logger.error({ error, rawData: data.toString().substring(0, 200) }, 'Failed to parse Plivo WebSocket message');
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      logger.info({ code, reason: reason.toString(), streamId: this.streamId, callId: this.callId }, 'Plivo WebSocket stream closed');
      this.session?.end('plivo_websocket_closed');
      this.handleClose();
    });

    this.ws.on('error', (error: Error) => {
      logger.error({ error: error.message || error, streamId: this.streamId, callId: this.callId }, 'Plivo WebSocket stream error');
      this.emit('error', error);
    });
  }

  private handlePlivoEvent(event: PlivoIncomingWebSocketEvent): void {
    if (this._closed) return;

    switch (event.event) {
      case 'start': {
        const startObj = (event.start || event) as any;
        this.streamId = startObj?.streamId || startObj?.stream_id || (event as any).streamId || '';
        this.callId = startObj?.callId || startObj?.call_id || (event as any).callId || (event as any).call_id || null;

        const mediaFormat = startObj?.mediaFormat || startObj?.media_format;
        const encoding = mediaFormat?.encoding?.toLowerCase();
        const rate = mediaFormat?.sampleRate || mediaFormat?.sample_rate;

        if (encoding) {
          this.contentType = encoding.includes('mulaw') ? 'audio/x-mulaw' : 'audio/x-l16';
        }
        if (rate) {
          this.sampleRate = rate;
        }

        logger.info({
          streamId: this.streamId,
          callId: this.callId,
          contentType: this.contentType,
          sampleRate: this.sampleRate,
        }, 'Plivo Stream STARTED');

        this.emit('start', { streamId: this.streamId, callId: this.callId });
        break;
      }

      case 'media': {
        const payload = event.media?.payload || (event as any).payload;
        if (!payload) return;

        const rawAudio = Buffer.from(payload, 'base64');
        let pcm16Buffer: Buffer;

        if (this.contentType.includes('mulaw')) {
          pcm16Buffer = mulawToPcm16(rawAudio);
        } else if (this.sampleRate === 8000) {
          // audio/x-l16;rate=8000 -> upsample to 16kHz PCM16 for Sarvam STT
          pcm16Buffer = pcm8ToPcm16(rawAudio);
        } else {
          pcm16Buffer = rawAudio;
        }

        // Forward PCM16 audio to pipeline & Sarvam STT
        this.emit('audio', pcm16Buffer);

        this.handleUserMessage({
          type: 'speech',
          audio: pcm16Buffer,
          isFinal: true,
          timestamp: Date.now(),
        });

        if (this.session && this.session.state === 'idle') {
          this.session.setState('listening');
        }
        break;
      }

      case 'dtmf': {
        logger.info({ streamId: this.streamId, digit: event.dtmf?.digit }, 'Plivo DTMF event received');
        break;
      }

      case 'playedStream': {
        logger.debug({ streamId: this.streamId, name: event.name }, 'Plivo playedStream event');
        break;
      }

      case 'clearedAudio': {
        logger.info({ streamId: this.streamId }, 'Plivo clearedAudio confirmed by server');
        break;
      }

      case 'stop': {
        logger.info({ streamId: this.streamId }, 'Plivo Stream STOPPED');
        this.session?.end('plivo_stream_stopped');
        this.handleClose();
        break;
      }

      default:
        logger.debug({ event }, 'Unhandled Plivo event');
        break;
    }
  }

  /**
   * Outbound audio delivery to Plivo caller via paced 40ms playAudio chunks.
   * Matches real-time PSTN telephony streaming for crystal clear, smooth voice delivery.
   */
  async send(message: VoiceAgentMessage): Promise<void> {
    if (!message.audio || message.audio.length === 0) return;

    if (this._closed || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ streamId: this.streamId }, 'Cannot send audio — Plivo WebSocket is not OPEN or transport closed');
      return;
    }

    let audioBuffer: Buffer;
    let contentType = this.contentType;
    let sampleRate = this.sampleRate;

    if (this.contentType.includes('mulaw')) {
      audioBuffer = pcm16ToMulaw(message.audio);
    } else if (this.sampleRate === 8000) {
      // Linear PCM 16kHz from Sarvam TTS -> downsample 2:1 to 8kHz Linear PCM16 for Plivo L16 8k
      audioBuffer = pcm16ToPcm8(message.audio);
    } else {
      audioBuffer = message.audio;
    }

    // 80ms chunk size for audio/x-l16;rate=8000 (8kHz Linear PCM 16-bit mono = 1280 bytes per 80ms frame)
    // For mu-law 8kHz, 80ms = 640 bytes
    const isMulaw = contentType.includes('mulaw');
    const chunkSize = isMulaw ? 640 : 1280;
    const frameDelayMs = 25; // 25ms delay for 80ms audio ensures stream buffer is never starved
    const PREBUFFER_CHUNKS = 8; // Prime Plivo stream buffer with 640ms of initial audio

    this.isPlaying = true;
    let chunkIndex = 0;

    for (let offset = 0; offset < audioBuffer.length; offset += chunkSize) {
      if (this._closed || !this.isPlaying || this.ws.readyState !== WebSocket.OPEN) break;

      const chunk = audioBuffer.subarray(offset, Math.min(offset + chunkSize, audioBuffer.length));
      const outboundPayload = chunk.toString('base64');

      const playAudioMsg: PlivoPlayAudioOutbound = {
        event: 'playAudio',
        media: {
          contentType,
          sampleRate,
          payload: outboundPayload,
        },
      };

      this.ws.send(JSON.stringify(playAudioMsg));
      chunkIndex++;

      // Pre-buffer initial chunks without delay to populate telephony jitter buffer, then pace smoothly
      if (chunkIndex > PREBUFFER_CHUNKS && offset + chunkSize < audioBuffer.length) {
        await new Promise((resolve) => setTimeout(resolve, frameDelayMs));
      }
    }

    this.isPlaying = false;

    logger.debug({
      streamId: this.streamId,
      audioBytes: message.audio.length,
      contentType,
      sampleRate,
    }, 'Paced playAudio stream delivered to Plivo');
  }

  /**
   * Send checkpoint event to Plivo.
   */
  sendCheckpoint(name: string): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      const msg: PlivoCheckpointOutbound = {
        event: 'checkpoint',
        name,
      };
      this.ws.send(JSON.stringify(msg));
    }
  }


  /**
   * Clear audio queue on Plivo stream (Barge-in / Interruption).
   */
  clearAudio(): void {
    this.isPlaying = false;
    if (this.ws.readyState === WebSocket.OPEN) {
      const msg: PlivoClearAudioOutbound = {
        event: 'clearAudio',
      };
      this.ws.send(JSON.stringify(msg));
      logger.info({ streamId: this.streamId }, 'Sent clearAudio event to Plivo stream');
    }
  }
}
