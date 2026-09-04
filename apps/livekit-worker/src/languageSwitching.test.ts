import { describe, it, expect, vi, beforeAll } from 'vitest';
import dotenv from 'dotenv';

beforeAll(() => {
  dotenv.config({ path: '.env.local' });
  process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'test-livekit-api-key';
  process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'test-livekit-api-secret-1234567890';
  process.env.SARVAM_API_KEY = process.env.SARVAM_API_KEY || 'test-sarvam-api-key';
});

import {
  ConversationLanguageManager,
  detectExplicitLanguageRequest,
  matchSupportedLanguage,
  normalizeLanguageCode,
  buildLanguageInstruction,
  buildFullInstructions,
} from './languageManager.ts';
import { createAgent, DEFAULT_SYSTEM_PROMPT } from './agent.ts';
import type { RuntimeAgentConfig } from '@nextlite/shared';
import * as sarvam from '@livekit/agents-plugin-sarvam';

describe('Dynamic Multilingual Voice & Sarvam Language Switching', () => {
  const baseConfig: RuntimeAgentConfig = {
    tenant: { tenantId: 'tenant-1' },
    agent: { agentId: 'agent-1', agentName: 'Multilingual Agent', status: 'LIVE' },
    deployment: { deploymentId: 'dep-1', versionId: 'ver-1', versionNumber: 1 },
    prompt: {
      compiledSystemPrompt: 'You are a helpful customer support agent for NextLite Dental.',
      greeting: 'Hello! How can I assist you?',
    },
    voice: {
      provider: 'sarvam',
      sttModel: 'saaras:v3',
      ttsModel: 'bulbul:v3',
      voiceId: 'priya',
    },
    language: {
      primary: 'en-IN',
      supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'],
      autoDetectEnabled: true,
      languageSwitchingEnabled: true,
    },
    runtime: {
      modelProvider: 'sarvam',
      llmModel: 'sarvam-105b-conversations',
    },
    knowledge: { enabled: false },
    tools: { enabled: false, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
  };

  describe('1. Auto-detect enabled & disabled configuration', () => {
    it('1. configures Sarvam STT with "unknown" when autoDetectEnabled is true', () => {
      const manager = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'],
        autoDetectEnabled: true,
      });

      expect(manager.getSttInitialLanguage()).toBe('unknown');

      const stt = new sarvam.STT({
        model: 'saaras:v3',
        languageCode: manager.getSttInitialLanguage() as any,
      });
      expect((stt as any).opts.languageCode).toBe('unknown');
    });

    it('2. configures Sarvam STT with configured primary language when autoDetectEnabled is false', () => {
      const manager = new ConversationLanguageManager({
        primary: 'hi-IN',
        supportedLanguages: ['hi-IN', 'en-IN'],
        autoDetectEnabled: false,
      });

      expect(manager.getSttInitialLanguage()).toBe('hi-IN');

      const stt = new sarvam.STT({
        model: 'saaras:v3',
        languageCode: manager.getSttInitialLanguage() as any,
      });
      expect((stt as any).opts.languageCode).toBe('hi-IN');
    });
  });

  describe('2. Language Switching enabled & disabled behavior', () => {
    it('3. switches language automatically when languageSwitchingEnabled is true and autoDetect is true', () => {
      const manager = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'],
        autoDetectEnabled: true,
        languageSwitchingEnabled: true,
      });

      expect(manager.currentLanguage).toBe('en-IN');

      // User speaks Hindi in turn 1
      const result = manager.processUserTurn('मुझे डॉक्टर से मिलना है', 'hi-IN');
      expect(result.switched).toBe(true);
      expect(result.previousLanguage).toBe('en-IN');
      expect(result.currentLanguage).toBe('hi-IN');
      expect(result.reason).toBe('auto_detect');
      expect(manager.currentLanguage).toBe('hi-IN');
    });

    it('4. does NOT switch automatically when languageSwitchingEnabled is false', () => {
      const manager = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'],
        autoDetectEnabled: true,
        languageSwitchingEnabled: false,
      });

      const result = manager.processUserTurn('मुझे डॉक्टर से मिलना है', 'hi-IN');
      expect(result.switched).toBe(false);
      expect(result.currentLanguage).toBe('en-IN');
      expect(manager.currentLanguage).toBe('en-IN');
    });

    it('does NOT switch automatically when autoDetectEnabled is false', () => {
      const manager = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'],
        autoDetectEnabled: false,
        languageSwitchingEnabled: true,
      });

      const result = manager.processUserTurn('मला डॉक्टरांना भेटायचे आहे', 'mr-IN');
      expect(result.switched).toBe(false);
      expect(result.currentLanguage).toBe('en-IN');
      expect(manager.currentLanguage).toBe('en-IN');
    });
  });

  describe('3. Core Multilingual Switching: English, Hindi, Marathi', () => {
    it('5. switches to English when detected or explicitly requested', () => {
      const manager = new ConversationLanguageManager({
        primary: 'hi-IN',
        supportedLanguages: ['hi-IN', 'en-IN', 'mr-IN'],
      });

      // Explicit English request
      const explicitResult = manager.processUserTurn('Can you speak in English please?', 'hi-IN');
      expect(explicitResult.switched).toBe(true);
      expect(explicitResult.currentLanguage).toBe('en-IN');
      expect(explicitResult.reason).toBe('explicit');

      // Auto-detect English
      const manager2 = new ConversationLanguageManager({
        primary: 'hi-IN',
        supportedLanguages: ['hi-IN', 'en-IN'],
      });
      const autoResult = manager2.processUserTurn('I need an appointment tomorrow morning', 'en-IN');
      expect(autoResult.switched).toBe(true);
      expect(autoResult.currentLanguage).toBe('en-IN');
      expect(autoResult.reason).toBe('auto_detect');
    });

    it('6. switches to Hindi when detected or explicitly requested', () => {
      const manager = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'],
      });

      // Explicit Hindi request
      const explicitResult = manager.processUserTurn('हिंदी में बात करो', 'en-IN');
      expect(explicitResult.switched).toBe(true);
      expect(explicitResult.currentLanguage).toBe('hi-IN');
      expect(explicitResult.reason).toBe('explicit');

      // Auto-detect Hindi
      const manager2 = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'hi-IN'],
      });
      const autoResult = manager2.processUserTurn('नमस्ते, मुझे अपॉइंटमेंट चाहिए', 'hi-IN');
      expect(autoResult.switched).toBe(true);
      expect(autoResult.currentLanguage).toBe('hi-IN');
      expect(autoResult.reason).toBe('auto_detect');
    });

    it('7. switches to Marathi when detected or explicitly requested', () => {
      const manager = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'],
      });

      // Explicit Marathi request
      const explicitResult = manager.processUserTurn('मराठीत बोला', 'en-IN');
      expect(explicitResult.switched).toBe(true);
      expect(explicitResult.currentLanguage).toBe('mr-IN');
      expect(explicitResult.reason).toBe('explicit');

      // Auto-detect Marathi
      const manager2 = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'mr-IN'],
      });
      const autoResult = manager2.processUserTurn('काय वेळ उपलब्ध आहे?', 'mr-IN');
      expect(autoResult.switched).toBe(true);
      expect(autoResult.currentLanguage).toBe('mr-IN');
      expect(autoResult.reason).toBe('auto_detect');
    });
  });

  describe('4. Safety and Whitelist Enforcement', () => {
    it('8. does NOT switch when user requests an unsupported language', () => {
      const manager = new ConversationLanguageManager({
        primary: 'hi-IN',
        supportedLanguages: ['hi-IN', 'en-IN'], // Marathi is NOT supported
      });

      // Explicit request for unsupported Marathi
      const result = manager.processUserTurn('मराठीत बोला', 'mr-IN');
      expect(result.switched).toBe(false);
      expect(result.currentLanguage).toBe('hi-IN');
      expect(manager.currentLanguage).toBe('hi-IN');

      // Detected unsupported Tamil
      const result2 = manager.processUserTurn('வணக்கம்', 'ta-IN');
      expect(result2.switched).toBe(false);
      expect(result2.currentLanguage).toBe('hi-IN');
    });

    it('9. prioritizes explicit language request over automatic detection tag', () => {
      const manager = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'],
      });

      // STT mistakenly tagged the audio chunk as hi-IN, but the user explicitly said "मराठीत बोला"
      const result = manager.processUserTurn('मराठीत बोला', 'hi-IN');
      expect(result.switched).toBe(true);
      expect(result.currentLanguage).toBe('mr-IN');
      expect(result.reason).toBe('explicit');
    });
  });

  describe('5. Language State Persistence & Turn Flow', () => {
    it('10. persists current language across subsequent turns until explicitly or automatically changed', () => {
      const manager = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'hi-IN', 'mr-IN'],
      });

      // Turn 1: Switch to Marathi
      const turn1 = manager.processUserTurn('मराठीत बोला', 'mr-IN');
      expect(turn1.switched).toBe(true);
      expect(turn1.currentLanguage).toBe('mr-IN');

      // Turn 2: Follow-up question in Marathi (detected mr-IN)
      const turn2 = manager.processUserTurn('दंतचिकित्सक कधी उपलब्ध असतील?', 'mr-IN');
      expect(turn2.switched).toBe(false); // Stays Marathi, no redundant switch event
      expect(turn2.currentLanguage).toBe('mr-IN');
      expect(manager.currentLanguage).toBe('mr-IN');

      // Turn 3: User speaks Hindi (detected hi-IN)
      const turn3 = manager.processUserTurn('कल का समय क्या रहेगा?', 'hi-IN');
      expect(turn3.switched).toBe(true);
      expect(turn3.currentLanguage).toBe('hi-IN');
      expect(manager.currentLanguage).toBe('hi-IN');

      // Turn 4: Follow-up in Hindi
      const turn4 = manager.processUserTurn('ठीक है, मुझे 10 बजे का स्लॉट दे दो', 'hi-IN');
      expect(turn4.switched).toBe(false);
      expect(turn4.currentLanguage).toBe('hi-IN');
      expect(manager.currentLanguage).toBe('hi-IN');
    });

    it('11. retains RuntimeConfig as the single source of supported languages and primary language', () => {
      const configWithCustomLanguages: RuntimeAgentConfig = {
        ...baseConfig,
        language: {
          primary: 'gu-IN',
          supportedLanguages: ['gu-IN', 'en-IN'],
          autoDetectEnabled: true,
          languageSwitchingEnabled: true,
        },
      };

      const manager = new ConversationLanguageManager(configWithCustomLanguages.language);
      expect(manager.primaryLanguage).toBe('gu-IN');
      expect(manager.supportedLanguages).toEqual(['gu-IN', 'en-IN']);
      expect(manager.currentLanguage).toBe('gu-IN');

      // Hindi is NOT in supportedLanguages, so Hindi request is rejected
      const hiResult = manager.processUserTurn('हिंदी में बात करो', 'hi-IN');
      expect(hiResult.switched).toBe(false);
      expect(hiResult.currentLanguage).toBe('gu-IN');

      // English IS in supportedLanguages, so English request is accepted
      const enResult = manager.processUserTurn('Talk to me in English', 'en-IN');
      expect(enResult.switched).toBe(true);
      expect(enResult.currentLanguage).toBe('en-IN');
    });
  });

  describe('6. TTS & LLM Dynamic Switching Integration', () => {
    it('12. updates Sarvam TTS targetLanguageCode on language switch', () => {
      const manager = new ConversationLanguageManager(baseConfig.language);
      const tts = new sarvam.TTS({
        model: 'bulbul:v3',
        targetLanguageCode: manager.getTtsCurrentLanguage() as any,
        speaker: 'priya',
      });

      const updateSpy = vi.spyOn(tts, 'updateOptions');

      // Switch to Hindi
      const turn = manager.processUserTurn('हिंदी में बात करो', 'hi-IN');
      expect(turn.switched).toBe(true);

      tts.updateOptions({ targetLanguageCode: turn.currentLanguage as any });
      expect(updateSpy).toHaveBeenCalledWith({ targetLanguageCode: 'hi-IN' });

      // Switch to Marathi
      const turn2 = manager.processUserTurn('मराठीत बोला', 'mr-IN');
      expect(turn2.switched).toBe(true);

      tts.updateOptions({ targetLanguageCode: turn2.currentLanguage as any });
      expect(updateSpy).toHaveBeenCalledWith({ targetLanguageCode: 'mr-IN' });
    });

    it('13. does NOT use hardcoded hi-IN as universal runtime language', () => {
      const englishManager = new ConversationLanguageManager({
        primary: 'en-IN',
        supportedLanguages: ['en-IN', 'mr-IN'],
        autoDetectEnabled: false,
      });
      expect(englishManager.getSttInitialLanguage()).toBe('en-IN');
      expect(englishManager.currentLanguage).toBe('en-IN');

      const marathiManager = new ConversationLanguageManager({
        primary: 'mr-IN',
        supportedLanguages: ['mr-IN', 'en-IN'],
        autoDetectEnabled: false,
      });
      expect(marathiManager.getSttInitialLanguage()).toBe('mr-IN');
      expect(marathiManager.currentLanguage).toBe('mr-IN');
    });

    it('14. preserves Sarvam LLM routing and updates instructions with active language context', () => {
      const manager = new ConversationLanguageManager(baseConfig.language);
      const agent = createAgent(baseConfig, manager);

      expect((agent.llm as any)?.opts?.model).toBe('sarvam-105b-conversations');
      expect(agent.instructions).toContain(baseConfig.prompt.compiledSystemPrompt);
      expect(agent.instructions).toContain('Active Conversation Language');
      expect(agent.instructions).toContain('English (en-IN)');

      // Update instructions for Hindi
      const hindiInstructions = buildFullInstructions(
        baseConfig.prompt.compiledSystemPrompt,
        'hi-IN',
      );
      expect(hindiInstructions).toContain('Hindi (hi-IN)');
      expect(hindiInstructions).toContain('Respond in Hindi');
      expect(hindiInstructions).not.toContain('English (en-IN)');

      // Update instructions for Marathi
      const marathiInstructions = buildFullInstructions(
        baseConfig.prompt.compiledSystemPrompt,
        'mr-IN',
      );
      expect(marathiInstructions).toContain('Marathi (mr-IN)');
      expect(marathiInstructions).toContain('Respond in Marathi');
    });
  });

  describe('7. Explicit Phrase Recognition Variations', () => {
    it('recognizes multiple natural explicit requests in English, Hindi, and Marathi', () => {
      expect(detectExplicitLanguageRequest('Can you please talk in English?')).toBe('en-IN');
      expect(detectExplicitLanguageRequest('Switch to English')).toBe('en-IN');
      expect(detectExplicitLanguageRequest('Let\'s continue in English')).toBe('en-IN');
      expect(detectExplicitLanguageRequest('English please')).toBe('en-IN');
      expect(detectExplicitLanguageRequest('Talk to me in English')).toBe('en-IN');

      expect(detectExplicitLanguageRequest('हिंदी में बात करो')).toBe('hi-IN');
      expect(detectExplicitLanguageRequest('कृपया हिंदी में बोलो')).toBe('hi-IN');
      expect(detectExplicitLanguageRequest('क्या आप हिंदी में बात कर सकते हैं?')).toBe('hi-IN');
      expect(detectExplicitLanguageRequest('hindi me baat karo')).toBe('hi-IN');
      expect(detectExplicitLanguageRequest('switch to hindi')).toBe('hi-IN');

      expect(detectExplicitLanguageRequest('मराठीत बोला')).toBe('mr-IN');
      expect(detectExplicitLanguageRequest('तुम्ही मराठीत बोलू शकता का?')).toBe('mr-IN');
      expect(detectExplicitLanguageRequest('मराठी मध्ये बोला')).toBe('mr-IN');
      expect(detectExplicitLanguageRequest('marathit bola')).toBe('mr-IN');
      expect(detectExplicitLanguageRequest('switch to marathi')).toBe('mr-IN');
    });

    it('returns null for non-explicit conversational speech', () => {
      expect(detectExplicitLanguageRequest('What are the doctor clinic timings?')).toBeNull();
      expect(detectExplicitLanguageRequest('मुझे दांत में दर्द हो रहा है')).toBeNull();
      expect(detectExplicitLanguageRequest('मला दातदुखीचा त्रास होत आहे')).toBeNull();
    });
  });
});
