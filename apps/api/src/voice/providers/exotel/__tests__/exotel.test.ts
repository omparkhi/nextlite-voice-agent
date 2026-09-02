import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExotelClient, createExotelClient } from '../client.js';
import { ExotelTransport } from '../websocket.js';
import { ExotelClient as ClientClass } from '../client.js';
import type { ExotelConfig, ExotelInboundEvent } from '../types.js';

// Mock WebSocket
function createMockWebSocket() {
  const messages: string[] = [];
  const handlers: Record<string, Function> = {};

  return {
    messages,
    handlers,
    readyState: 1, // OPEN
    send: vi.fn((data: string) => {
      messages.push(data);
    }),
    close: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    }),
    simulateMessage: (data: string) => {
      handlers['message']?.(Buffer.from(data));
    },
    simulateClose: (code: number = 1000, reason: string = 'Normal') => {
      handlers['close']?.(code, Buffer.from(reason));
    },
    simulateError: (error: Error) => {
      handlers['error']?.(error);
    },
  };
}

// Mock VoiceSession
function createMockSession() {
  return {
    id: 'test-session-1',
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    state: 'idle',
    setState: vi.fn(),
    end: vi.fn(),
    addUserMessage: vi.fn(),
    addAssistantMessage: vi.fn(),
    on: vi.fn(),
  };
}

function startStream(ws: ReturnType<typeof createMockWebSocket>) {
  // Exotel start event uses snake_case and nested start object
  const startEvent = {
    event: 'start',
    sequence_number: 1,
    stream_sid: 'stream-123',
    start: {
      stream_sid: 'stream-123',
      call_sid: 'call-456',
      account_sid: 'account-789',
      from: '+919876543210',
      to: '0XXXXXXXXXX',
      media_format: {
        encoding: 'pcm_s16le',
        sample_rate: '8000',
        bit_rate: '128000',
      },
    },
  };
  ws.simulateMessage(JSON.stringify(startEvent));
}

describe('ExotelClient', () => {
  const config: ExotelConfig = {
    accountSid: 'test-account-sid',
    apiKey: 'test-api-key',
    apiToken: 'test-api-token',
    callerId: '0XXXXXXXXXX',
    baseUrl: 'https://api.in.exotel.com',
  };

  let client: ExotelClient;

  beforeEach(() => {
    client = createExotelClient(config);
    vi.restoreAllMocks();
  });

  it('should create client with config', () => {
    expect(client).toBeDefined();
  });

  it('should map Exotel status correctly', () => {
    expect(ClientClass.mapStatus('queued')).toBe('queued');
    expect(ClientClass.mapStatus('in-progress')).toBe('in-progress');
    expect(ClientClass.mapStatus('completed')).toBe('completed');
    expect(ClientClass.mapStatus('completed-final')).toBe('completed');
    expect(ClientClass.mapStatus('failed')).toBe('failed');
    expect(ClientClass.mapStatus('busy')).toBe('busy');
    expect(ClientClass.mapStatus('no-answer')).toBe('no-answer');
    expect(ClientClass.mapStatus('unknown')).toBe('failed');
  });

  it('should make outbound call without Url parameter', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        Call: {
          Sid: 'test-call-sid',
          Status: 'in-progress',
          From: '+919876543210',
          PhoneNumberSid: '0XXXXXXXXXX',
          Direction: 'outbound-api',
          DateCreated: '2026-08-31 15:00:00',
          RecordingUrl: null,
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await client.makeOutboundCall({
      from: '+919876543210',
      callerid: '0XXXXXXXXXX',
      streamUrl: 'wss://example.com/media?sample-rate=8000',
      streamType: 'bidirectional',
    });

    expect(result.call.sid).toBe('test-call-sid');
    expect(result.call.status).toBe('in-progress');
    expect(mockFetch).toHaveBeenCalledOnce();

    // Verify the request body does NOT contain standalone Url parameter (Flow API)
    // but DOES contain StreamUrl (Connect Voice AI API)
    const callArgs = mockFetch.mock.calls[0];
    const body = callArgs[1].body as string;
    // Decode URL-encoded body for checking
    const decoded = decodeURIComponent(body);
    // Should NOT have standalone Url parameter (Flow API artifact)
    expect(decoded).not.toMatch(/[&?]Url=/);
    // Should have StreamUrl (Connect Voice AI API)
    expect(decoded).toContain('StreamUrl=');
    expect(decoded).toContain('StreamType=bidirectional');
    expect(decoded).toContain('From=');
    expect(decoded).toContain('CallerId=');
  });

  it('should throw on API error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(client.makeOutboundCall({
      from: '+919876543210',
      callerid: '0XXXXXXXXXX',
      streamUrl: 'wss://example.com/media',
      streamType: 'bidirectional',
    })).rejects.toThrow('Exotel API error: 401 Unauthorized');
  });
});

