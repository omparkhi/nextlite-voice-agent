import { describe, it, expect, beforeEach, vi } from 'vitest';

// Set required env vars BEFORE any imports that trigger env validation
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_SECRET = 'test-secret-key-that-is-long-enough-for-validation';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-that-is-long';
  process.env.RESEND_API_KEY = 'test-resend-key';
});

import { VoiceSession } from '../voice/session.js';
import { mulawToPcm16, pcm16ToMulaw, pcm16ToBase64, base64ToPcm16 } from '../voice/audio.js';
import type { VoiceSessionConfig, TransportType, AudioFormat } from '../voice/types.js';

// Mock LLM and Knowledge services
const mockLLM = {
  chat: async () => 'Hello, how can I help you?',
  chatWithJsonOutput: async () => ({}),
};

const mockKnowledge = {
  uploadDocument: async () => 'source-id',
  listSources: async () => [],
  getSource: async () => null,
  deleteSource: async () => {},
  retrieveRelevant: async () => [],
};

function createTestSession(overrides?: Partial<VoiceSessionConfig>): VoiceSession {
  const config: VoiceSessionConfig = {
    sessionId: 'test-session-1',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    transport: 'chat_test',
    inputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
    outputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
    ...overrides,
  };
  return new VoiceSession(config);
}

describe('VoiceSession', () => {
  let session: VoiceSession;

  beforeEach(() => {
    session = createTestSession();
  });

  it('should create with correct initial state', () => {
    expect(session.id).toBe('test-session-1');
    expect(session.tenantId).toBe('tenant-1');
    expect(session.agentId).toBe('agent-1');
    expect(session.state).toBe('idle');
    expect(session.history).toHaveLength(0);
  });

  it('should track conversation history', () => {
    session.addUserMessage('Hello');
    session.addAssistantMessage('Hi there!');
    session.addUserMessage('How are you?');

    expect(session.history).toHaveLength(3);
    expect(session.history[0].role).toBe('user');
    expect(session.history[0].content).toBe('Hello');
    expect(session.history[1].role).toBe('assistant');
    expect(session.history[1].content).toBe('Hi there!');
    expect(session.history[2].role).toBe('user');
    expect(session.history[2].content).toBe('How are you?');
  });

  it('should transition states correctly', () => {
    expect(session.state).toBe('idle');

    session.setState('listening');
    expect(session.state).toBe('listening');

    session.setState('processing');
    expect(session.state).toBe('processing');

    session.setState('speaking');
    expect(session.state).toBe('speaking');

    session.setState('listening');
    expect(session.state).toBe('listening');
  });

  it('should not allow state change after end', () => {
    session.setState('listening');
    session.setState('ended');

    expect(() => session.setState('idle')).toThrow();
  });

  it('should calculate duration', () => {
    const start = session.createdAt;
    expect(session.durationMs).toBeGreaterThanOrEqual(0);
    expect(session.durationMs).toBeLessThan(1000); // Should be very quick
  });

  it('should return LLM history format', () => {
    session.addUserMessage('Hello');
    session.addAssistantMessage('Hi!');

    const llmHistory = session.getLLMHistory();
    expect(llmHistory).toHaveLength(2);
    expect(llmHistory[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(llmHistory[1]).toEqual({ role: 'assistant', content: 'Hi!' });
  });

  it('should emit events', () => {
    const events: string[] = [];
    session.on('user_message', (msg: string) => events.push(`user:${msg}`));
    session.on('assistant_message', (msg: string) => events.push(`assistant:${msg}`));
    session.on('state_change', (newState: string) => events.push(`state:${newState}`));

    session.addUserMessage('Hello');
    session.setState('listening');
    session.addAssistantMessage('Hi!');

    expect(events).toContain('user:Hello');
    expect(events).toContain('state:listening');
    expect(events).toContain('assistant:Hi!');
  });

  it('should end session and cleanup', async () => {
    session.setState('listening');
    await session.end('test');

    expect(session.state).toBe('ended');
    expect(session.endedAt).toBeGreaterThan(0);
  });
});

describe('Audio Conversion', () => {
  it('should convert PCM to base64 and back', () => {
    const original = Buffer.from([0x10, 0x20, 0x30, 0x40, 0x50]);
    const base64 = pcm16ToBase64(original);
    const decoded = base64ToPcm16(base64);

    expect(decoded).toEqual(original);
  });

  it('should convert μ-law to PCM 16kHz', () => {
    // Create a simple μ-law buffer (10 bytes)
    const mulaw = Buffer.from([0x80, 0x7F, 0x80, 0x7F, 0x80, 0x7F, 0x80, 0x7F, 0x80, 0x7F]);
    const pcm = mulawToPcm16(mulaw);

    // Should be upsampled to 2x: 10 samples → 20 samples → 40 bytes
    expect(pcm.length).toBe(40);
    expect(pcm).toBeInstanceOf(Buffer);
  });

  it('should convert PCM 16kHz to μ-law', () => {
    // Create a simple PCM buffer (10 samples = 20 bytes)
    const pcm = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) {
      pcm.writeInt16LE(i * 100, i * 2);
    }
    const mulaw = pcm16ToMulaw(pcm);

    // Should be downsampled by 2x: 10 samples → 5 μ-law bytes
    expect(mulaw.length).toBe(5);
    expect(mulaw).toBeInstanceOf(Buffer);
  });

  it('should roundtrip μ-law → PCM → μ-law', () => {
    const original = Buffer.from([0x80, 0x7F, 0x80, 0x7F, 0x80]);
    const pcm = mulawToPcm16(original);
    const roundtrip = pcm16ToMulaw(pcm);

    // Should be approximately the same length (5 bytes)
    expect(roundtrip.length).toBe(original.length);
  });
});

describe('Voice Runtime Types', () => {
  it('should export TELEPHONY_FORMAT', async () => {
    const { TELEPHONY_FORMAT } = await import('../voice/types.js');
    expect(TELEPHONY_FORMAT).toEqual({ codec: 'mulaw', sampleRate: 8000, channels: 1 });
  });

  it('should export WEB_FORMAT', async () => {
    const { WEB_FORMAT } = await import('../voice/types.js');
    expect(WEB_FORMAT).toEqual({ codec: 'pcm_s16le', sampleRate: 16000, channels: 1 });
  });
});

describe('VoiceRuntime — Turn-Taking Rules', () => {
  // Shared mock adapter that captures handlers — used by both factory and tests
  function createSharedMockAdapter() {
    let finalHandler: ((text: string) => void) | null = null;
    let partialHandler: ((text: string) => void) | null = null;
    return {
      name: 'mock',
      connect: async () => {},
      sendAudio: async () => {},
      onFinalTranscript: (handler: (text: string) => void) => { finalHandler = handler; },
      onPartialTranscript: (handler: (text: string) => void) => { partialHandler = handler; },
      onSpeechStart: () => {},
      onSpeechEnd: () => {},
      onError: () => {},
      onClose: () => {},
      close: async () => {},
      isConnected: () => true,
      updateConfig: () => {},
      synthesize: async () => Buffer.from('audio'),
      synthesizeStream: async function* () { yield Buffer.from('audio'); },
      onAudio: () => {},
      onSpeechMark: () => {},
      triggerFinal: (text: string) => { finalHandler?.(text); },
    };
  }

  // Helper: create a mock VoiceRuntime with controlled LLM and captured adapters
  async function createMockRuntime(llmResponse: string) {
    let llmCallCount = 0;
    const llmCalls: string[] = [];

    const mockLLM = {
      chat: async (messages: any[]) => {
        llmCallCount++;
        llmCalls.push(messages[messages.length - 1]?.content ?? '');
        return llmResponse;
      },
      chatWithJsonOutput: async () => ({}),
    };

    const mockKnowledge = {
      uploadDocument: async () => 'source-id',
      listSources: async () => [],
      getSource: async () => null,
      deleteSource: async () => {},
      retrieveRelevant: async () => [],
    };

    const sttAdapter = createSharedMockAdapter();
    const ttsAdapter = createSharedMockAdapter();

    const { createVoiceRuntime } = await import('../voice/runtime.js');
    const runtime = createVoiceRuntime(mockLLM as any, mockKnowledge as any, {
      createSTT: () => sttAdapter as any,
      createTTS: () => ttsAdapter as any,
    });

    return {
      runtime,
      stt: sttAdapter,
      tts: ttsAdapter,
      getLlmCallCount: () => llmCallCount,
      getLlmCalls: () => [...llmCalls],
    };
  }

  // Helper: create mock transport
  function createMockTransport() {
    const sentMessages: any[] = [];
    let messageHandler: ((msg: any) => void) | null = null;
    let closeHandler: (() => void) | null = null;
    return {
      type: 'chat_test' as const,
      sessionId: 'test',
      send: async (msg: any) => { sentMessages.push(msg); },
      stopPlayback: async () => {},
      supportsStreaming: () => false,
      onMessage: (handler: (msg: any) => void) => { messageHandler = handler; },
      onClose: (handler: () => void) => { closeHandler = handler; },
      close: async () => { closeHandler?.(); },
      getSentMessages: () => [...sentMessages],
      simulateUserMessage: (msg: any) => { messageHandler?.(msg); },
    };
  }

  it('should process one user turn = one LLM call', async () => {
    const { runtime, stt, tts } = await createMockRuntime('नमस्ते! मैं आपकी मदद कर सकती हूँ।');
    const transport = createMockTransport();

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test Agent', greeting: 'Hello' },
      role: { description: 'Receptionist' },
      goal: { primaryObjective: 'Help patients' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN', 'en-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'Clinic', businessType: 'Healthcare', hours: '9-5', location: 'Delhi', description: 'Clinic' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-turn-taking',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.wireVoicePipeline(session, transport);

    // Simulate user speaking — using the factory-created STT adapter
    stt.triggerFinal('नमस्ते, मुझे appointment चाहिए');
    await new Promise(r => setTimeout(r, 200));

    // Response should have been sent
    const sent = transport.getSentMessages();
    expect(sent.length).toBe(1);
  });

  it('should reject empty transcripts without calling LLM', async () => {
    const { runtime, stt, tts, getLlmCallCount } = await createMockRuntime('Response');
    const transport = createMockTransport();

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-empty-reject',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.wireVoicePipeline(session, transport);

    // Send empty/noise transcripts
    stt.triggerFinal('');
    stt.triggerFinal('   ');
    stt.triggerFinal('...');
    stt.triggerFinal('.');

    await new Promise(r => setTimeout(r, 100));

    // LLM should NOT have been called for any of these
    expect(getLlmCallCount()).toBe(0);
  });

  it('should reject punctuation-only transcripts', async () => {
    const { runtime, stt, tts, getLlmCallCount } = await createMockRuntime('Response');
    const transport = createMockTransport();

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-punct-reject',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.wireVoicePipeline(session, transport);

    stt.triggerFinal('!!!');
    stt.triggerFinal('???');
    stt.triggerFinal(',,,');
    stt.triggerFinal(';;;');

    await new Promise(r => setTimeout(r, 100));

    expect(getLlmCallCount()).toBe(0);
  });

  it('should reject duplicate final transcripts within 2s', async () => {
    const { runtime, stt, tts, getLlmCallCount } = await createMockRuntime('Response');
    const transport = createMockTransport();

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-dup-reject',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.wireVoicePipeline(session, transport);

    // First should go through
    stt.triggerFinal('मुझे appointment चाहिए');
    await new Promise(r => setTimeout(r, 50));

    // Duplicate within 2s should be rejected
    stt.triggerFinal('मुझे appointment चाहिए');
    await new Promise(r => setTimeout(r, 100));

    // Only 1 LLM call should have happened
    expect(getLlmCallCount()).toBe(1);
  });

  it('should accept same transcript after 2s window', async () => {
    const { runtime, stt, tts, getLlmCallCount } = await createMockRuntime('Response');
    const transport = createMockTransport();

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-dup-after-window',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.wireVoicePipeline(session, transport);

    stt.triggerFinal('मुझे appointment चाहिए');
    await new Promise(r => setTimeout(r, 50));

    // Wait for duplicate window to pass
    await new Promise(r => setTimeout(r, 2100));

    // Same transcript after window should be accepted
    stt.triggerFinal('मुझे appointment चाहिए');
    await new Promise(r => setTimeout(r, 100));

    expect(getLlmCallCount()).toBe(2);
  });

  it('should drop unprompted messages when agent is busy', async () => {
    let resolveLLM: (v: string) => void;
    const llmPromise = new Promise<string>(r => { resolveLLM = r!; });

    const mockLLM = {
      chat: async () => { await llmPromise; return 'Response after delay'; },
      chatWithJsonOutput: async () => ({}),
    };

    const sttAdapter = createSharedMockAdapter();
    const ttsAdapter = createSharedMockAdapter();

    const { createVoiceRuntime } = await import('../voice/runtime.js');
    const runtime = createVoiceRuntime(mockLLM as any, {
      uploadDocument: async () => 'source-id',
      listSources: async () => [],
      getSource: async () => null,
      deleteSource: async () => {},
      retrieveRelevant: async () => [],
    } as any, {
      createSTT: () => sttAdapter as any,
      createTTS: () => ttsAdapter as any,
    });

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const transport = createMockTransport();
    const session = await runtime.startSession({
      sessionId: 'test-queue',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.wireVoicePipeline(session, transport);

    // Send first message — will block on LLM
    sttAdapter.triggerFinal('पहला संदेश');

    // Immediately send second message while busy — should be dropped (not queued)
    await new Promise(r => setTimeout(r, 10));
    sttAdapter.triggerFinal('दूसरा संदेश');

    // Now resolve the first LLM call
    resolveLLM!('पहला जवाब');
    await new Promise(r => setTimeout(r, 200));

    const sent = transport.getSentMessages();
    expect(sent.length).toBe(1);
  });

  it('should enforce response length for voice', async () => {
    const longResponse = 'यह एक बहुत लंबा जवाब है जो कई वाक्यों में है। यह दूसरा वाक्य है। यह तीसरा वाक्य है। यह चौथा वाक्य है जो बहुत लंबा है और इसमें कई शब्द हैं।';
    const { runtime, stt, tts } = await createMockRuntime(longResponse);
    const transport = createMockTransport();

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-length',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.wireVoicePipeline(session, transport);

    stt.triggerFinal('कुछ बताइए');
    await new Promise(r => setTimeout(r, 100));

    const sent = transport.getSentMessages();
    expect(sent.length).toBe(1);
    // Response should be truncated (max 150 chars + possible ellipsis)
    expect(sent[0].transcript.length).toBeLessThanOrEqual(155);
  });

  it('should accept valid Hindi transcript', async () => {
    const { runtime, stt, tts, getLlmCallCount } = await createMockRuntime('जी बिल्कुल!');
    const transport = createMockTransport();

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-valid-hindi',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.wireVoicePipeline(session, transport);

    stt.triggerFinal('जी हाँ, मुझे कल सुबह 10 बजे appointment चाहिए');
    await new Promise(r => setTimeout(r, 100));

    expect(getLlmCallCount()).toBe(1);
  });

  it('should include hard turn-taking rules in system prompt', async () => {
    const capturedPrompts: string[] = [];
    const mockLLM = {
      chat: async (messages: any[]) => {
        capturedPrompts.push(messages[0]?.content ?? '');
        return 'OK';
      },
      chatWithJsonOutput: async () => ({}),
    };

    const { createVoiceRuntime } = await import('../voice/runtime.js');
    const runtime = createVoiceRuntime(mockLLM as any, {
      uploadDocument: async () => 'source-id',
      listSources: async () => [],
      getSource: async () => null,
      deleteSource: async () => {},
      retrieveRelevant: async () => [],
    } as any);

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Medicare Receptionist', greeting: 'Hello' },
      role: { description: 'Receptionist' },
      goal: { primaryObjective: 'Help patients' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'Medicare Clinic', businessType: 'Healthcare', hours: '9-5', location: 'Delhi', description: 'Clinic' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-prompt',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.processUserMessage(session, {
      type: 'speech',
      transcript: 'Hello',
      isFinal: true,
      timestamp: Date.now(),
    });

    expect(capturedPrompts.length).toBe(1);
    const prompt = capturedPrompts[0];

    // Must contain critical turn-taking rules
    expect(prompt).toContain('NEVER generate what the user might say');
    expect(prompt).toContain('NEVER answer your own questions');
    expect(prompt).toContain('NEVER continue the conversation by inventing a user response');
    expect(prompt).toContain('ONE short sentence');
    expect(prompt).toContain('Ask AT MOST ONE question');
    expect(prompt).toContain('After speaking, STOP');
    expect(prompt).toContain('Maximum 2 sentences per response');
    expect(prompt).toContain('Maximum 1 question per response');
  });

  it('should derive voice gender from voiceId', async () => {
    const capturedPrompts: string[] = [];
    const mockLLM = {
      chat: async (messages: any[]) => {
        capturedPrompts.push(messages[0]?.content ?? '');
        return 'OK';
      },
      chatWithJsonOutput: async () => ({}),
    };

    const { createVoiceRuntime } = await import('../voice/runtime.js');

    // Test with male voice
    const runtimeMale = createVoiceRuntime(mockLLM as any, {
      uploadDocument: async () => 'source-id',
      listSources: async () => [],
      getSource: async () => null,
      deleteSource: async () => {},
      retrieveRelevant: async () => [],
    } as any);

    (runtimeMale as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'aditya', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const sessionMale = await runtimeMale.startSession({
      sessionId: 'test-male-voice',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtimeMale.processUserMessage(sessionMale, {
      type: 'speech',
      transcript: 'Hello',
      isFinal: true,
      timestamp: Date.now(),
    });

    const malePrompt = capturedPrompts[capturedPrompts.length - 1];
    expect(malePrompt).toContain('MALE voice');
    expect(malePrompt).toContain('कर सकता हूँ');
  });

  it('should include female grammar for female voiceId', async () => {
    const capturedPrompts: string[] = [];
    const mockLLM = {
      chat: async (messages: any[]) => {
        capturedPrompts.push(messages[0]?.content ?? '');
        return 'OK';
      },
      chatWithJsonOutput: async () => ({}),
    };

    const { createVoiceRuntime } = await import('../voice/runtime.js');
    const runtime = createVoiceRuntime(mockLLM as any, {
      uploadDocument: async () => 'source-id',
      listSources: async () => [],
      getSource: async () => null,
      deleteSource: async () => {},
      retrieveRelevant: async () => [],
    } as any);

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-female-voice',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.processUserMessage(session, {
      type: 'speech',
      transcript: 'Hello',
      isFinal: true,
      timestamp: Date.now(),
    });

    const prompt = capturedPrompts[capturedPrompts.length - 1];
    expect(prompt).toContain('FEMALE voice');
    expect(prompt).toContain('कर सकती हूँ');
  });

  it('should clean up pipeline state on session end', async () => {
    const { runtime, stt, tts } = await createMockRuntime('OK');
    const transport = createMockTransport();

    (runtime as any).loadAgentConfig = async () => ({
      identity: { name: 'Test', greeting: 'Hello' },
      role: { description: 'Test' },
      goal: { primaryObjective: 'Test' },
      voice: { voiceId: 'neha', provider: 'sarvam' },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'warm', style: 'professional', formality: 'formal' },
      businessInformation: { businessName: 'C', businessType: 'C', hours: '9-5', location: 'D', description: 'D' },
      conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'escalate' },
      appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'Confirm' },
      leadRules: { requiredFields: [], qualificationCriteria: '' },
      escalationRules: { triggerConditions: [], transferNumber: '', timeout: 30 },
      systemInstructions: '',
    });

    const session = await runtime.startSession({
      sessionId: 'test-cleanup',
      tenantId: 't1',
      agentId: 'a1',
      transport: 'chat_test',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 8000, channels: 1 },
    });

    await runtime.wireVoicePipeline(session, transport);

    // Pipeline state should exist
    expect((runtime as any).pipelineState.has('test-cleanup')).toBe(true);

    // End session
    await session.end('test');

    // Pipeline state should be cleaned up
    expect((runtime as any).pipelineState.has('test-cleanup')).toBe(false);
  });
});
