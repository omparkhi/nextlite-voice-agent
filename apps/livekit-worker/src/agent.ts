import { RoomEvent, RemoteParticipant, RemoteTrack, Track } from 'livekit-client';
import { AudioSource, AudioFrame, LocalAudioTrack, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { runtimeClient } from './runtime-client.js';
import { SarvamSTTProvider, SarvamTTSProvider } from './providers/sarvam.js';
import { LiveKitLLMProvider, ChatMessage } from './providers/llm.js';
import { RuntimeAgentConfig } from '@nextlite/shared';

function extractPcmFromWav(audioBuffer: Buffer): Uint8Array {
  if (audioBuffer.length >= 12 && audioBuffer.subarray(0, 4).toString() === 'RIFF' && audioBuffer.subarray(8, 12).toString() === 'WAVE') {
    let offset = 12;
    while (offset < audioBuffer.length - 8) {
      const subchunkId = audioBuffer.subarray(offset, offset + 4).toString();
      const subchunkSize = audioBuffer.readUInt32LE(offset + 4);
      if (subchunkId === 'data') {
        const pcmStart = offset + 8;
        const pcmEnd = Math.min(pcmStart + subchunkSize, audioBuffer.length);
        const pcmBytes = audioBuffer.subarray(pcmStart, pcmEnd);
        const cleanPcm = new Uint8Array(pcmBytes.length);
        cleanPcm.set(pcmBytes);
        return cleanPcm;
      }
      offset += 8 + subchunkSize;
    }
  }
  const cleanPcm = new Uint8Array(audioBuffer.length);
  cleanPcm.set(audioBuffer);
  return cleanPcm;
}

export class LiveKitAgentSession {
  private room: any;
  private sessionId: string;
  private agentId: string = '';
  private tenantId?: string;
  private runtimeConfig: RuntimeAgentConfig | null = null;
  private stt: SarvamSTTProvider | null = null;
  private tts: SarvamTTSProvider;
  private llm: LiveKitLLMProvider;
  private history: ChatMessage[] = [];
  private activeTurnAbort: AbortController | null = null;
  private isProcessing = false;
  private startTime: number = Date.now();
  private audioSource: AudioSource | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;

  constructor(room: any, sessionId: string, agentId: string = '', tenantId: string | undefined = undefined) {
    this.room = room;
    this.sessionId = sessionId;
    this.agentId = agentId;
    this.tenantId = tenantId;
    this.tts = new SarvamTTSProvider();
    this.llm = new LiveKitLLMProvider();
  }

  async start(): Promise<void> {
    // Extract metadata from room if available
    if (this.room && this.room.metadata) {
      try {
        const meta = JSON.parse(this.room.metadata);
        if (meta.agentId) this.agentId = meta.agentId;
        if (meta.tenantId) this.tenantId = meta.tenantId;
        if (meta.sessionId) this.sessionId = meta.sessionId;
      } catch {
        // Ignore JSON parse errors
      }
    }

    console.log(`[VOICE_DEBUG] Starting LiveKit AgentSession for session ${this.sessionId}, agent ${this.agentId}`);
    this.startTime = Date.now();

    // 1. Fetch compiled dynamic RuntimeAgentConfig from NextLite API
    try {
      this.runtimeConfig = await runtimeClient.getRuntimeConfig(this.agentId || '', this.sessionId, this.tenantId);
      console.log(`[VOICE_DEBUG] Loaded RuntimeAgentConfig for version ${this.runtimeConfig.agentVersionId}`);
    } catch (err: any) {
      console.error(`❌ Failed to load RuntimeAgentConfig: ${err.message}`);
      return;
    }

    // 2. Initialize conversation history with compiled dynamic system prompt
    this.history = [{ role: 'system', content: this.runtimeConfig.compiledSystemPrompt }];

    // 3. Connect Sarvam Realtime STT
    this.stt = new SarvamSTTProvider({
      languageCode: this.runtimeConfig.language.primary || 'hi-IN',
      onFinalTranscript: (text) => this.handleUserTranscript(text),
    });
    await this.stt.connect();
    console.log('[VOICE_DEBUG] Sarvam connected');

    // 4. Initialize AudioSource & LocalAudioTrack for agent playback
    this.audioSource = new AudioSource(16000, 1);
    this.localAudioTrack = LocalAudioTrack.createAudioTrack('agent-mic', this.audioSource);
    console.log('[VOICE_DEBUG] AudioSource created');
    console.log('[VOICE_DEBUG] LocalAudioTrack created');

    if (this.room.localParticipant) {
      const publishOptions = new TrackPublishOptions({
        source: TrackSource.SOURCE_MICROPHONE,
      });
      await this.room.localParticipant.publishTrack(this.localAudioTrack, publishOptions);
      console.log('[VOICE_DEBUG] Audio track published');
      console.log('[VOICE_DEBUG] browser/phone output track active');
    }

    // 5. Attach room audio track listeners for incoming user speech
    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: any, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        console.log(`[VOICE_DEBUG] SIP participant connected: ${participant.identity}`);
        console.log(`[VOICE_DEBUG] SIP participant subscribed/receiving audio: ${participant.identity}`);
        console.log(`[VOICE_DEBUG] remote audio track subscribed from participant ${participant.identity}`);

        // Forward raw incoming audio frames to Sarvam STT
        (track as any).on('frame', (pcmFrame: any) => {
          if (pcmFrame && pcmFrame.data) {
            const buffer = Buffer.from(pcmFrame.data);
            console.log(`[VOICE_DEBUG] audio frame received (${buffer.length} bytes)`);
            if (this.stt) {
              console.log('[VOICE_DEBUG] audio frame forwarded to Sarvam');
              this.stt.sendAudioChunk(buffer);
            }
          }
        });
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      this.handleDisconnect();
    });

    // 6. Speak dynamic greeting configured on Dashboard
    const greetingText = this.runtimeConfig.voice?.voiceId
      ? (this.runtimeConfig as any).identity?.greeting || 'Hello, thank you for calling. How can I help you today?'
      : 'Hello, thank you for calling. How can I help you today?';

    await this.speakText(greetingText);
  }

  /**
   * Handle user transcript arrival (Turn Taking & Barge-in Abort Control)
   */
  private async handleUserTranscript(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    console.log(`[VOICE_DEBUG] Sarvam final transcript: "${trimmed}"`);
    console.log(`[VOICE_DEBUG] user turn completed`);

    // BARGE-IN RESET: Abort in-flight LLM/TTS turn generation if user interrupts
    if (this.activeTurnAbort) {
      console.log('⚡ BARGE-IN DETECTED: Aborting active agent response generation');
      this.activeTurnAbort.abort();
      if (this.audioSource) {
        this.audioSource.clearQueue();
      }
      this.activeTurnAbort = null;
    }

    this.isProcessing = true;
    this.activeTurnAbort = new AbortController();
    const signal = this.activeTurnAbort.signal;

    try {
      this.history.push({ role: 'user', content: trimmed });

      // Generate LLM response dynamically
      console.log(`[VOICE_DEBUG] LLM request for prompt length ${this.runtimeConfig?.compiledSystemPrompt.length}`);
      const responseText = await this.llm.chat(this.history, this.runtimeConfig?.runtimeSettings.modelTemperature || 0.7, signal);
      if (signal.aborted) return;

      console.log(`[VOICE_DEBUG] LLM response: "${responseText}"`);
      this.history.push({ role: 'assistant', content: responseText });

      // Synthesize and publish response audio
      await this.speakText(responseText, signal);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Turn generation canceled cleanly by barge-in abort');
      } else {
        console.error('Turn generation error:', err.message);
      }
    } finally {
      this.isProcessing = false;
      this.activeTurnAbort = null;
    }
  }

  /**
   * Synthesize and publish audio output track to LiveKit Room
   */
  private async speakText(text: string, signal?: AbortSignal): Promise<void> {
    try {
      console.log(`[VOICE_DEBUG] TTS request for: "${text}"`);
      const voiceId = this.runtimeConfig?.voice.voiceId || 'shubh';
      const speed = this.runtimeConfig?.voice.speakingSpeed || 1.0;
      const audioBuffer = await this.tts.synthesize(text, voiceId, speed);

      if (signal?.aborted) return;

      if (!this.audioSource) {
        console.warn('AudioSource not initialized');
        return;
      }

      const cleanPcm = extractPcmFromWav(audioBuffer);
      const int16Data = new Int16Array(cleanPcm.buffer);
      const samplesPerFrame = 320; // 20ms frame at 16kHz
      const durationSeconds = (int16Data.length / 16000).toFixed(2);

      console.log(`[VOICE_DEBUG] TTS bytes: ${audioBuffer.length}`);
      console.log(`[VOICE_DEBUG] WAV audioFormat: 1 (PCM)`);
      console.log(`[VOICE_DEBUG] WAV sampleRate: 16000`);
      console.log(`[VOICE_DEBUG] WAV channels: 1`);
      console.log(`[VOICE_DEBUG] WAV bitsPerSample: 16`);
      console.log(`[VOICE_DEBUG] WAV byteRate: 32000`);
      console.log(`[VOICE_DEBUG] WAV dataBytes: ${cleanPcm.length}`);
      console.log(`[VOICE_DEBUG] PCM samples: ${int16Data.length}`);
      console.log(`[VOICE_DEBUG] PCM bytes: ${cleanPcm.length}`);
      console.log(`[VOICE_DEBUG] PCM duration seconds: ${durationSeconds}`);

      let framesSubmitted = 0;
      for (let i = 0; i < int16Data.length; i += samplesPerFrame) {
        if (signal?.aborted) {
          this.audioSource.clearQueue();
          console.log('[VOICE_DEBUG] Playback aborted by barge-in');
          break;
        }
        let chunk = int16Data.subarray(i, Math.min(i + samplesPerFrame, int16Data.length));
        if (chunk.length < samplesPerFrame) {
          const padded = new Int16Array(samplesPerFrame);
          padded.set(chunk);
          chunk = padded;
        }
        console.log(`[VOICE_DEBUG] frame samples: ${chunk.length}`);
        console.log(`[VOICE_DEBUG] frame sampleRate: 16000`);
        console.log(`[VOICE_DEBUG] frame channels: 1`);
        const frame = new AudioFrame(chunk, 16000, 1, chunk.length);
        await this.audioSource.captureFrame(frame);
        framesSubmitted++;
      }

      console.log(`[VOICE_DEBUG] Audio frames submitted (${framesSubmitted} frames)`);
      await this.audioSource.waitForPlayout();
      console.log('[VOICE_DEBUG] Audio playback completed');
    } catch (err: any) {
      console.error('Speech synthesis error:', err.message);
    }
  }

  private async handleDisconnect(): Promise<void> {
    console.log(`🔌 LiveKit Session ${this.sessionId} disconnected`);
    if (this.stt) {
      this.stt.close();
    }
    if (this.audioSource) {
      this.audioSource.close();
      this.audioSource = null;
    }
    if (this.localAudioTrack) {
      this.localAudioTrack = null;
    }

    const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);

    // Notify NextLite Control Plane of session completion
    if (this.runtimeConfig) {
      await runtimeClient.endSession({
        sessionId: this.sessionId,
        tenantId: this.runtimeConfig.tenantId,
        agentId: this.runtimeConfig.agentId,
        agentVersionId: this.runtimeConfig.agentVersionId,
        transport: 'web_voice',
        status: 'completed',
        durationSeconds,
        livekitRoomSid: this.room.name,
      });
    }
  }
}
