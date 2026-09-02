import { EventEmitter } from 'events';
import type { TTSAdapter, TTSConfig, AudioFormat } from '../../types.js';
import { createChildLogger } from '../../../lib/logger.js';

const logger = createChildLogger({ module: 'sarvam-tts' });

export interface WebSocketConstructor {
  new (url: string, protocols?: string | string[], options?: any): any;
}

export interface SarvamTTSConfig {
  apiKey: string;
  baseUrl?: string;
  wsConstructor?: WebSocketConstructor;
}

/**
 * Sarvam Bulbul v3 TTS Adapter.
 *
 * Supported speakers: neha, aditya, ritu, ashutosh, priya, etc.
 * Sample rate: 16kHz PCM linear16 output
 */
export class SarvamTTSAdapter extends EventEmitter implements TTSAdapter {
  readonly name = 'sarvam-bulbul-v3';

  private apiKey: string;
  private baseUrl: string;
  private wsConstructor?: WebSocketConstructor;
  private ws: any = null;
  private config: TTSConfig | null = null;
  private connected = false;

  private audioHandler: ((chunk: Buffer, metadata?: { sampleRate?: number; encoding?: string }) => void) | null = null;
  private speechMarkHandler: ((mark: { word: string; startTime: number; endTime: number }) => void) | null = null;
  private errorHandler: ((error: { code: string; message: string; isFatal: boolean }) => void) | null = null;
  private closeHandler: ((code: number, reason: string) => void) | null = null;

  constructor(sarvamConfig: SarvamTTSConfig) {
    super();
    this.apiKey = sarvamConfig.apiKey;
    this.baseUrl = sarvamConfig.baseUrl ?? 'https://api.sarvam.ai';
    this.wsConstructor = sarvamConfig.wsConstructor;
  }

  async connect(config?: TTSConfig): Promise<void> {
    if (this.connected) {
      throw new Error('TTS adapter already connected');
    }

    const validSpeakers = [
      'aditya', 'ritu', 'ashutosh', 'priya', 'neha', 'rahul', 'pooja', 'rohan',
      'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun',
      'manan', 'sumit', 'roopa', 'kabir', 'aayan', 'shubh', 'advait', 'anand',
      'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'shruti', 'suhani',
      'mohit', 'kavitha', 'rehan', 'soham', 'rupali', 'niharika'
    ];

    const voice = config?.voiceId && validSpeakers.includes(config.voiceId) ? config.voiceId : 'neha';

    this.config = {
      voiceId: voice,
      languageCode: config?.languageCode ?? 'hi-IN',
      sampleRate: config?.sampleRate ?? 16000,
      encoding: config?.encoding ?? 'linear16',
      pace: config?.pace ?? 1.0,
      temperature: config?.temperature ?? 0.7,
    };

    if (this.wsConstructor) {
      const url = `wss://api.sarvam.ai/text-to-speech/ws?model=bulbul%3Av3&send_completion_event=true`;
      return new Promise((resolve, reject) => {
        try {
          this.ws = new this.wsConstructor!(url, [], {
            headers: { 'api-subscription-key': this.apiKey },
          });

          this.ws.on('open', () => {
            this.connected = true;
            logger.info({ voice: this.config?.voiceId }, 'Sarvam TTS WebSocket connected');
            this.sendJSON({
              event: 'configure',
              data: {
                speaker: this.config?.voiceId,
                language_code: this.config?.languageCode,
                model: 'bulbul:v3',
              },
            });
            resolve();
          });

          this.ws.on('message', (data: any) => {
            this.handleMessage(data.toString());
          });

          this.ws.on('close', (code: number, reason: any) => {
            this.connected = false;
            this.emit('close');
            this.closeHandler?.(code, reason?.toString() ?? '');
          });

          this.ws.on('error', (error: any) => {
            this.connected = false;
            this.errorHandler?.({ code: 'WEBSOCKET_ERROR', message: error.message ?? 'Error', isFatal: true });
            reject(error);
          });
        } catch (err) {
          reject(err);
        }
      });
    }

    logger.info({ voice: this.config.voiceId, language: this.config.languageCode }, 'Sarvam TTS connected');
    this.connected = true;
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.connected) {
      throw new Error('TTS adapter not connected');
    }

