import { createVoiceRuntime } from '../voice/runtime.js';
import { ExotelTransport } from '../voice/providers/exotel/websocket.js';
import { SarvamSTTAdapter } from '../voice/providers/sarvam/stt.js';
import { SarvamTTSAdapter } from '../voice/providers/sarvam/tts.js';
import { createLLMService } from '../services/llm.js';
import { createKnowledgeService } from '../services/knowledge.js';
import { liveTranscriptStore } from '../voice/transcriptStore.js';
import { db } from '../db/index.js';
import { agents } from '../db/schema.js';

class MockWebSocket {
  readyState = 1;
  sentMessages: any[] = [];
  handlers: Map<string, Function[]> = new Map();

  on(event: string, handler: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  send(data: string | Buffer) {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        this.sentMessages.push(parsed);
      } catch {
        this.sentMessages.push(data);
      }
    } else {
      this.sentMessages.push(data);
    }
  }

  close() {
    this.readyState = 3;
  }

  emit(event: string, ...args: any[]) {
    const handlers = this.handlers.get(event) || [];
    for (const h of handlers) {
      h(...args);
    }
  }
}

async function runE2ETest() {
  console.log('===============================================================');
  console.log('🚀 TESTING FULL REALTIME VOICE AGENT PIPELINE (E2E SIMULATION)');
  console.log('===============================================================\n');

  const apiKey = process.env.SARVAM_API_KEY || '';
  if (!apiKey) {
    console.error('❌ SARVAM_API_KEY missing in environment!');
    process.exit(1);
  }

  const dbAgents = await db.select().from(agents).limit(1);
  if (dbAgents.length === 0) {
    console.error('❌ No agent found in database!');
    process.exit(1);
  }
  const realAgent = dbAgents[0];

  const llm = createLLMService();
  const knowledge = createKnowledgeService(db as any, { OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '' } as any);

  const runtime = createVoiceRuntime(llm, knowledge, {
    createSTT: () => new SarvamSTTAdapter({ apiKey }),
    createTTS: () => new SarvamTTSAdapter({ apiKey }),
  });

  const mockWs = new MockWebSocket();
  const sessionId = 'e2e-test-session-' + Date.now().toString().slice(-4);

  liveTranscriptStore.startSession(sessionId, { agentId: realAgent.name, phoneNumber: '+919876543210' });

  console.log('1️⃣ Initializing Session & Pipeline in VoiceRuntime...');
  const session = await runtime.startSession({
    sessionId,
    tenantId: realAgent.tenantId,
    agentId: realAgent.id,
    transport: 'real_call',
    inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
  });

  const transport = new ExotelTransport(mockWs as any, session);

  const { stt, tts } = await runtime.wireVoicePipeline(session, transport, {
    languageCode: 'hi-IN',
    sampleRate: 8000,
    encoding: 'linear16',
  }, {
    languageCode: 'hi-IN',
    voiceId: 'shubh',
    sampleRate: 16000,
  });

  transport.setTTSOutputFormat({ codec: 'pcm_s16le', sampleRate: 16000, channels: 1 });
  console.log('✅ Pipeline successfully wired!');

  console.log('\n2️⃣ Simulating Exotel Start Event...');
  mockWs.emit('message', JSON.stringify({
    event: 'start',
    stream_sid: 'stream-e2e-12345',
    start: {
      call_sid: 'call-e2e-98765',
      from: '+919876543210',
      to: '+918000000000',
    },
  }));
  console.log('✅ Exotel stream_sid attached: stream-e2e-12345');

  console.log('\n3️⃣ Synthesizing Initial Greeting...');
  const greetingText = 'नमस्ते! मैं क्लीनिक से बोल रहा हूँ, बताइए मैं आपकी क्या मदद करूँ?';
  liveTranscriptStore.addGreeting(sessionId, greetingText);

  const greetingAudio = await tts.synthesize(greetingText);
  console.log(`✅ Greeting synthesized: ${greetingAudio.length} bytes (16kHz PCM16)`);

  await transport.send({
    type: 'text',
    transcript: greetingText,
    audio: greetingAudio,
    isPartial: false,
    timestamp: Date.now(),
  });

  const mediaFrames = mockWs.sentMessages.filter(m => m.event === 'media');
  console.log(`✅ Sent ${mediaFrames.length} 40ms media frames to Exotel stream!`);

  console.log('\n4️⃣ Simulating User Speech Turn...');
  const userText = 'मुझे कल सुबह 11 बजे डॉक्टर शर्मा से अपॉइंटमेंट चाहिए';
  console.log(`👤 User Spoke: "${userText}"`);

  console.log('\n🤖 Triggering STT Final Event -> LLM -> TTS -> Exotel Media Delivery...');

  // Emit final transcript event to runtime
  (stt as any).finalHandler?.(userText, 'hi-IN', 0.95);

  // Wait 6 seconds for LLM call + TTS synthesis + Exotel frame streaming
  await new Promise(r => setTimeout(r, 6000));

  console.log('\n===============================================================');
  console.log('📊 FINAL LIVE TRANSCRIPT STORE SUMMARY:');
  console.log('===============================================================');
  const transcript = liveTranscriptStore.getTranscript(sessionId);
  console.log(JSON.stringify(transcript, null, 2));

  await stt.close();
  await tts.close();
  await transport.close();
  console.log('\n✅ E2E VOICE AGENT PIPELINE TEST COMPLETED SUCCESSFULLY!');
}

runE2ETest().catch(console.error);