describe('ExotelTransport', () => {
  let ws: ReturnType<typeof createMockWebSocket>;
  let session: ReturnType<typeof createMockSession>;
  let transport: ExotelTransport;

  beforeEach(() => {
    ws = createMockWebSocket();
    session = createMockSession();
    transport = new ExotelTransport(ws as any, session as any, { sampleRate: 8000 });
  });

  it('should create transport with correct type', () => {
    expect(transport.type).toBe('real_call');
    expect(transport.sessionId).toBe('test-session-1');
  });

  it('should handle connected event', () => {
    const event: ExotelInboundEvent = { event: 'connected' };
    ws.simulateMessage(JSON.stringify(event));
    // No error thrown means success
  });

  it('should handle start event with nested structure', () => {
    startStream(ws);

    expect(transport.getStreamSid()).toBe('stream-123');
    expect(transport.getCallSid()).toBe('call-456');
    expect(session.setState).toHaveBeenCalledWith('listening');
  });

  it('should handle media event and notify handler', () => {
    const messageHandler = vi.fn();
    transport.onMessage(messageHandler);

    startStream(ws);

    const audioPayload = Buffer.from([0x10, 0x20, 0x30]).toString('base64');
    const mediaEvent = {
      event: 'media',
      sequence_number: 3,
      stream_sid: 'stream-123',
      media: {
        chunk: 1,
        timestamp: '1234567890',
        payload: audioPayload,
      },
    };
    ws.simulateMessage(JSON.stringify(mediaEvent));

    expect(messageHandler).toHaveBeenCalledOnce();
    const message = messageHandler.mock.calls[0][0];
    expect(message.type).toBe('speech');
    // Audio should be raw PCM16 (NOT decoded from μ-law)
    expect(message.audio).toEqual(Buffer.from([0x10, 0x20, 0x30]));
    expect(message.isFinal).toBe(true);
  });

  it('should handle stop event with nested structure', () => {
    startStream(ws);

    const stopEvent = {
      event: 'stop',
      sequence_number: 10,
      stream_sid: 'stream-123',
      stop: {
        call_sid: 'call-456',
        account_sid: 'account-789',
        reason: 'callended',
      },
    };
    ws.simulateMessage(JSON.stringify(stopEvent));

    expect(session.end).toHaveBeenCalledWith('exotel_stream_stopped');
  });

  it('should send media event with snake_case', async () => {
    startStream(ws);

    // Set TTS output format to 8kHz (matching telephony usage)
    transport.setTTSOutputFormat({ codec: 'pcm_s16le', sampleRate: 8000, channels: 1 });

    ws.send.mockClear();

    const pcmBuffer = Buffer.from([0x40, 0x50, 0x60]);
    await transport.sendAudioToExotel(pcmBuffer);

    expect(ws.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(ws.messages[ws.messages.length - 1]);
    expect(sentData.event).toBe('media');
    expect(sentData.stream_sid).toBe('stream-123');
    expect(sentData.media.payload).toBe(pcmBuffer.toString('base64'));
  });

  it('should send clear event with snake_case', async () => {
    startStream(ws);

    ws.send.mockClear();

    await transport.sendClear();

    expect(ws.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(ws.messages[ws.messages.length - 1]);
    expect(sentData.event).toBe('clear');
    expect(sentData.stream_sid).toBe('stream-123');
  });

  it('should send agent response to Exotel', async () => {
    startStream(ws);

    // Set TTS output format to 8kHz (matching telephony usage)
    transport.setTTSOutputFormat({ codec: 'pcm_s16le', sampleRate: 8000, channels: 1 });

    ws.send.mockClear();

    const pcmBuffer = Buffer.from([0x40, 0x50, 0x60]);
    await transport.send({
      type: 'speech',
      transcript: 'Hello',
      audio: pcmBuffer,
      isPartial: false,
      timestamp: Date.now(),
    });

    expect(ws.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(ws.messages[ws.messages.length - 1]);
    expect(sentData.event).toBe('media');
    expect(sentData.stream_sid).toBe('stream-123');
    expect(sentData.media.payload).toBe(pcmBuffer.toString('base64'));
  });

  it('should handle close event', () => {
    ws.simulateClose(1000, 'Normal');
    // No error thrown means success
  });

  it('should handle error event without closing', () => {
    ws.simulateError(new Error('Test error'));
    // Transport should NOT be closed — only close event should close
    expect(transport.supportsStreaming()).toBe(true);
  });

  it('should support streaming', () => {
    expect(transport.supportsStreaming()).toBe(true);
  });

  it('should downsample audio from 24kHz to 8kHz', async () => {
    startStream(ws);

    transport.setTTSOutputFormat({ codec: 'pcm_s16le', sampleRate: 24000, channels: 1 });

    ws.send.mockClear();

    // Create a 24kHz buffer (6 samples = 3 PCM16 samples)
    const pcmBuffer = Buffer.alloc(6);
    pcmBuffer.writeInt16LE(1000, 0);
    pcmBuffer.writeInt16LE(2000, 2);
    pcmBuffer.writeInt16LE(3000, 4);

    await transport.sendAudioToExotel(pcmBuffer);

    expect(ws.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(ws.messages[ws.messages.length - 1]);
    // Downsampled from 24kHz to 8kHz (3:1 ratio) = 1 sample = 2 bytes
    const downsampled = Buffer.from(sentData.media.payload, 'base64');
    expect(downsampled.length).toBe(2);
    expect(downsampled.readInt16LE(0)).toBe(1000);
  });

  it('should not send when closed', async () => {
    startStream(ws);

    // Close the transport
    transport.close();
    ws.send.mockClear();

    const pcmBuffer = Buffer.from([0x40, 0x50, 0x60]);
    await transport.sendAudioToExotel(pcmBuffer);

    // Should not send because transport is closed
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('should not send when no streamSid', async () => {
    // Don't start stream - no streamSid

    const pcmBuffer = Buffer.from([0x40, 0x50, 0x60]);
    await transport.sendAudioToExotel(pcmBuffer);

    // Should not send because no streamSid
    expect(ws.send).not.toHaveBeenCalled();
  });
});

describe('Exotel Provider Exports', () => {
  it('should export all required types and functions', async () => {
    const module = await import('../index.js');
    expect(module.ExotelClient).toBeDefined();
    expect(module.createExotelClient).toBeDefined();
    expect(module.ExotelTransport).toBeDefined();
  });
});
