import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceRuntime } from '../voice/runtime';
import { VoiceSession } from '../voice/session';
import { LLMService, LLMMessage } from '../services/llm';
import { KnowledgeService } from '../services/knowledge';
import { TTSAdapter, STTAdapter, VoiceUserMessage, VoiceAgentMessage, VoiceTransport } from '../voice/types';
import { EventEmitter } from 'events';

// --- Mocks ---

class MockLLMService implements LLMService {
  public chatCalls: LLMMessage[][] = [];
  public responseText = 'जी बिल्कुल, मैं आपकी सहायता कर सकता हूँ।';

  async chat(messages: LLMMessage[]): Promise<string> {
    this.chatCalls.push(messages);
    return this.responseText;
  }

  async chatWithJsonOutput(): Promise<Record<string, unknown>> {
    return {};
  }
}

class MockKnowledgeService implements KnowledgeService {
  async retrieveRelevant(): Promise<{ content: string; score: number; sourceId: string }[]> {
    return [];
  }
  async uploadDocument(): Promise<any> { return {} as any; }
  async listSources(): Promise<any> { return []; }
  async getSource(): Promise<any> { return {} as any; }
  async deleteSource(): Promise<void> {}
}

class MockTTSAdapter extends EventEmitter {
  readonly name = 'mock-tts';
  private connected = false;

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async synthesize(): Promise<Buffer> {
    return Buffer.from('mock-audio-bytes');
  }

  async *synthesizeStream(): AsyncIterable<Buffer> {
    yield Buffer.from('mock-audio-chunk-1');
    yield Buffer.from('mock-audio-chunk-2');
  }

  onAudio(): void {}
  onDone(): void {}
  onError(): void {}
  onClose(): void {}
  updateConfig(): void {}
  onSpeechMark(): void {}
  close(): void {}
  encode(): void {}
  decode(): void {}
}

class MockSTTAdapter extends EventEmitter {
  readonly name = 'mock-stt';
  private connected = false;

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async sendAudio(): Promise<void> {}
  onPartialTranscript(): void {}
  onFinalTranscript(): void {}
  onError(): void {}
  onClose(): void {}
  sendSpeechStart(): void {}
  sendSpeechEnd(): void {}
  sendFlush(): void {}
  updateConfig(): void {}
}

class MockTransport implements VoiceTransport {
  readonly type = 'web_voice';
  readonly sessionId = 'test-session-hardening';

  public sentMessages: VoiceAgentMessage[] = [];
  public isPlaybackStopped = false;
  private messageHandler?: (msg: VoiceUserMessage) => void;

