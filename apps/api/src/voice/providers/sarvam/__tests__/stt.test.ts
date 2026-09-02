import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { STTConfig } from '../../../types.js';
import { SarvamSTTAdapter, createSarvamSTTAdapter } from '../stt.js';
import type { WebSocketConstructor } from '../stt.js';

// Mock WebSocket instance
const mockWsInstance = {
  readyState: 1,
  send: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
};

// Mock WebSocket constructor
const MockWebSocketConstructor = vi.fn(() => mockWsInstance) as unknown as WebSocketConstructor & { mockClear: () => void; mock: { calls: any[][] } };

function resetMockWs() {
  mockWsInstance.send.mockClear();
  mockWsInstance.close.mockClear();
  mockWsInstance.on.mockClear();
  mockWsInstance.readyState = 1;
  (MockWebSocketConstructor as any).mockClear();
}

function simulateOpen() {
  const openHandler = mockWsInstance.on.mock.calls.find((c: any[]) => c[0] === 'open')?.[1];
  openHandler?.();
}

function simulateMessage(data: string) {
  const messageHandler = mockWsInstance.on.mock.calls.find((c: any[]) => c[0] === 'message')?.[1];
  messageHandler?.(Buffer.from(data));
}

function simulateClose(code: number = 1000, reason: string = 'Normal') {
  const closeHandler = mockWsInstance.on.mock.calls.find((c: any[]) => c[0] === 'close')?.[1];
  closeHandler?.(code, Buffer.from(reason));
}

function simulateError(error: Error) {
  const errorHandler = mockWsInstance.on.mock.calls.find((c: any[]) => c[0] === 'error')?.[1];
  errorHandler?.(error);
}

