import { describe, it, expect, vi, beforeAll } from 'vitest';
import { initializeLogger, llm } from '@livekit/agents';
import { SarvamLLM, SarvamLLMStream } from '../sarvamLlm.ts';
import https from 'node:https';
import { EventEmitter } from 'node:events';

describe('SarvamLLM Stream Whitespace & Tool Call Handling', () => {
  beforeAll(() => {
    initializeLogger({ pretty: true, level: 'warn' });
  });
  it('suppresses leading whitespace ("\\n") before a tool call without creating empty assistant speech', async () => {
    const sarvamLlm = new SarvamLLM({ apiKey: 'test-key' });
    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({ role: 'user', content: 'Book appointment' });

    // Mock https.request to simulate Sarvam SSE chunks
    const mockReq = new EventEmitter() as any;
    mockReq.write = vi.fn();
    mockReq.end = vi.fn();

    const requestSpy = vi.spyOn(https, 'request').mockImplementation((_url: any, _options: any, callback: any) => {
      const mockRes = new EventEmitter() as any;
      mockRes.statusCode = 200;
      callback(mockRes);

      // Emit chunk 1 with leading newline delta
      mockRes.emit(
        'data',
        Buffer.from(
          'data: {"id":"chunk-1","choices":[{"delta":{"content":"\\n"}}]}\n\n',
        ),
      );

      // Emit chunk 2 with tool_calls
      mockRes.emit(
        'data',
        Buffer.from(
          'data: {"id":"chunk-2","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-123","function":{"name":"book_appointment","arguments":"{\\"title\\":\\"Checkup\\"}"}}]}}]}\n\n',
        ),
      );

      // Emit done
      mockRes.emit('data', Buffer.from('data: [DONE]\n\n'));
      mockRes.emit('end');

      return mockReq;
    });

    const stream = sarvamLlm.chat({ chatCtx });
    const receivedDeltas: any[] = [];

    for await (const chunk of stream) {
      receivedDeltas.push(chunk);
    }

    requestSpy.mockRestore();

    // Verify: No text chunk containing only "\n" was emitted
    const textChunks = receivedDeltas.filter((d) => d.delta?.content);
    expect(textChunks).toHaveLength(0);

    // Verify: Tool call was successfully emitted
    const toolCallChunks = receivedDeltas.filter((d) => d.delta?.toolCalls);
    expect(toolCallChunks).toHaveLength(1);
    expect(toolCallChunks[0].delta.toolCalls[0].name).toBe('book_appointment');
    expect(toolCallChunks[0].delta.toolCalls[0].args).toBe('{"title":"Checkup"}');
  });

  it('suppresses multiple leading whitespace/newlines ("\\n\\n   \\t") before tool call', async () => {
    const sarvamLlm = new SarvamLLM({ apiKey: 'test-key' });
    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({ role: 'user', content: 'Book appointment' });

    const mockReq = new EventEmitter() as any;
    mockReq.write = vi.fn();
    mockReq.end = vi.fn();

    const requestSpy = vi.spyOn(https, 'request').mockImplementation((_url: any, _options: any, callback: any) => {
      const mockRes = new EventEmitter() as any;
      mockRes.statusCode = 200;
      callback(mockRes);

      mockRes.emit('data', Buffer.from('data: {"id":"chunk-1","choices":[{"delta":{"content":"\\n\\n"}}]}\n\n'));
      mockRes.emit('data', Buffer.from('data: {"id":"chunk-2","choices":[{"delta":{"content":"   \\t"}}]}\n\n'));
      mockRes.emit(
        'data',
        Buffer.from(
          'data: {"id":"chunk-3","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-456","function":{"name":"query_knowledge_base","arguments":"{\\"query\\":\\"fees\\"}"}}]}}]}\n\n',
        ),
      );
      mockRes.emit('data', Buffer.from('data: [DONE]\n\n'));
      mockRes.emit('end');

      return mockReq;
    });

    const stream = sarvamLlm.chat({ chatCtx });
    const receivedDeltas: any[] = [];

    for await (const chunk of stream) {
      receivedDeltas.push(chunk);
    }

    requestSpy.mockRestore();

    const textChunks = receivedDeltas.filter((d) => d.delta?.content);
    expect(textChunks).toHaveLength(0);

    const toolCallChunks = receivedDeltas.filter((d) => d.delta?.toolCalls);
    expect(toolCallChunks).toHaveLength(1);
    expect(toolCallChunks[0].delta.toolCalls[0].name).toBe('query_knowledge_base');
  });

  it('preserves meaningful natural text in normal conversations without tool calls', async () => {
    const sarvamLlm = new SarvamLLM({ apiKey: 'test-key' });
    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({ role: 'user', content: 'Hello' });

    const mockReq = new EventEmitter() as any;
    mockReq.write = vi.fn();
    mockReq.end = vi.fn();

    const requestSpy = vi.spyOn(https, 'request').mockImplementation((_url: any, _options: any, callback: any) => {
      const mockRes = new EventEmitter() as any;
      mockRes.statusCode = 200;
      callback(mockRes);

      mockRes.emit('data', Buffer.from('data: {"id":"chunk-1","choices":[{"delta":{"content":"Namaste! "}}]}\n\n'));
      mockRes.emit('data', Buffer.from('data: {"id":"chunk-2","choices":[{"delta":{"content":"Aap kaise hain?"}}]}\n\n'));
      mockRes.emit('data', Buffer.from('data: [DONE]\n\n'));
      mockRes.emit('end');

      return mockReq;
    });

    const stream = sarvamLlm.chat({ chatCtx });
    const receivedTexts: string[] = [];

    for await (const chunk of stream) {
      if (chunk.delta?.content) {
        receivedTexts.push(chunk.delta.content);
      }
    }

    requestSpy.mockRestore();

    expect(receivedTexts.join('')).toBe('Namaste! Aap kaise hain?');
  });

  it('preserves meaningful text that begins after initial whitespace when no tool calls occur', async () => {
    const sarvamLlm = new SarvamLLM({ apiKey: 'test-key' });
    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({ role: 'user', content: 'Tell me hours' });

    const mockReq = new EventEmitter() as any;
    mockReq.write = vi.fn();
    mockReq.end = vi.fn();

    const requestSpy = vi.spyOn(https, 'request').mockImplementation((_url: any, _options: any, callback: any) => {
      const mockRes = new EventEmitter() as any;
      mockRes.statusCode = 200;
      callback(mockRes);

      // Initial whitespace
      mockRes.emit('data', Buffer.from('data: {"id":"chunk-1","choices":[{"delta":{"content":"\\n"}}]}\n\n'));
      // Followed by meaningful text
      mockRes.emit('data', Buffer.from('data: {"id":"chunk-2","choices":[{"delta":{"content":"We are open from 9 AM."}}]}\n\n'));
      mockRes.emit('data', Buffer.from('data: [DONE]\n\n'));
      mockRes.emit('end');

      return mockReq;
    });

    const stream = sarvamLlm.chat({ chatCtx });
    const receivedTexts: string[] = [];

    for await (const chunk of stream) {
      if (chunk.delta?.content) {
        receivedTexts.push(chunk.delta.content);
      }
    }

    requestSpy.mockRestore();

    expect(receivedTexts.join('')).toBe('\nWe are open from 9 AM.');
  });
});