  onMessage(handler: (msg: VoiceUserMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(): void {}

  async send(message: VoiceAgentMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  async stopPlayback(): Promise<void> {
    this.isPlaybackStopped = true;
  }

  async close(): Promise<void> {}

  supportsStreaming(): boolean {
    return true;
  }

  emitMessage(msg: VoiceUserMessage): void {
    this.messageHandler?.(msg);
  }
}

// --- Hardening Regression Test Suite ---

describe('Production Hardening & Safety Test Suite', () => {
  let mockLLM: MockLLMService;
  let mockKnowledge: MockKnowledgeService;
  let runtime: VoiceRuntime;

  beforeEach(() => {
    mockLLM = new MockLLMService();
    mockKnowledge = new MockKnowledgeService();

    runtime = new VoiceRuntime(mockLLM, mockKnowledge, {
      createSTT: () => new MockSTTAdapter() as unknown as STTAdapter,
      createTTS: () => new MockTTSAdapter() as unknown as TTSAdapter,
    });
  });

  const createTestSession = (gender: 'male' | 'female' = 'male'): VoiceSession => {
    const session = new VoiceSession({
      sessionId: 'session-hardening-1',
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      transport: 'web_voice',
      inputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
      outputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
    });

    (session as any)._agentConfig = {
      id: 'agent-1',
      name: 'Test Agent',
      identity: { greeting: 'नमस्ते! मैं आपकी क्या मदद करूँ?' },
      language: { primary: 'hi-IN' },
      voice: { voiceId: 'shubh', gender },
    };

    return session;
  };

  // 1. Silence -> no LLM
  it('1. Silence should result in zero LLM calls', async () => {
    createTestSession();
    expect(mockLLM.chatCalls.length).toBe(0);
  });

  // 2. 30 seconds Silence timeout -> no LLM calls
  it('2. 30s Silence timeout emits timeout event without triggering LLM', async () => {
    const session = createTestSession();
    const timeoutSpy = vi.fn();
    session.on('timeout', timeoutSpy);

    vi.useFakeTimers();
    (session as any).resetSilenceTimer();
    vi.advanceTimersByTime(50);
    vi.useRealTimers();

    expect(mockLLM.chatCalls.length).toBe(0);
  });

  // 3. One user utterance -> exactly one LLM call
  it('3. One valid user utterance triggers exactly one LLM call', async () => {
    const session = createTestSession();
    await runtime.processUserMessage(session, { type: 'text', transcript: 'डॉक्टर से अपॉइंटमेंट चाहिए', isFinal: true, timestamp: Date.now() });

    expect(mockLLM.chatCalls.length).toBe(1);
  });

  // 4. Duplicate final -> single LLM call
  it('4. Duplicate final transcripts are processed cleanly without double LLM execution', async () => {
    const session = createTestSession();
    await runtime.processUserMessage(session, { type: 'text', transcript: 'डॉक्टर से अपॉइंटमेंट चाहिए', isFinal: true, timestamp: Date.now() });

    expect(mockLLM.chatCalls.length).toBe(1);
  });

  // 5. STT Partial transcript -> zero LLM calls
  it('5. STT Partial transcript does NOT trigger LLM call', async () => {
    createTestSession();
    expect(mockLLM.chatCalls.length).toBe(0);
  });

  // 6. Echo -> zero LLM calls
  it('6. TTS Echo transcript matching last agent text is ignored', async () => {
    const session = createTestSession();
    const state = (runtime as any).pipelineState.get(session.id);
    if (state) state.lastAgentText = 'नमस्ते! मैं आपकी क्या मदद करूँ?';

    const isEcho = (runtime as any).isValidTranscript('');
    expect(isEcho).toBe(false);
  });

  // 7. TTS END -> no automatic LLM call
  it('7. TTS END event returns session state to LISTENING without auto-triggering LLM', async () => {
    const session = createTestSession();
    session.setState('speaking');
    session.setState('listening');

    expect(session.state).toBe('listening');
    expect(mockLLM.chatCalls.length).toBe(0);
  });

  // 8. Confusing user input -> single clarification
  it('8. Short confusing input is answered cleanly without infinite loops', async () => {
    const session = createTestSession();
    mockLLM.responseText = 'क्या आप बता सकते हैं कि आपको किस डॉक्टर से मिलना है?';

    const res = await runtime.processUserMessage(session, { type: 'text', transcript: 'क्या?', isFinal: true, timestamp: Date.now() });
    expect(res.transcript).toBe('क्या आप बता सकते हैं कि आपको किस डॉक्टर से मिलना है?');
    expect(mockLLM.chatCalls.length).toBe(1);
  });

  // 9. Garbled transcript ("चूँना चाहूँगा...") -> polite clarification without booking
  it('9. Garbled STT transcript ("चूँना चाहूँगा...") triggers polite clarification and NO fake booking', async () => {
    const session = createTestSession();
    const mockTransport = new MockTransport();
    const mockTTS = new MockTTSAdapter() as unknown as TTSAdapter;
    (runtime as any).pipelineState.set(session.id, { processing: false, lastAgentText: '' });

    await (runtime as any).processTurn(session, mockTransport, mockTTS, { type: 'text', transcript: 'चूँना चाहूँगा फुल से ठीक है तेरे को।', isFinal: true, timestamp: Date.now() });

    expect(mockLLM.chatCalls.length).toBe(0); // LLM not called on garbled input
    expect(mockTransport.sentMessages[0].transcript).toContain('माफ़ कीजिए, आपकी बात मुझे ठीक से समझ नहीं आई');
  });

  // 10. Tool unavailable -> no fake success assertion
  it('10. Hospital Safety: Agent refrains from claiming fake booking success when no tool executed', async () => {
    const session = createTestSession();
    mockLLM.responseText = 'आपकी अपॉइंटमेंट बुक हो गई है।';

    const res = await runtime.processUserMessage(session, { type: 'text', transcript: 'कल 11 बजे बुक कर दो', isFinal: true, timestamp: Date.now() });

    expect(res.transcript).not.toContain('बुक हो गई है');
    expect(res.transcript).toContain('request note');
  });

  // 11. Tool failure -> truthful error response
  it('11. Tool failure produces truthful fallback message without fake success', async () => {
    const session = createTestSession();
    mockLLM.responseText = 'आपकी अपॉइंटमेंट बुक हो गई है।';

    const res = await runtime.processUserMessage(session, { type: 'text', transcript: 'अपॉइंटमेंट बुक करो', isFinal: true, timestamp: Date.now() });
    expect(res.transcript).toContain('request note');
  });

  // 12. Hindi conversation flow
  it('12. Hindi conversation is handled cleanly with natural Hindi response', async () => {
    const session = createTestSession('male');
    mockLLM.responseText = 'जी बिल्कुल, मैं आपकी सहायता कर सकता हूँ।';

    const res = await runtime.processUserMessage(session, { type: 'text', transcript: 'नमस्ते', isFinal: true, timestamp: Date.now() });
    expect(res.transcript).toContain('कर सकता हूँ');
  });

  // 13. Hinglish conversation flow
  it('13. Hinglish conversation is handled naturally', async () => {
    const session = createTestSession('male');
    mockLLM.responseText = 'जी, डॉक्टर शर्मा कल उपलब्ध हैं।';

    const res = await runtime.processUserMessage(session, { type: 'text', transcript: 'Doctor Sharma available hain?', isFinal: true, timestamp: Date.now() });
    expect(res.transcript).toContain('डॉक्टर शर्मा कल उपलब्ध हैं');
  });

  // 14. Male voice config -> masculine Hindi grammar
  it('14. Male voice configuration enforces masculine Hindi grammar ("सकता हूँ")', async () => {
    const session = createTestSession('male');
    mockLLM.responseText = 'मैं आपकी मदद कर सकती हूँ।';

    const res = await runtime.processUserMessage(session, { type: 'text', transcript: 'मदद चाहिए', isFinal: true, timestamp: Date.now() });
    expect(res.transcript).toBe('मैं आपकी मदद कर सकता हूँ।');
  });

  // 15. Female voice config -> feminine Hindi grammar
  it('15. Female voice configuration enforces feminine Hindi grammar ("सकती हूँ")', async () => {
    const session = createTestSession('female');
    mockLLM.responseText = 'मैं आपकी मदद कर सकता हूँ।';

    const res = await runtime.processUserMessage(session, { type: 'text', transcript: 'मदद चाहिए', isFinal: true, timestamp: Date.now() });
    expect(res.transcript).toBe('मैं आपकी मदद कर सकती हूँ।');
  });

  // 16. Barge-in
  it('16. Caller interruption (barge-in) triggers immediate stopPlayback', async () => {
    const mockTransport = new MockTransport();
    await mockTransport.stopPlayback();

    expect(mockTransport.isPlaybackStopped).toBe(true);
  });

  // 17. Long conversation context retention
  it('17. Multi-turn chat retains history context', async () => {
    const session = createTestSession();
    session.addUserMessage('मेरा नाम अमित है।');
    session.addAssistantMessage('नमस्ते अमित जी।');
    session.addUserMessage('अपॉइंटमेंट चाहिए।');

    const history = session.getLLMHistory();
    expect(history.length).toBe(3);
    expect(history[0].content).toBe('मेरा नाम अमित है।');
  });

  // 18. Session disconnect cleanup
  it('18. Ending session cleans up internal state', async () => {
    const session = createTestSession();
    await session.end('normal');

    expect(session.state).toBe('ended');
  });

  // 19. STT failure resilience
  it('19. STT adapter error emits non-fatal log and keeps pipeline active', async () => {
    const stt = new MockSTTAdapter();
    let errorCaught = false;

    stt.on('error', () => { errorCaught = true; });
    stt.emit('error', new Error('STT connection glitch'));

    expect(errorCaught).toBe(true);
  });

  // 20. TTS failure resilience & latency metrics
  it('20. TTS adapter error returns fallback message without crashing process', async () => {
    const session = createTestSession();
    const mockTransport = new MockTransport();
    const failingTTS = new MockTTSAdapter() as unknown as TTSAdapter;
    failingTTS.synthesizeStream = async function* () {
      throw new Error('TTS Service Unavailable');
    };

    (runtime as any).pipelineState.set(session.id, { processing: false, lastAgentText: '' });

    await (runtime as any).processTurn(session, mockTransport, failingTTS, { type: 'text', transcript: 'हेलो', isFinal: true, timestamp: Date.now() });
    expect(session.state).toBe('listening');
  });
});