    if (this.ws) {
      this.sendJSON({ event: 'text', text });
      return new Promise((resolve) => {
        const audioChunks: Buffer[] = [];
        const onChunk = (chunk: Buffer) => audioChunks.push(chunk);
        const onDone = () => {
          this.off('audio_chunk', onChunk);
          this.off('synthesize_done', onDone);
          resolve(Buffer.concat(audioChunks));
        };

        this.on('audio_chunk', onChunk);
        this.on('synthesize_done', onDone);

        // Fallback resolve tick in case completed isn't emitted
        setTimeout(() => {
          onDone();
        }, 100);
      });
    }

    const speaker = this.config?.voiceId ?? 'neha';
    const lang = this.config?.languageCode ?? 'hi-IN';
    const sampleRate = this.config?.sampleRate ?? 16000;

    try {
      const response = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.apiKey,
        },
        body: JSON.stringify({
          inputs: [text],
          target_language_code: lang,
          speaker: speaker,
          pace: this.config?.pace ?? 1.0,
          speech_sample_rate: sampleRate,
          enable_preprocessing: true,
          model: 'bulbul:v3',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error({ status: response.status, errText }, 'Sarvam TTS REST request failed');
        return Buffer.alloc(0);
      }

      const data = await response.json() as { audios?: string[] };
      if (data.audios && data.audios[0]) {
        const audioBuffer = Buffer.from(data.audios[0], 'base64');
        logger.info({ byteLength: audioBuffer.length }, 'Sarvam TTS synthesis succeeded');
        this.audioHandler?.(audioBuffer);
        return audioBuffer;
      }
      return Buffer.alloc(0);
    } catch (err: any) {
      logger.error({ error: err.message }, 'Sarvam TTS synthesis exception');
      return Buffer.alloc(0);
    }
  }

  async *synthesizeStream(text: string): AsyncIterable<Buffer> {
    if (this.ws) {
      const queue: Buffer[] = [];
      let isDone = false;
      const onChunk = (chunk: Buffer) => queue.push(chunk);
      const onDone = () => { isDone = true; };

      this.on('audio_chunk', onChunk);
      this.on('synthesize_done', onDone);
      this.on('close', onDone);

      this.sendJSON({ event: 'text', text });

      let attempts = 0;
      while ((!isDone || queue.length > 0) && attempts < 200) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise(r => setTimeout(r, 10));
          attempts++;
        }
      }

      this.off('audio_chunk', onChunk);
      this.off('synthesize_done', onDone);
      this.off('close', onDone);
      return;
    }

    const audio = await this.synthesize(text);
    if (audio.length > 0) {
      const chunkSize = 4096;
      for (let i = 0; i < audio.length; i += chunkSize) {
        yield audio.subarray(i, i + chunkSize);
      }
    }
  }

  async updateConfig(config: Partial<TTSConfig>): Promise<void> {
    if (this.config) {
      Object.assign(this.config, config);
    }
    if (this.ws) {
      this.sendJSON({
        event: 'config.update',
        speaker: config.voiceId,
        pace: config.pace,
      });
    }
  }

  onAudio(handler: (chunk: Buffer, metadata?: { sampleRate?: number; encoding?: string }) => void): void {
    this.audioHandler = handler;
  }

  onSpeechMark(handler: (mark: { word: string; startTime: number; endTime: number }) => void): void {
    this.speechMarkHandler = handler;
  }

  onError(handler: (error: { code: string; message: string; isFatal: boolean }) => void): void {
    this.errorHandler = handler;
  }

  onClose(handler: (code: number, reason: string) => void): void {
    this.closeHandler = handler;
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.sendJSON({ event: 'end' });
      try { this.ws.close(1000, 'Client closing'); } catch {}
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      if (message.event === 'audio') {
        const audioBuffer = Buffer.from(message.audio ?? message.data?.audio ?? '', 'base64');
        this.audioHandler?.(audioBuffer);
        this.emit('audio_chunk', audioBuffer);
      } else if (message.event === 'completed') {
        this.emit('synthesize_done');
      } else if (message.event === 'error') {
        this.errorHandler?.({ code: message.code ?? 'ERROR', message: message.message ?? 'Error', isFatal: false });
      }
    } catch {}
  }

  private sendJSON(data: any): void {
    if (this.ws) {
      this.ws.send(JSON.stringify(data));
    }
  }

  encode(buffer: Buffer, outputFormat: AudioFormat): Buffer {
    const sourceRate = this.config?.sampleRate ?? 16000;

    if (outputFormat.codec === 'mulaw' && outputFormat.sampleRate === 8000) {
      const downsampled = sourceRate === 8000 ? buffer : this.downsample(buffer, sourceRate, 8000);
      return this.pcm16ToMulaw(downsampled);
    }

    if (outputFormat.codec === 'pcm_s16le') {
      if (outputFormat.sampleRate === sourceRate) {
        return buffer;
      }
      return this.downsample(buffer, sourceRate, outputFormat.sampleRate);
    }

    return buffer;
  }

  decode(buffer: Buffer, inputFormat: AudioFormat): Buffer {
    const targetRate = this.config?.sampleRate ?? 16000;

    if (inputFormat.codec === 'mulaw' && inputFormat.sampleRate === 8000) {
      return this.upsample(this.mulawToPcm16(buffer), 8000, targetRate);
    }

    if (inputFormat.codec === 'pcm_s16le') {
      if (inputFormat.sampleRate === targetRate) {
        return buffer;
      }
      return this.upsample(buffer, inputFormat.sampleRate, targetRate);
    }

    return buffer;
  }

  private downsample(buffer: Buffer, fromRate: number, toRate: number): Buffer {
    const ratio = fromRate / toRate;
    const samples = Math.floor(buffer.length / 2);
    const outputSamples = Math.floor(samples / ratio);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      const srcIndex = Math.floor(i * ratio) * 2;
      output.writeInt16LE(buffer.readInt16LE(srcIndex), i * 2);
    }

    return output;
  }

  private upsample(buffer: Buffer, fromRate: number, toRate: number): Buffer {
    const ratio = toRate / fromRate;
    const samples = Math.floor(buffer.length / 2);
    const outputSamples = Math.floor(samples * ratio);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      const srcIndex = Math.floor(i / ratio) * 2;
      output.writeInt16LE(buffer.readInt16LE(srcIndex), i * 2);
    }

    return output;
  }

  private pcm16ToMulaw(buffer: Buffer): Buffer {
    const output = Buffer.alloc(Math.floor(buffer.length / 2));
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      output[Math.floor(i / 2)] = this.encodeMulaw(sample);
    }
    return output;
  }

  private mulawToPcm16(buffer: Buffer): Buffer {
    const output = Buffer.alloc(buffer.length * 2);
    for (let i = 0; i < buffer.length; i++) {
      const sample = this.decodeMulaw(buffer[i]);
      output.writeInt16LE(sample, i * 2);
    }
    return output;
  }

  private encodeMulaw(sample: number): number {
    const MULAW_MAX = 0x1FFF;
    const MULAW_BIAS = 33;
    const sign = sample < 0 ? 0x80 : 0;
    if (sign) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;
    sample += MULAW_BIAS;

    let exponent = 7;
    const expMask = 0x4000;
    for (; exponent > 0; exponent--) {
      if (sample & expMask) break;
      sample <<= 1;
    }
    const mantissa = (sample >> 10) & 0x0F;
    const byte = ~(sign | (exponent << 4) | mantissa);
    return byte;
  }

  private decodeMulaw(byte: number): number {
    const MULAW_BIAS = 33;
    byte = ~byte;
    const sign = byte & 0x80;
    const exponent = (byte >> 4) & 0x07;
    const mantissa = byte & 0x0F;
    let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
    sample -= MULAW_BIAS;
    return sign ? -sample : sample;
  }
}

export function createSarvamTTSAdapter(apiKey: string): SarvamTTSAdapter {
  return new SarvamTTSAdapter({ apiKey });
}
