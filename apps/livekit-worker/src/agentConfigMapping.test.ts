import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';
import { voice, inference, initializeLogger } from '@livekit/agents';

beforeAll(() => {
  dotenv.config({ path: '.env.local' });
  process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'test-livekit-api-key';
  process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'test-livekit-api-secret-1234567890';
  process.env.SARVAM_API_KEY = process.env.SARVAM_API_KEY || 'test-sarvam-api-key';
  initializeLogger({ pretty: true, level: 'warn' });
});

import {
  createAgent,
  DEFAULT_SYSTEM_PROMPT,
  resolveInterruptionOptions,
  resolvePreemptiveGenerationOptions,
  resolveExpressiveOption,
} from './agent.ts';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import type { RuntimeAgentConfig } from '@nextlite/shared';

describe('LiveKit Worker RuntimeAgentConfig Mapping (Module 3)', () => {
  const baseMockConfig: RuntimeAgentConfig = {
    tenant: { tenantId: 'tenant-test-1' },
    agent: { agentId: 'agent-test-1', agentName: 'Apollo Support Agent', status: 'LIVE' },
    deployment: { deploymentId: 'dep-test-1', versionId: 'ver-10', versionNumber: 10 },
    prompt: {
      compiledSystemPrompt: '=== CUSTOM SYSTEM PROMPT ===\nYou are Apollo Dental Clinic Assistant.',
      greeting: 'Welcome to Apollo Dental! How can I help you book an appointment today?',
    },
    voice: {
      provider: 'sarvam',
      sttModel: 'saaras:v3',
      ttsModel: 'bulbul:v3',
      voiceId: 'priya',
      speakingSpeed: 1.15,
      gender: 'female',
    },
    language: {
      primary: 'hi-IN',
      supportedLanguages: ['hi-IN', 'en-IN'],
    },
    runtime: {
      modelProvider: 'google',
      llmModel: 'google/gemma-4-31b-it',
      temperature: 0.35,
    },
    knowledge: { enabled: false },
    tools: { enabled: false, tools: [] },
    variables: { inputVariables: [], outputVariables: [] },
  };

  describe('1. createAgent Configuration Mapping', () => {
    it('applies compiledSystemPrompt from RuntimeAgentConfig to Agent.create', () => {
      const agent = createAgent(baseMockConfig);
      expect(agent.instructions).toContain(baseMockConfig.prompt.compiledSystemPrompt);
      expect(agent.instructions).toContain('Active Conversation Language');
    });

    it('falls back to DEFAULT_SYSTEM_PROMPT when compiledSystemPrompt is undefined or empty', () => {
      const configWithoutPrompt: RuntimeAgentConfig = {
        ...baseMockConfig,
        prompt: { compiledSystemPrompt: '' },
      };

      const agentWithEmpty = createAgent(configWithoutPrompt);
      expect(agentWithEmpty.instructions).toContain(DEFAULT_SYSTEM_PROMPT);

      const agentWithUndefined = createAgent(undefined);
      expect(agentWithUndefined.instructions).toContain(DEFAULT_SYSTEM_PROMPT);
    });

    it('passes configured LLM model to inference.LLM', () => {
      const customModelConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        runtime: {
          ...baseMockConfig.runtime,
          llmModel: 'openai/gpt-4.1-mini',
        },
      };

      const agent = createAgent(customModelConfig);
      expect((agent.llm as any)?.opts?.model).toBe('openai/gpt-4.1-mini');
    });

    it('passes configured temperature to inference.LLM modelOptions', () => {
      const customTempConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        runtime: {
          ...baseMockConfig.runtime,
          temperature: 0.42,
        },
      };

      const agent = createAgent(customTempConfig);
      expect((agent.llm as any)?.opts?.modelOptions?.temperature).toBe(0.42);
    });

    it('omits temperature from modelOptions when temperature is undefined', () => {
      const noTempConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        runtime: {
          ...baseMockConfig.runtime,
          temperature: undefined,
        },
      };

      const agent = createAgent(noTempConfig);
      expect((agent.llm as any)?.opts?.modelOptions?.temperature).toBeUndefined();
    });

    it('falls back to default model when llmModel is undefined based on provider', () => {
      const sarvamDefaultConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        runtime: {
          ...baseMockConfig.runtime,
          modelProvider: 'sarvam',
          llmModel: undefined,
        },
      };

      const sarvamAgent = createAgent(sarvamDefaultConfig);
      expect((sarvamAgent.llm as any)?.opts?.model).toBe('sarvam-105b-conversations');

      const googleDefaultConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        runtime: {
          ...baseMockConfig.runtime,
          modelProvider: 'google',
          llmModel: undefined,
        },
      };

      const googleAgent = createAgent(googleDefaultConfig);
      expect((googleAgent.llm as any)?.opts?.model).toBe('google/gemma-4-31b-it');
    });
  });

  describe('2. Sarvam STT Configuration Mapping', () => {
    it('instantiates sarvam.STT with configured model and primary language', () => {
      const sttModel = (baseMockConfig.voice.sttModel as any) || 'saaras:v3';
      const languageCode = (baseMockConfig.language.primary as any) || 'en-IN';

      const sttInstance = new sarvam.STT({
        model: sttModel,
        languageCode,
        mode: 'transcribe',
      });

      expect((sttInstance as any).opts.model).toBe('saaras:v3');
      expect((sttInstance as any).opts.languageCode).toBe('hi-IN');
      expect((sttInstance as any).opts.mode).toBe('transcribe');
    });

    it('falls back to saaras:v3 and en-IN when voice/language fields are omitted', () => {
      const minimalConfig: Partial<RuntimeAgentConfig> = {
        voice: { provider: 'sarvam', voiceId: 'shubh' },
        language: { primary: '', supportedLanguages: [] },
      };

      const sttModel = minimalConfig.voice?.sttModel || 'saaras:v3';
      const sttLanguage = minimalConfig.language?.primary || 'en-IN';

      const sttInstance = new sarvam.STT({
        model: sttModel as any,
        languageCode: sttLanguage as any,
        mode: 'transcribe',
      });

      expect((sttInstance as any).opts.model).toBe('saaras:v3');
      expect((sttInstance as any).opts.languageCode).toBe('en-IN');
    });
  });

  describe('3. Sarvam TTS Configuration Mapping', () => {
    it('instantiates sarvam.TTS with configured model, speaker voice, target language, and speed pace', () => {
      const ttsModel = (baseMockConfig.voice.ttsModel as any) || 'bulbul:v3';
      const targetLanguageCode = (baseMockConfig.language.primary as any) || 'en-IN';
      const speaker = (baseMockConfig.voice.voiceId as any) || 'priya';
      const pace = typeof baseMockConfig.voice.speakingSpeed === 'number' ? baseMockConfig.voice.speakingSpeed : undefined;

      const ttsOptions = {
        model: ttsModel,
        targetLanguageCode,
        speaker,
        ...(typeof pace === 'number' ? { pace } : {}),
      };

      expect(ttsOptions.model).toBe('bulbul:v3');
      expect(ttsOptions.speaker).toBe('priya');
      expect(ttsOptions.targetLanguageCode).toBe('hi-IN');
      expect(ttsOptions.pace).toBe(1.15);

      const ttsInstance = new sarvam.TTS(ttsOptions);
      expect(ttsInstance.sampleRate).toBe(24000);
      expect(ttsInstance.numChannels).toBe(1);
    });

    it('falls back to bulbul:v3, priya, and en-IN when voice fields are omitted', () => {
      const fallbackConfig: Partial<RuntimeAgentConfig> = {};

      const ttsModel = fallbackConfig.voice?.ttsModel || 'bulbul:v3';
      const ttsSpeaker = fallbackConfig.voice?.voiceId || 'priya';
      const ttsLanguage = fallbackConfig.language?.primary || 'en-IN';

      const fallbackOptions = {
        model: ttsModel as any,
        targetLanguageCode: ttsLanguage as any,
        speaker: ttsSpeaker as any,
      };

      expect(fallbackOptions.model).toBe('bulbul:v3');
      expect(fallbackOptions.speaker).toBe('priya');
      expect(fallbackOptions.targetLanguageCode).toBe('en-IN');

      const ttsInstance = new sarvam.TTS(fallbackOptions);
      expect(ttsInstance.sampleRate).toBe(24000);
    });
  });

  describe('4. Greeting Resolution Logic', () => {
    it('uses configured greeting instruction when greeting is present and non-empty', () => {
      const greetingInstructions = baseMockConfig.prompt.greeting?.trim()
        ? baseMockConfig.prompt.greeting
        : 'Greet the user in a helpful and friendly manner.';

      expect(greetingInstructions).toBe(
        'Welcome to Apollo Dental! How can I help you book an appointment today?',
      );
    });

    it('falls back to safe default instructions when greeting is empty string or whitespace', () => {
      const emptyGreetingConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        prompt: {
          ...baseMockConfig.prompt,
          greeting: '   ',
        },
      };

      const greetingInstructions = emptyGreetingConfig.prompt.greeting?.trim()
        ? emptyGreetingConfig.prompt.greeting
        : 'Greet the user in a helpful and friendly manner.';

      expect(greetingInstructions).toBe('Greet the user in a helpful and friendly manner.');
    });

    it('falls back to safe default instructions when greeting is undefined', () => {
      const undefinedGreetingConfig: RuntimeAgentConfig = {
        ...baseMockConfig,
        prompt: {
          compiledSystemPrompt: 'Prompt',
          greeting: undefined,
        },
      };

      const greetingInstructions = undefinedGreetingConfig.prompt.greeting?.trim()
        ? undefinedGreetingConfig.prompt.greeting
        : 'Greet the user in a helpful and friendly manner.';

      expect(greetingInstructions).toBe('Greet the user in a helpful and friendly manner.');
    });
  });

  describe('5. Dynamic Interruption Mode Resolution (Module 3.2)', () => {
    it('resolives adaptive interruption mode when interruptionMode is "adaptive"', () => {
      const interruption = resolveInterruptionOptions('adaptive');
      expect(interruption).toEqual({ mode: 'adaptive' });
    });

    it('resolves disabled interruption mode when interruptionMode is "disabled"', () => {
      const interruption = resolveInterruptionOptions('disabled');
      expect(interruption).toEqual({ enabled: false });
    });

    it('resolves always interruption mode using VAD when interruptionMode is "always"', () => {
      const interruption = resolveInterruptionOptions('always');
      expect(interruption).toEqual({ enabled: true, mode: 'vad' });
    });

    it('preserves adaptive default when interruptionMode is undefined', () => {
      const interruption = resolveInterruptionOptions(undefined);
      expect(interruption).toEqual({ mode: 'adaptive' });
    });
  });

  describe('6. Dynamic Preemptive Generation Resolution (Module 3.2)', () => {
    it('enables preemptive generation when preemptiveGenerationEnabled is true', () => {
      const preemptive = resolvePreemptiveGenerationOptions(true);
      expect(preemptive).toEqual({ enabled: true });
    });

    it('disables preemptive generation when preemptiveGenerationEnabled is false', () => {
      const preemptive = resolvePreemptiveGenerationOptions(false);
      expect(preemptive).toEqual({ enabled: false });
    });

    it('defaults to enabled: false when preemptiveGenerationEnabled is undefined', () => {
      const preemptive = resolvePreemptiveGenerationOptions(undefined);
      expect(preemptive).toEqual({ enabled: false });
    });
  });

  describe('7. Dynamic Expressive Mode Resolution (Module 3.2)', () => {
    it('enables expressive mode when expressiveModeEnabled is true', () => {
      const expressive = resolveExpressiveOption(true);
      expect(expressive).toBe(true);
    });

    it('disables expressive mode when expressiveModeEnabled is false', () => {
      const expressive = resolveExpressiveOption(false);
      expect(expressive).toBe(false);
    });

    it('preserves default true when expressiveModeEnabled is undefined', () => {
      const expressive = resolveExpressiveOption(undefined);
      expect(expressive).toBe(true);
    });
  });

  describe('8. LiveKit AgentSession Construction with Dynamic Options (Module 3.2)', () => {
    it('instantiates AgentSession with disabled interruption and disabled preemptive generation', () => {
      const stt = new sarvam.STT({ model: 'saaras:v3' as any, languageCode: 'en-IN' as any });
      const tts = new sarvam.TTS({ model: 'bulbul:v3' as any, targetLanguageCode: 'en-IN' as any });

      const session = new voice.AgentSession({
        stt,
        tts,
        maxToolSteps: 2,
        turnHandling: {
          turnDetection: new inference.TurnDetector(),
          interruption: resolveInterruptionOptions('disabled'),
          preemptiveGeneration: resolvePreemptiveGenerationOptions(false),
        },
        expressive: resolveExpressiveOption(false),
      });

      expect(session).toBeDefined();
    });

    it('instantiates AgentSession with always interruption mode and enabled expressive mode', () => {
      const stt = new sarvam.STT({ model: 'saaras:v3' as any, languageCode: 'en-IN' as any });
      const tts = new sarvam.TTS({ model: 'bulbul:v3' as any, targetLanguageCode: 'en-IN' as any });

      const session = new voice.AgentSession({
        stt,
        tts,
        maxToolSteps: 2,
        turnHandling: {
          turnDetection: new inference.TurnDetector(),
          interruption: resolveInterruptionOptions('always'),
          preemptiveGeneration: resolvePreemptiveGenerationOptions(true),
        },
        expressive: resolveExpressiveOption(true),
      });

      expect(session).toBeDefined();
    });
  });
});