describe('SarvamSTTAdapter', () => {
  let adapter: SarvamSTTAdapter;

  beforeEach(() => {
    resetMockWs();
    adapter = new SarvamSTTAdapter({
      apiKey: 'test-api-key',
      wsConstructor: MockWebSocketConstructor,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create adapter with correct name', () => {
    expect(adapter.name).toBe('sarvam-saaras-v3');
  });

  it('should not be connected initially', () => {
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect to Sarvam STT', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    expect(adapter.isConnected()).toBe(true);
    expect(MockWebSocketConstructor).toHaveBeenCalledOnce();
  });

  it('should send audio chunks', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    const audioBuffer = Buffer.from([0x10, 0x20, 0x30]);
    await adapter.sendAudio(audioBuffer);

    expect(mockWsInstance.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.event).toBe('audio_input');
    expect(sentData.audio).toBe(audioBuffer.toString('base64'));
  });

  it('should send speech start in manual mode', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
      endpointing: 'manual',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    await adapter.sendSpeechStart();

    expect(mockWsInstance.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.event).toBe('speech_start');
  });

  it('should send speech end in manual mode', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
      endpointing: 'manual',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    await adapter.sendSpeechEnd();

    expect(mockWsInstance.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.event).toBe('speech_end');
  });

  it('should send flush', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    await adapter.sendFlush();

    expect(mockWsInstance.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.event).toBe('flush');
  });

  it('should handle partial transcript', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    const partialHandler = vi.fn();
    adapter.onPartialTranscript(partialHandler);

    const event = {
      event: 'transcript.partial',
      text: 'नमस्ते',
      language: 'hi-IN',
    };
    simulateMessage(JSON.stringify(event));

    expect(partialHandler).toHaveBeenCalledWith('नमस्ते', 'hi-IN');
  });

  it('should handle final transcript', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    const finalHandler = vi.fn();
    adapter.onFinalTranscript(finalHandler);

    const event = {
      event: 'transcript.final',
      text: 'नमस्ते, आप कैसे हैं?',
      language: 'hi-IN',
      language_confidence: 0.95,
    };
    simulateMessage(JSON.stringify(event));

    expect(finalHandler).toHaveBeenCalledWith('नमस्ते, आप कैसे हैं?', 'hi-IN', 0.95);
  });

  it('should handle speech start event', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    const speechStartHandler = vi.fn();
    adapter.onSpeechStart(speechStartHandler);

    const event = { event: 'vad.speech_start' };
    simulateMessage(JSON.stringify(event));

    expect(speechStartHandler).toHaveBeenCalledOnce();
  });

  it('should handle speech end event', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    const speechEndHandler = vi.fn();
    adapter.onSpeechEnd(speechEndHandler);

    const event = { event: 'vad.speech_end' };
    simulateMessage(JSON.stringify(event));

    expect(speechEndHandler).toHaveBeenCalledOnce();
  });

  it('should handle error event', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    const errorHandler = vi.fn();
    adapter.onError(errorHandler);

    const event = {
      event: 'error',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      is_fatal: false,
    };
    simulateMessage(JSON.stringify(event));

    expect(errorHandler).toHaveBeenCalledWith({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      isFatal: false,
    });
  });

  it('should handle close event', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    const closeHandler = vi.fn();
    adapter.onClose(closeHandler);

    simulateClose(1000, 'Normal');

    expect(closeHandler).toHaveBeenCalledWith(1000, 'Normal');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should update config mid-stream', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    await adapter.updateConfig({ languageCode: 'en-IN' });

    expect(mockWsInstance.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.event).toBe('config.update');
    expect(sentData.language_code).toBe('en-IN');
  });

  it('should close connection gracefully', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    await adapter.close();

    expect(mockWsInstance.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.event).toBe('end');
    expect(mockWsInstance.close).toHaveBeenCalledWith(1000, 'Client closing');
  });

  it('should throw when sending audio while not connected', async () => {
    const audioBuffer = Buffer.from([0x10]);
    await expect(adapter.sendAudio(audioBuffer)).rejects.toThrow('STT adapter not connected');
  });

  it('should throw when connecting while already connected', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    await expect(adapter.connect(config)).rejects.toThrow('STT adapter already connected');
  });

  it('should build correct URL with VAD parameters', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
      streamType: 'fast',
      endpointing: 'vad',
      threshold: 0.5,
      silenceDurationMs: 300,
      minSpeechDurationMs: 200,
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    // Check that WebSocket was constructed with correct URL
    const wsCall = (MockWebSocketConstructor as any).mock.calls[0];
    const url = wsCall[0];

    expect(url).toContain('language_code=hi-IN');
    expect(url).toContain('model=saaras%3Av3-realtime');
    expect(url).toContain('stream_type=fast');
    expect(url).toContain('encoding=linear16');
    expect(url).toContain('sample_rate=8000');
    expect(url).toContain('threshold=0.5');
    expect(url).toContain('silence_duration_ms=300');
    expect(url).toContain('min_speech_duration_ms=200');
  });

  it('should handle session end event', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    const event = {
      event: 'session.end',
      audio_duration_s: 10.5,
    };
    simulateMessage(JSON.stringify(event));

    expect(adapter.isConnected()).toBe(false);
  });

  it('should handle WebSocket error during connect', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateError(new Error('Connection failed'));

    await expect(connectPromise).rejects.toThrow('Connection failed');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should handle malformed message gracefully', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    // Send malformed JSON - should not throw
    simulateMessage('not valid json');

    // Adapter should still be connected
    expect(adapter.isConnected()).toBe(true);
  });

  it('should handle session.begin event', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    // session.begin should not throw
    simulateMessage(JSON.stringify({ event: 'session.begin' }));

    expect(adapter.isConnected()).toBe(true);
  });

  it('should handle pong event', async () => {
    const config: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: 8000,
      encoding: 'linear16',
    };

    const connectPromise = adapter.connect(config);
    simulateOpen();
    await connectPromise;

    // pong should not throw
    simulateMessage(JSON.stringify({ event: 'pong' }));

    expect(adapter.isConnected()).toBe(true);
  });
});

describe('createSarvamSTTAdapter', () => {
  it('should create adapter with API key', () => {
    const adapter = createSarvamSTTAdapter('test-key');
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('sarvam-saaras-v3');
  });
});
