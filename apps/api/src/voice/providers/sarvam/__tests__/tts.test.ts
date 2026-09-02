import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SarvamTTSAdapter, createSarvamTTSAdapter } from '../tts.js';
import type { WebSocketConstructor } from '../tts.js';

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

describe('SarvamTTSAdapter', () => {
  let adapter: SarvamTTSAdapter;

  beforeEach(() => {
    resetMockWs();
    // Re-register mock implementation (clearAllMocks in afterEach clears it)
    (MockWebSocketConstructor as any).mockImplementation(() => mockWsInstance);
    adapter = new SarvamTTSAdapter({
      apiKey: 'test-api-key',
      wsConstructor: MockWebSocketConstructor,
    });
  });

  afterEach(() => {
    // Only clear call tracking, not implementation
    mockWsInstance.send.mockClear();
    mockWsInstance.close.mockClear();
    mockWsInstance.on.mockClear();
    (MockWebSocketConstructor as any).mockClear();
  });

  it('should create adapter with correct name', () => {
    expect(adapter.name).toBe('sarvam-bulbul-v3');
  });

  it('should not be connected initially', () => {
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect to Sarvam TTS', async () => {
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    expect(adapter.isConnected()).toBe(true);
    expect(MockWebSocketConstructor).toHaveBeenCalledOnce();
  });

  it('should send configure message on connect', async () => {
    const connectPromise = adapter.connect({ voiceId: 'aditya', languageCode: 'en-IN' });
    simulateOpen();
    await connectPromise;

    // First send is the configure message
    expect(mockWsInstance.send).toHaveBeenCalled();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.event).toBe('configure');
    expect(sentData.data.speaker).toBe('aditya');
    expect(sentData.data.language_code).toBe('en-IN');
    expect(sentData.data.model).toBe('bulbul:v3');
  });

  it('should synthesize text', async () => {
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    mockWsInstance.send.mockClear();

    const audioBuffer = Buffer.from('audio-data');
    const synthesizePromise = adapter.synthesize('Hello world');

    // Simulate audio response
    simulateMessage(JSON.stringify({
      event: 'audio',
      audio: audioBuffer.toString('base64'),
    }));

    // Simulate completed event
    simulateMessage(JSON.stringify({ event: 'completed' }));

    const result = await synthesizePromise;
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    // Text message is sent
    const textCall = mockWsInstance.send.mock.calls.find((c: any[]) => {
      const data = JSON.parse(c[0]);
      return data.event === 'text';
    });
    expect(textCall).toBeDefined();
    expect(JSON.parse(textCall[0]).text).toBe('Hello world');
  });

  it('should stream text to speech', async () => {
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    mockWsInstance.send.mockClear();

    const audioChunks: Buffer[] = [];
    const streamPromise = (async () => {
      for await (const chunk of adapter.synthesizeStream('Hello world')) {
        audioChunks.push(chunk);
      }
    })();

    // Simulate audio chunks
    simulateMessage(JSON.stringify({
      event: 'audio',
      audio: Buffer.from('chunk1').toString('base64'),
    }));
    simulateMessage(JSON.stringify({
      event: 'audio',
      audio: Buffer.from('chunk2').toString('base64'),
    }));

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // End connection to stop the stream
    simulateClose(1000, 'Normal');

    try { await streamPromise; } catch { /* ignore */ }

    expect(audioChunks.length).toBe(2);
    expect(audioChunks[0]).toEqual(Buffer.from('chunk1'));
    expect(audioChunks[1]).toEqual(Buffer.from('chunk2'));
  });

  it('should handle error event', async () => {
    const connectPromise = adapter.connect();
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
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    const closeHandler = vi.fn();
    adapter.onClose(closeHandler);

    simulateClose(1000, 'Normal');

    expect(closeHandler).toHaveBeenCalledWith(1000, 'Normal');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should update config mid-stream', async () => {
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    mockWsInstance.send.mockClear();

    await adapter.updateConfig({ voiceId: 'meera', pace: 1.5 });

    expect(mockWsInstance.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.event).toBe('config.update');
    expect(sentData.speaker).toBe('meera');
    expect(sentData.pace).toBe(1.5);
  });

  it('should close connection gracefully', async () => {
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    mockWsInstance.send.mockClear();

    await adapter.close();

    expect(mockWsInstance.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.event).toBe('end');
    expect(mockWsInstance.close).toHaveBeenCalledWith(1000, 'Client closing');
  });

  it('should throw when synthesizing while not connected', async () => {
    await expect(adapter.synthesize('Hello')).rejects.toThrow('TTS adapter not connected');
  });

  it('should throw when connecting while already connected', async () => {
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    await expect(adapter.connect()).rejects.toThrow('TTS adapter already connected');
  });

  it('should build correct URL with default parameters', async () => {
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    const wsCall = (MockWebSocketConstructor as any).mock.calls[0];
    const url = wsCall[0];

    expect(url).toContain('model=bulbul%3Av3');
    expect(url).toContain('send_completion_event=true');
    // Voice/language are sent in configure message, not URL
  });

  it('should handle completed event', async () => {
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    // completed event should not disconnect
    simulateMessage(JSON.stringify({ event: 'completed' }));

    expect(adapter.isConnected()).toBe(true);
  });

  it('should handle WebSocket error during connect', async () => {
    const connectPromise = adapter.connect();
    simulateError(new Error('Connection failed'));

    await expect(connectPromise).rejects.toThrow('Connection failed');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should handle malformed message gracefully', async () => {
    const connectPromise = adapter.connect();
    simulateOpen();
    await connectPromise;

    // Send malformed JSON - should not throw
    simulateMessage('not valid json');

    // Adapter should still be connected
    expect(adapter.isConnected()).toBe(true);
  });

  it('should encode PCM to mulaw for telephony', async () => {
    const connectPromise = adapter.connect({ sampleRate: 24000 });
    simulateOpen();
    await connectPromise;

    // Create a 24kHz PCM buffer (100 samples = 200 bytes)
    const pcmBuffer = Buffer.alloc(200);
    pcmBuffer.writeInt16LE(1000, 0);
    pcmBuffer.writeInt16LE(-1000, 2);

    const result = adapter.encode(pcmBuffer, { codec: 'mulaw', sampleRate: 8000, channels: 1 });

    expect(result).toBeDefined();
    // Downsample 24kHz -> 8kHz (3:1 ratio), then mulaw encode (16-bit -> 8-bit)
    // 100 samples / 3 = 33 samples -> 33 bytes
    expect(result.length).toBe(33);
  });

  it('should decode mulaw to PCM', async () => {
    const connectPromise = adapter.connect({ sampleRate: 24000 });
    simulateOpen();
    await connectPromise;

    // Create a mulaw buffer (50 samples)
    const mulawBuffer = Buffer.alloc(50);
    mulawBuffer[0] = 0x80;

    const result = adapter.decode(mulawBuffer, { codec: 'mulaw', sampleRate: 8000, channels: 1 });

    expect(result).toBeDefined();
    // Decode mulaw (8-bit -> 16-bit), then upsample 8kHz -> 24kHz (1:3 ratio)
    // 50 samples * 2 bytes = 100 bytes PCM at 8kHz
    // Upsample to 24kHz = 300 bytes
    expect(result.length).toBe(300);
  });
});

describe('createSarvamTTSAdapter', () => {
  it('should create adapter with API key', () => {
    const adapter = createSarvamTTSAdapter('test-key');
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('sarvam-bulbul-v3');
  });
});
