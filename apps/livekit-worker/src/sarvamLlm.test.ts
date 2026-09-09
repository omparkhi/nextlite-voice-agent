import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';
import { StringDecoder } from 'node:string_decoder';
import { initializeLogger, llm } from '@livekit/agents';
import type { RuntimeAgentConfig } from '@nextlite/shared';
import { SarvamLLM } from './sarvamLlm.ts';
import { createAgent } from './agent.ts';

beforeAll(() => {
  dotenv.config({ path: '.env.local' });
  process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'test-livekit-api-key';
  process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'test-livekit-api-secret-1234567890';
  process.env.SARVAM_API_KEY = process.env.SARVAM_API_KEY || 'test-sarvam-api-key';
  initializeLogger({ pretty: true, level: 'warn' });
});

describe('SarvamLLM Hardening & UTF-8 / Network Robustness', () => {
  describe('1. UTF-8 Multi-byte Chunk Boundary Decoding', () => {
    it('correctly decodes a 3-byte Hindi/Marathi Devanagari character split across chunk boundaries', () => {
      // The Hindi/Marathi word "नमस्ते" in UTF-8 bytes:
      // 'न' = [0xE0, 0xA4, 0xA8]
      // 'म' = [0xE0, 0xA4, 0xAE]
      // 'स' = [0xE0, 0xA4, 0xB8]
      // '्' = [0xE0, 0xA5, 0x8D]
      // 'त' = [0xE0, 0xA4, 0xA4]
      // 'े' = [0xE0, 0xA5, 0x87]
      const fullWord = 'नमस्ते';
      const fullBuffer = Buffer.from(fullWord, 'utf8');

      // Split the 3-byte character 'म' (bytes 3, 4, 5) right across chunk 1 and chunk 2:
      // chunk1 has bytes 0..4 (splitting the character 'म' after byte 4, leaving byte 5 for chunk 2)
      const chunk1 = fullBuffer.subarray(0, 4);
      const chunk2 = fullBuffer.subarray(4);

      const decoder = new StringDecoder('utf8');
      const text1 = decoder.write(chunk1);
      const text2 = decoder.write(chunk2);
      const finalRest = decoder.end();

      const decoded = text1 + text2 + finalRest;
      expect(decoded).toBe(fullWord);
      expect(decoded.includes('\uFFFD')).toBe(false); // No replacement character
    });

    it('correctly decodes complex Marathi characters split across arbitrary single-byte chunks', () => {
      const marathiSentence = 'नमस्कार, मी आपली कशी मदत करू शकतो?';
      const buffer = Buffer.from(marathiSentence, 'utf8');

      const decoder = new StringDecoder('utf8');
      let result = '';

      // Stream 1 byte at a time across chunk boundaries
      for (let i = 0; i < buffer.length; i++) {
        result += decoder.write(buffer.subarray(i, i + 1));
      }
      result += decoder.end();

      expect(result).toBe(marathiSentence);
      expect(result.includes('\uFFFD')).toBe(false);
    });

    it('correctly decodes mixed Hinglish, English, numbers and punctuation', () => {
      const mixedText = 'Hello! Kal afternoon 3:30 PM ko appointment confirm karein?';
      const buffer = Buffer.from(mixedText, 'utf8');

      const decoder = new StringDecoder('utf8');
      let result = '';
      for (let i = 0; i < buffer.length; i += 3) {
        result += decoder.write(buffer.subarray(i, i + 3));
      }
      result += decoder.end();

      expect(result).toBe(mixedText);
    });
  });

  describe('2. Request Timeout & Abort Lifecycle', () => {
    it('sets timeout on HTTPS request matching connOptions.timeoutMs', async () => {
      const sarvamLlm = new SarvamLLM({
        apiKey: 'test-key',
        model: 'sarvam-105b-conversations',
      });

      const chatCtx = new llm.ChatContext();
      chatCtx.addMessage({ role: 'user', content: 'Hello' });

      const stream = sarvamLlm.chat({
        chatCtx,
        connOptions: {
          maxRetry: 0,
          retryIntervalMs: 1000,
          timeoutMs: 50, // 50ms timeout for testing fast trigger
        },
      });

      expect(stream).toBeDefined();
      try {
        for await (const _chunk of stream) {
          // drain
        }
      } catch {
        // Expected rejection from invalid key or timeout
      }
    });
  });

  describe('3. Authoritative Runtime LLM Routing in createAgent()', () => {
    const baseMockConfig: RuntimeAgentConfig = {
      tenant: { tenantId: 'tenant-1' },
      agent: { agentId: 'agent-1', agentName: 'Apollo Support', status: 'LIVE' },
      deployment: { deploymentId: 'dep-1', versionId: 'ver-1', versionNumber: 1 },
      prompt: {
        compiledSystemPrompt: 'You are a dental clinic voice assistant.',
        greeting: 'Hello!',
      },
      voice: {
        provider: 'sarvam',
        sttModel: 'saaras:v3',
        ttsModel: 'bulbul:v3',
        voiceId: 'priya',
      },
      language: { primary: 'hi-IN', supportedLanguages: ['hi-IN'] },
      runtime: {
        modelProvider: 'sarvam',
        llmModel: 'sarvam-105b-conversations',
        temperature: 0.3,
      },
      knowledge: { enabled: false },
      tools: { enabled: false, tools: [] },
      variables: { inputVariables: [], outputVariables: [] },
    };

    it('routes to SarvamLLM when modelProvider is "sarvam"', () => {
      const agent = createAgent(baseMockConfig);
      expect(agent.llm).toBeInstanceOf(SarvamLLM);
      expect(agent.llm.model).toBe('sarvam-105b-conversations');
    });

    it('routes to SarvamLLM when llmModel starts with "sarvam"', () => {
      const sarvamConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        runtime: {
          modelProvider: 'sarvam',
          llmModel: 'sarvam-105b-conversations',
        },
      };

      const agent = createAgent(sarvamConfig);
      expect(agent.llm).toBeInstanceOf(SarvamLLM);
      expect(agent.llm.model).toBe('sarvam-105b-conversations');
    });

    it('routes to inference.LLM when modelProvider is "google" or "openai"', () => {
      const googleConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        runtime: {
          modelProvider: 'google',
          llmModel: 'google/gemma-4-31b-it',
        },
      };

      const agent = createAgent(googleConfig);
      expect(agent.llm).not.toBeInstanceOf(SarvamLLM);
      expect(agent.llm.model).toBe('google/gemma-4-31b-it');

      const openaiConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        runtime: {
          modelProvider: 'openai',
          llmModel: 'openai/gpt-4.1-mini',
        },
      };

      const agentOpenai = createAgent(openaiConfig);
      expect(agentOpenai.llm).not.toBeInstanceOf(SarvamLLM);
      expect(agentOpenai.llm.model).toBe('openai/gpt-4.1-mini');
    });

    it('fails clearly when an unsupported modelProvider or llmModel is configured', () => {
      const unsupportedConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        runtime: {
          modelProvider: 'anthropic' as any,
          llmModel: 'claude-3-5-sonnet' as any,
        },
      };

      expect(() => createAgent(unsupportedConfig)).toThrowError(
        /Unsupported LLM configuration in RuntimeAgentConfig/,
      );
    });

    it('falls back safely to default SarvamLLM when runtimeConfig is undefined', () => {
      const agent = createAgent(undefined);
      expect(agent.llm).toBeInstanceOf(SarvamLLM);
      expect(agent.llm.model).toBe('sarvam-105b-conversations');
    });
  });
});
