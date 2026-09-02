import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventEmitter from 'events';
import { PlivoClient, PlivoTelephonyAdapter } from '../client.js';
import { PlivoTransport } from '../websocket.js';
import { validatePlivoV3Signature } from '../security.js';
import { createTelephonyService } from '../../../telephony.js';

class MockWebSocket extends EventEmitter {
  readyState = 1; // WebSocket.OPEN
  sentMessages: string[] = [];

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3;
    this.emit('close', 1000, Buffer.from('Normal closure'));
  }
}

describe('Plivo Telephony Provider Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. PlivoClient & Telephony Adapter', () => {
    it('should throw an error if authId or authToken is missing', () => {
      expect(() => new PlivoClient({ authId: '', authToken: 'secret', callerId: '123' })).toThrow('authId and authToken are required');
      expect(() => new PlivoClient({ authId: 'MA1234', authToken: '', callerId: '123' })).toThrow('authId and authToken are required');
    });

    it('should initialize PlivoClient with valid credentials', () => {
      const client = new PlivoClient({ authId: 'MA1234567890', authToken: 'authTokenSecret123', callerId: '+919876543210' });
      expect(client).toBeDefined();
    });
  });

  describe('2. Plivo V3 Signature Security Validation', () => {
    const authToken = 'plivo_auth_token_secret_12345';

    it('should validate valid Plivo V3 signature', () => {
      const url = 'https://mydomain.com/api/telephony/plivo/stream';
      const nonce = '1234567890';
      const dataToSign = `${url}${nonce}`;

      const crypto = require('crypto');
      const validSignature = crypto.createHmac('sha256', authToken).update(dataToSign).digest('base64');

      const isValid = validatePlivoV3Signature(url, nonce, validSignature, authToken);
      expect(isValid).toBe(true);
    });

    it('should reject invalid Plivo V3 signature', () => {
      const url = 'https://mydomain.com/api/telephony/plivo/stream';
      const nonce = '1234567890';
      const invalidSignature = 'invalid_base64_signature_string';

      const isValid = validatePlivoV3Signature(url, nonce, invalidSignature, authToken);
      expect(isValid).toBe(false);
    });

    it('should reject missing signature or auth token', () => {
      expect(validatePlivoV3Signature('https://test.com', 'nonce', undefined, authToken)).toBe(false);
      expect(validatePlivoV3Signature('https://test.com', 'nonce', 'sig', '')).toBe(false);
    });
  });

  describe('3. PlivoTransport WebSocket Event Lifecycle', () => {
    let mockWs: MockWebSocket;
    let transport: PlivoTransport;

    beforeEach(() => {
      mockWs = new MockWebSocket();
      transport = new PlivoTransport(mockWs as any);
    });

    it('should handle start event and extract metadata', () => {
      const startSpy = vi.fn();
      transport.on('start', startSpy);

      mockWs.emit('message', Buffer.from(JSON.stringify({
        event: 'start',
        sequenceNumber: '1',
        start: {
          streamId: 'stream-plivo-999',
          callId: 'call-uuid-888',
          mediaFormat: { encoding: 'audio/x-l16', sampleRate: 16000 },
        },
        streamId: 'stream-plivo-999',
      })));

      expect(startSpy).toHaveBeenCalledWith({
        streamId: 'stream-plivo-999',
        callId: 'call-uuid-888',
      });
    });

    it('should decode incoming media event (Linear PCM 16kHz)', () => {
      const audioSpy = vi.fn();
      transport.on('audio', audioSpy);

      const samplePcm = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
      const base64Payload = samplePcm.toString('base64');

      // First send start event with x-l16 16000
      mockWs.emit('message', Buffer.from(JSON.stringify({
        event: 'start',
        start: { streamId: 'stream-1', mediaFormat: { encoding: 'audio/x-l16', sampleRate: 16000 } },
        streamId: 'stream-1',
      })));

      mockWs.emit('message', Buffer.from(JSON.stringify({
        event: 'media',
        media: { payload: base64Payload },
        streamId: 'stream-1',
      })));

      expect(audioSpy).toHaveBeenCalled();
      const receivedBuffer: Buffer = audioSpy.mock.calls[0][0];
      expect(receivedBuffer.toString('hex')).toBe(samplePcm.toString('hex'));
    });

    it('should handle DTMF event', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockWs.emit('message', Buffer.from(JSON.stringify({
        event: 'dtmf',
        streamId: 'stream-1',
        dtmf: { digit: '5' },
      })));

      consoleSpy.mockRestore();
    });

    it('should handle stop event and emit close', () => {
      const closeSpy = vi.fn();
      transport.on('close', closeSpy);

      mockWs.emit('message', Buffer.from(JSON.stringify({
        event: 'stop',
        streamId: 'stream-1',
      })));

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('4. Server-to-Plivo Outbound Protocol (playAudio & clearAudio)', () => {
    let mockWs: MockWebSocket;
    let transport: PlivoTransport;

    beforeEach(() => {
      mockWs = new MockWebSocket();
      transport = new PlivoTransport(mockWs as any);
    });

    it('should serialize playAudio event for outbound audio speech', async () => {
      const audioPcm = Buffer.from([10, 20, 30, 40]);
      await transport.send({
        type: 'speech',
        transcript: 'नमस्ते',
        audio: audioPcm,
        isPartial: false,
        timestamp: Date.now(),
      });

      expect(mockWs.sentMessages.length).toBe(1);
      const sentObj = JSON.parse(mockWs.sentMessages[0]);
      expect(sentObj.event).toBe('playAudio');
      expect(sentObj.media.contentType).toBe('audio/x-l16');
      expect(sentObj.media.sampleRate).toBe(8000);
      expect(sentObj.media.payload).toBeDefined();
      expect(typeof sentObj.media.payload).toBe('string');
    });

    it('should send clearAudio event on interruption / barge-in', () => {
      transport.clearAudio();

      expect(mockWs.sentMessages.length).toBe(1);
      const sentObj = JSON.parse(mockWs.sentMessages[0]);
      expect(sentObj.event).toBe('clearAudio');
    });

    it('should send checkpoint event', () => {
      transport.sendCheckpoint('checkpoint-turn-1');

      expect(mockWs.sentMessages.length).toBe(1);
      const sentObj = JSON.parse(mockWs.sentMessages[0]);
      expect(sentObj.event).toBe('checkpoint');
      expect(sentObj.name).toBe('checkpoint-turn-1');
    });
  });

  describe('5. Provider Selection Precedence & Factory Validation', () => {
    const origEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...origEnv };
    });

    it('should respect explicit provider parameter over environment variable', () => {
      process.env.TELEPHONY_PROVIDER = 'exotel';
      process.env.PLIVO_AUTH_ID = 'MA_TEST_AUTH_ID';
      process.env.PLIVO_AUTH_TOKEN = 'PLIVO_TEST_AUTH_TOKEN';
      process.env.PLIVO_CALLER_ID = '+919876543210';

      const service = createTelephonyService('plivo');
      expect(service).toBeInstanceOf(PlivoTelephonyAdapter);
    });

    it('should fallback to TELEPHONY_PROVIDER when no explicit preference is passed', () => {
      process.env.TELEPHONY_PROVIDER = 'exotel';
      process.env.EXOTEL_ACCOUNT_SID = 'exotel_sid';
      process.env.EXOTEL_API_KEY = 'exotel_key';
      process.env.EXOTEL_API_TOKEN = 'exotel_token';
      process.env.EXOTEL_CALLER_ID = '09513886363';

      const service = createTelephonyService();
      expect(service).not.toBeNull();
    });

    it('should return null with warning if Plivo credentials are missing', () => {
      delete process.env.PLIVO_AUTH_ID;
      delete process.env.PLIVO_AUTH_TOKEN;

      const service = createTelephonyService('plivo');
      expect(service).toBeNull();
    });
  });
});
