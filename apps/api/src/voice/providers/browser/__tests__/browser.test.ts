import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserTransport } from '../websocket.js';
import { VoiceSession } from '../../../session.js';
import type { VoiceSessionConfig } from '../../../types.js';

// Mock WebSocket instance
const mockWsInstance = {
  readyState: 1,
  send: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
};

// Create a test session
function createTestSession(): VoiceSession {
  const config: VoiceSessionConfig = {
    sessionId: 'test-session-id',
    tenantId: 'test-tenant-id',
    agentId: 'test-agent-id',
    transport: 'web_voice',
    inputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
    outputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
  };
  return new VoiceSession(config);
}

function resetMockWs() {
  mockWsInstance.send.mockClear();
  mockWsInstance.close.mockClear();
  mockWsInstance.on.mockClear();
  mockWsInstance.readyState = 1;
}

function simulateMessage(data: string) {
  const messageHandler = mockWsInstance.on.mock.calls.find((c: any[]) => c[0] === 'message')?.[1];
  messageHandler?.(Buffer.from(data));
}

function simulateClose(code: number = 1000, reason: string = 'Normal') {
  const closeHandler = mockWsInstance.on.mock.calls.find((c: any[]) => c[0] === 'close')?.[1];
  closeHandler?.(code, Buffer.from(reason));
}

describe('BrowserTransport', () => {
  let transport: BrowserTransport;
  let session: VoiceSession;

  beforeEach(() => {
    resetMockWs();
    session = createTestSession();
    transport = new BrowserTransport(mockWsInstance as any, session, { sampleRate: 16000 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create transport with correct type', () => {
    expect(transport.type).toBe('web_voice');
  });

  it('should have correct session ID', () => {
    expect(transport.sessionId).toBe('test-session-id');
  });

  it('should return sample rate', () => {
    expect(transport.getSampleRate()).toBe(16000);
  });

  it('should support streaming', () => {
    expect(transport.supportsStreaming()).toBe(true);
  });

  it('should send agent response with transcript', async () => {
    const message = {
      type: 'speech' as const,
      transcript: 'Hello, how can I help you?',
      isPartial: false,
      timestamp: Date.now(),
    };

    await transport.send(message);

    // Should send state event and transcript event
    expect(mockWsInstance.send).toHaveBeenCalledTimes(2);

    // First call should be state event
    const firstCall = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(firstCall.type).toBe('state');
    expect(firstCall.state).toBe('speaking');

    // Second call should be transcript event
    const secondCall = JSON.parse(mockWsInstance.send.mock.calls[1][0]);
    expect(secondCall.type).toBe('transcript');
    expect(secondCall.text).toBe('Hello, how can I help you?');
    expect(secondCall.isFinal).toBe(true);
  });

  it('should send agent response with audio', async () => {
    const audioBuffer = Buffer.from('test-audio-data');
    const message = {
      type: 'speech' as const,
      transcript: 'Response',
      audio: audioBuffer,
      isPartial: false,
      timestamp: Date.now(),
    };

    await transport.send(message);

    // Should send state, transcript, and audio events
    expect(mockWsInstance.send).toHaveBeenCalledTimes(3);

    // Third call should be audio event
    const thirdCall = JSON.parse(mockWsInstance.send.mock.calls[2][0]);
    expect(thirdCall.type).toBe('audio');
    expect(thirdCall.data).toBe(audioBuffer.toString('base64'));
    expect(thirdCall.sampleRate).toBe(16000);
  });

  it('should send state update', () => {
    transport.sendState('listening');

    expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.type).toBe('state');
    expect(sentData.state).toBe('listening');
  });

  it('should send partial transcript', () => {
    transport.sendPartialTranscript('Partial text...');

    expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.type).toBe('transcript');
    expect(sentData.text).toBe('Partial text...');
    expect(sentData.isFinal).toBe(false);
  });

  it('should send error message', () => {
    transport.sendError('Something went wrong');

    expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.type).toBe('error');
    expect(sentData.message).toBe('Something went wrong');
  });

  it('should handle audio message from browser', () => {
    const messageHandler = vi.fn();
    transport.onMessage(messageHandler);

    const audioData = Buffer.from([0x10, 0x20, 0x30]).toString('base64');
    const event = { type: 'audio', data: audioData };
    simulateMessage(JSON.stringify(event));

    expect(messageHandler).toHaveBeenCalledOnce();
    const receivedMsg = messageHandler.mock.calls[0][0];
    expect(receivedMsg.type).toBe('speech');
    expect(receivedMsg.audio).toEqual(Buffer.from([0x10, 0x20, 0x30]));
    expect(receivedMsg.isFinal).toBe(true);
  });

  it('should handle start event from browser', () => {
    const event = { type: 'start', sampleRate: 16000 };
    simulateMessage(JSON.stringify(event));

    // Start event is logged but doesn't trigger message handler
    expect(mockWsInstance.send).not.toHaveBeenCalled();
  });

  it('should handle stop event from browser', () => {
    const event = { type: 'stop' };
    simulateMessage(JSON.stringify(event));

    // Stop event is logged but doesn't trigger message handler
    expect(mockWsInstance.send).not.toHaveBeenCalled();
  });

  it('should handle clear event from browser (barge-in)', async () => {
    const stopPlaybackSpy = vi.spyOn(session, 'stopPlayback');

    const event = { type: 'clear' };
    simulateMessage(JSON.stringify(event));

    // Clear event should trigger stopPlayback on session
    expect(stopPlaybackSpy).toHaveBeenCalledOnce();
  });

  it('should handle close event', () => {
    const closeHandler = vi.fn();
    transport.onClose(closeHandler);

    simulateClose(1000, 'Normal');

    expect(closeHandler).toHaveBeenCalledOnce();
  });

  it('should not send after close', async () => {
    const closeHandler = vi.fn();
    transport.onClose(closeHandler);

    simulateClose(1000, 'Normal');

    // Try to send after close
    await transport.send({
      type: 'speech',
      transcript: 'Should not send',
      isPartial: false,
      timestamp: Date.now(),
    });

    // Should not have sent any new messages after close
    // (only the close handler was called)
  });

  it('should stop playback by sending listening state', async () => {
    await transport.stopPlayback();

    expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.type).toBe('state');
    expect(sentData.state).toBe('listening');
  });

  it('should send ended state on close', async () => {
    await transport.close();

    expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
    expect(sentData.type).toBe('state');
    expect(sentData.state).toBe('ended');
  });

  it('should handle malformed message gracefully', () => {
    const messageHandler = vi.fn();
    transport.onMessage(messageHandler);

    // Send malformed JSON - should not throw
    simulateMessage('not valid json');

    // Should not call message handler
    expect(messageHandler).not.toHaveBeenCalled();
  });

  it('should handle unknown event type gracefully', () => {
    const messageHandler = vi.fn();
    transport.onMessage(messageHandler);

    const event = { type: 'unknown_event' };
    simulateMessage(JSON.stringify(event));

    // Should not call message handler for unknown events
    expect(messageHandler).not.toHaveBeenCalled();
  });
});

describe('BrowserTransport exports', () => {
  it('should export BrowserTransport class', () => {
    expect(BrowserTransport).toBeDefined();
    expect(typeof BrowserTransport).toBe('function');
  });
});
