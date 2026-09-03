import { config } from '../config.js';

export interface SarvamSTTOptions {
  languageCode?: string;
  sampleRate?: number;
  onFinalTranscript?: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
}

export class SarvamSTTProvider {
  private apiKey: string;
  private languageCode: string;
  private sampleRate: number;
  private onFinal: ((text: string) => void) | null = null;

  private pcmBuffer: Buffer = Buffer.alloc(0);
  private silenceDurationMs = 0;
  private isProcessing = false;

  constructor(options: SarvamSTTOptions = {}) {
    this.apiKey = config.SARVAM_API_KEY;
    this.languageCode = options.languageCode || 'hi-IN';
    this.sampleRate = options.sampleRate || 16000;
    if (options.onFinalTranscript) this.onFinal = options.onFinalTranscript;
  }

  async connect(): Promise<void> {
    console.log('Sarvam STT pipeline initialized with VAD');
  }

  sendAudioChunk(chunk: Buffer): void {
    if (!chunk || chunk.length === 0 || this.isProcessing) return;

    let sumSquares = 0;
    const samples = Math.floor(chunk.length / 2);
    for (let i = 0; i < samples; i++) {
      const val = chunk.readInt16LE(i * 2);
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, samples));

    const SPEECH_RMS_THRESHOLD = 150;

    if (rms > SPEECH_RMS_THRESHOLD) {
      this.pcmBuffer = Buffer.concat([this.pcmBuffer, chunk]);
      this.silenceDurationMs = 0;
    } else if (this.pcmBuffer.length > 0) {
      this.pcmBuffer = Buffer.concat([this.pcmBuffer, chunk]);
      this.silenceDurationMs += 20;

      if (this.silenceDurationMs >= 450 && this.pcmBuffer.length >= 9600) {
        const speechAudio = this.pcmBuffer;
        this.pcmBuffer = Buffer.alloc(0);
        this.silenceDurationMs = 0;

        this.transcribeBuffer(speechAudio);
      }
    }
  }

  private async transcribeBuffer(pcmBuffer: Buffer): Promise<void> {
    if (!this.apiKey || pcmBuffer.length === 0) return;
    this.isProcessing = true;

    try {
      const header = Buffer.alloc(44);
      const dataSize = pcmBuffer.length;
      header.write('RIFF', 0);
      header.writeUInt32LE(dataSize + 36, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(this.sampleRate, 24);
      header.writeUInt32LE(this.sampleRate * 2, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36);
      header.writeUInt32LE(dataSize, 40);

      const wavBuffer = Buffer.concat([header, pcmBuffer]);

      const formData = new FormData();
      formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'speech.wav');
      formData.append('model', 'saaras:v3');
      formData.append('language_code', this.languageCode);

      const res = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
          'api-subscription-key': this.apiKey,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json() as { transcript?: string };
        const text = data.transcript?.trim() || '';
        if (text) {
          console.log('Caller speech transcribed by Sarvam STT:', text);
          this.onFinal?.(text);
        }
      }
    } catch (err: any) {
      console.error('Error during Sarvam STT transcription:', err?.message);
    } finally {
      this.isProcessing = false;
    }
  }

  close(): void {
    this.pcmBuffer = Buffer.alloc(0);
    this.silenceDurationMs = 0;
  }
}

export class SarvamTTSProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = config.SARVAM_API_KEY;
  }

  async synthesize(text: string, voiceId: string = 'shubh', speakingSpeed: number = 1.0): Promise<Buffer> {
    if (!this.apiKey) {
      return Buffer.alloc(16000 * 2);
    }

    const response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': this.apiKey,
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: 'hi-IN',
        speaker: voiceId || 'shubh',
        pace: speakingSpeed || 1.0,
        speech_sample_rate: 16000,
        enable_preprocessing: true,
        model: 'bulbul:v3',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Sarvam TTS synthesis failed (${response.status}): ${err}`);
    }

    const data = await response.json() as { audios?: string[] };
    if (data.audios && data.audios[0]) {
      const rawBuffer = Buffer.from(data.audios[0], 'base64');
      const silencePadding = Buffer.alloc(6400);
      return Buffer.concat([rawBuffer, silencePadding]);
    }

    throw new Error('Sarvam TTS returned empty audio list');
  }
}
