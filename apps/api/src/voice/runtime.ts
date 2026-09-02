import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  IVoiceRuntime,
  VoiceSessionConfig,
  VoiceUserMessage,
  VoiceAgentMessage,
  VoiceTransport,
  STTAdapter,
  TTSAdapter,
  STTConfig,
  TTSConfig,
  AudioFormat,
} from './types.js';
import { VoiceSession } from './session.js';
import type { LLMMessage, LLMService } from '../services/llm.js';
import type { KnowledgeService } from '../services/knowledge.js';
import type { AgentConfiguration } from '../services/template.js';
import { createChildLogger } from '../lib/logger.js';
import { liveTranscriptStore } from './transcriptStore.js';
import { db } from '../db/index.js';
import { agents, agentVersions } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { promptCompiler } from '../services/promptCompiler.js';

const logger = createChildLogger({ module: 'voice-runtime' });

/** Maximum character length for agent voice responses */
const MAX_VOICE_RESPONSE_CHARS = 150;
/** Minimum characters for a transcript to be considered meaningful */
const MIN_TRANSCRIPT_CHARS = 2;

/** Map BCP-47 language codes to human-readable names */
function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    'hi-IN': 'Hindi',
    'en-IN': 'English',
    'bn-IN': 'Bengali',
    'ta-IN': 'Tamil',
    'te-IN': 'Telugu',
    'mr-IN': 'Marathi',
    'gu-IN': 'Gujarati',
    'kn-IN': 'Kannada',
    'ml-IN': 'Malayalam',
    'pa-IN': 'Punjabi',
    'od-IN': 'Odia',
    'as-IN': 'Assamese',
  };
  return languages[code] ?? code;
}

export interface VoiceRuntimeConfig {
  /** Factory to create STT adapter for a session */
  createSTT?: () => STTAdapter;
  /** Factory to create TTS adapter for a session */
  createTTS?: () => TTSAdapter;
  /** Default STT config */
  defaultSTTConfig?: Partial<STTConfig>;
  /** Default TTS config */
  defaultTTSConfig?: Partial<TTSConfig>;
}

/** Per-session pipeline state for turn-taking enforcement */
interface SessionPipelineState {
  /** True while LLM + TTS is processing a user turn */
  processing: boolean;
  /** Last final transcript processed — used for duplicate detection */
  lastFinalTranscript: string;
  /** Timestamp of last final transcript — for duplicate window */
  lastFinalTimestamp: number;
  /** Counter for turn ID generation */
  turnCounter: number;
  /** Text of last agent response for echo suppression */
  lastAgentText: string;
  /** Timestamp until which agent is estimated to be speaking */
  speakingUntilTimestamp: number;
  /** AbortController for active turn processing cancellation on barge-in */
  abortController?: AbortController | null;
}

export class VoiceRuntime extends EventEmitter implements IVoiceRuntime {
  private sessions = new Map<string, VoiceSession>();
  private pipelineState = new Map<string, SessionPipelineState>();
  private llm: LLMService;
  private knowledge: KnowledgeService;
  private runtimeConfig: VoiceRuntimeConfig;

  constructor(llm: LLMService, knowledge: KnowledgeService, config?: VoiceRuntimeConfig) {
    super();
    this.llm = llm;
    this.knowledge = knowledge;
    this.runtimeConfig = config ?? {};
  }

  async startSession(config: VoiceSessionConfig): Promise<VoiceSession> {
    const session = new VoiceSession(config);

    // Load agent configuration
    const agentConfig = await this.loadAgentConfig(config.tenantId, config.agentId);
    if (!agentConfig) {
      throw new Error(`Agent ${config.agentId} not found or has no configuration`);
    }

    // Store agent config on the session for later use
    (session as any)._agentConfig = agentConfig;

    this.sessions.set(config.sessionId, session);

    // Initialize pipeline state for turn-taking enforcement
    this.pipelineState.set(config.sessionId, {
      processing: false,
      lastFinalTranscript: '',
      lastFinalTimestamp: 0,
      turnCounter: 0,
      lastAgentText: '',
      speakingUntilTimestamp: 0,
    });

    // Wire up session events
    session.on('timeout', (type: string) => {
      logger.warn({ sessionId: config.sessionId, type }, 'Session timeout');
      this.emit('session_timeout', { sessionId: config.sessionId, type });
    });

    session.on('end', (info: { reason: string; duration: number }) => {
      logger.info({ sessionId: config.sessionId, ...info }, 'Session ended');
      this.sessions.delete(config.sessionId);
      this.pipelineState.delete(config.sessionId);
      this.emit('session_ended', { sessionId: config.sessionId, ...info });
    });

    this.emit('session_started', { sessionId: config.sessionId, tenantId: config.tenantId, agentId: config.agentId });
    return session;
  }

  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.end('api_call');
    }
  }

  /**
   * Wire up STT/TTS to a session and transport.
   * Direct pipeline: Transport audio -> STT -> quality filter -> processTurn (LLM->TTS) -> Transport audio
   *
   * HARD TURN-TAKING & ECHO PROTECTION:
   * - Single turn execution with explicit turnId (turn-001, turn-002...)
   * - No pendingMessage queue: unprompted STT finals during processing are dropped
   * - Echo suppression: STT transcripts echoing recent agent responses are rejected
   * - Clean barge-in: User speech while agent is playing stops playback
   */
  async wireVoicePipeline(
    session: VoiceSession,
    transport: VoiceTransport,
    sttConfig?: Partial<STTConfig>,
    ttsConfig?: Partial<TTSConfig>,
  ): Promise<{ stt: STTAdapter; tts: TTSAdapter }> {
    // Create adapters
    const stt = this.runtimeConfig.createSTT?.();
    const tts = this.runtimeConfig.createTTS?.();

    if (!stt || !tts) {
      throw new Error('STT/TTS factories not configured in VoiceRuntime');
    }

    // Build STT config from session config + defaults
    const fullSTTConfig: STTConfig = {
      languageCode: 'hi-IN',
      sampleRate: session.inputFormat.sampleRate as 8000 | 16000,
      encoding: 'linear16',
      endpointing: 'vad',
      threshold: 0.5,
      silenceDurationMs: 600,
      minSpeechDurationMs: 250,
      ...this.runtimeConfig.defaultSTTConfig,
      ...sttConfig,
    };

    // Build TTS config from session config + defaults
    const fullTTSConfig: TTSConfig = {
      languageCode: 'hi-IN',
      sampleRate: session.outputFormat.sampleRate as 8000 | 16000 | 24000,
      encoding: session.outputFormat.codec === 'mulaw' ? 'mulaw' : 'linear16',
      ...this.runtimeConfig.defaultTTSConfig,
      ...ttsConfig,
    };

    try {
      // Connect STT
      await stt.connect(fullSTTConfig);
      logger.info({ sessionId: session.id }, 'STT connected');

      // Connect TTS
      await tts.connect(fullTTSConfig);
      logger.info({ sessionId: session.id }, 'TTS connected');

      // Wire STT -> Runtime -> TTS pipeline with turn-taking guards
      stt.onFinalTranscript(async (text: string, _language?: string) => {
        const state = this.pipelineState.get(session.id);
        if (!state) {
          logger.error({ sessionId: session.id }, 'No pipeline state for session');
          return;
        }

        const now = Date.now();
        const trimmedText = text.trim();

        logger.info({
          eventType: 'STT FINAL',
          sessionId: session.id,
          text: trimmedText,
          isProcessing: state.processing,
          speakingUntil: state.speakingUntilTimestamp,
          timestamp: now,
        }, `STT FINAL RECEIVED: "${trimmedText}"`);

        // GUARD 1: Filter empty/noise/whitespace/punctuation-only transcripts
        if (!this.isValidTranscript(trimmedText)) {
          logger.info({ eventType: 'STT FILTERED', sessionId: session.id, text: trimmedText, reason: 'invalid_transcript' }, 'Rejected invalid transcript');
          return;
        }

        // GUARD 2: Echo Suppression — reject if transcript echoes recent agent output
        if (
          state.lastAgentText &&
          (state.lastAgentText.includes(trimmedText) || trimmedText.includes(state.lastAgentText))
        ) {
          logger.info({ eventType: 'ECHO SUPPRESSED', sessionId: session.id, text: trimmedText, agentText: state.lastAgentText }, 'Rejected echo of agent text');
          return;
        }

        // GUARD 3: Duplicate detection — reject if same transcript within 2 seconds
        if (
          trimmedText === state.lastFinalTranscript &&
          now - state.lastFinalTimestamp < 2000
        ) {
          logger.info({ eventType: 'DUPLICATE SUPPRESSED', sessionId: session.id, text: trimmedText }, 'Rejected duplicate final transcript');
          return;
        }

        // Update duplicate tracking
        state.lastFinalTranscript = trimmedText;
        state.lastFinalTimestamp = now;

        // GUARD 4: Concurrency & Barge-in Handling (Reset active turn on user speech)
        if (state.processing || (state.speakingUntilTimestamp > 0 && now < state.speakingUntilTimestamp)) {
          logger.info({ eventType: 'BARGE_IN', sessionId: session.id, text: trimmedText }, 'Caller interrupted agent — triggering barge-in reset');

          if (state.abortController) {
            state.abortController.abort();
            state.abortController = null;
          }

          transport.stopPlayback().catch(() => {});
          if (typeof (transport as any).clearAudio === 'function') {
            try { (transport as any).clearAudio(); } catch {}
          }

          state.processing = false;
          state.speakingUntilTimestamp = 0;
          session.setState('listening');
        }

        // Generate Turn ID
        state.turnCounter++;
        const turnId = `turn-${String(state.turnCounter).padStart(3, '0')}`;

        const userMessage: VoiceUserMessage = {
          type: 'speech',
          transcript: trimmedText,
          isFinal: true,
          timestamp: now,
        };

        // Process this turn
        await this.processTurn(session, transport, tts, userMessage, turnId);
      });

      // Wire transport audio -> STT
      transport.onMessage(async (msg: VoiceUserMessage) => {
        if (msg.type === 'speech' && msg.audio) {
          await stt.sendAudio(msg.audio);
        }
      });

      // Clean up on transport close
      transport.onClose(async () => {
        logger.info({ sessionId: session.id }, 'Transport closed, cleaning up voice pipeline');
        this.pipelineState.delete(session.id);
        await stt.close();
        await tts.close();
      });

      return { stt, tts };
    } catch (error) {
      logger.error({ sessionId: session.id, error }, 'Failed to wire voice pipeline');
      await stt.close().catch(() => {});
      await tts.close().catch(() => {});
      throw error;
    }
  }

  /**
   * Process a single user turn through LLM → TTS → transport with Turn ID tracking.
   */
  private async processTurn(
    session: VoiceSession,
    transport: VoiceTransport,
    tts: TTSAdapter,
    userMessage: VoiceUserMessage,
    turnId: string = 'turn-001',
  ): Promise<void> {
    const state = this.pipelineState.get(session.id);
    if (!state) return;

    if (state.abortController) {
      state.abortController.abort();
    }
    state.abortController = new AbortController();
    const { signal } = state.abortController;

    state.processing = true;
    session.setState('processing');

    logger.info({
      eventType: 'RUNTIME TURN START',
      sessionId: session.id,
      turnId,
      userText: userMessage.transcript,
      timestamp: Date.now(),
    }, `RUNTIME TURN START [${turnId}]: "${userMessage.transcript}"`);

    try {
      let agentResponse: VoiceAgentMessage;
      const t2 = userMessage.timestamp || Date.now(); // T2: STT final received

      if (this.isGarbledTranscript(userMessage.transcript ?? '')) {
        logger.warn({ sessionId: session.id, turnId, text: userMessage.transcript }, 'Garbled transcript detected — requesting polite clarification');
        const clarificationText = 'माफ़ कीजिए, आपकी बात मुझे ठीक से समझ नहीं आई। आप कौन-सी सर्विस या सहायता चाहते हैं?';
        agentResponse = this.createAgentMessage(session, clarificationText, false);
      } else if (process.env.VOICE_DIAGNOSTIC_MODE === 'true') {
        logger.info({ eventType: 'LLM DIAGNOSTIC BYPASS', sessionId: session.id, turnId }, 'VOICE_DIAGNOSTIC_MODE enabled — returning TEST RESPONSE');
        agentResponse = this.createAgentMessage(session, 'TEST RESPONSE', false);
      } else {
        const t3 = Date.now(); // T3: LLM request sent
        logger.info({ eventType: 'LLM REQUEST', sessionId: session.id, turnId, userText: userMessage.transcript, timestamp: t3 }, `LLM REQUEST [${turnId}]`);
        agentResponse = await this.processUserMessage(session, userMessage);
        const t4 = Date.now(); // T4: LLM first response token
        logger.info({ eventType: 'LLM RESPONSE', sessionId: session.id, turnId, agentText: agentResponse.transcript, timestamp: t4, llmLatencyMs: t4 - t3 }, `LLM RESPONSE [${turnId}] (${t4 - t3}ms): "${agentResponse.transcript}"`);
      }

      if (signal.aborted) {
        logger.info({ sessionId: session.id, turnId }, 'Turn aborted after LLM step due to barge-in');
        return;
      }

      // Record turn in live transcript store and print console box
      liveTranscriptStore.addTurn(session.id, turnId, userMessage.transcript ?? '', agentResponse.transcript ?? '');

      state.lastAgentText = agentResponse.transcript ?? '';

      // Diagnostic Mode check: TTS Bypass
      if (process.env.VOICE_DISABLE_TTS === 'true') {
        logger.info({ eventType: 'TTS DISABLE BYPASS', sessionId: session.id, turnId }, 'VOICE_DISABLE_TTS enabled — skipping TTS output');
        return;
      }

      // Convert response to audio via TTS with clause-level streaming for sub-second latency
      let t5 = Date.now();
      let t6 = Date.now();
      let t7 = Date.now();

      if (agentResponse.transcript) {
        try {
          t5 = Date.now(); // T5: TTS request start
          logger.info({ eventType: 'TTS START', sessionId: session.id, turnId, text: agentResponse.transcript, timestamp: t5 }, `TTS START [${turnId}]`);

          // Synthesize complete response as one continuous, seamless audio stream (no sentence boundary network gaps)
          session.setState('speaking');

          let isFirstAudioSent = false;
          const fullAudioChunks: Buffer[] = [];

          for await (const chunk of tts.synthesizeStream(agentResponse.transcript)) {
            if (signal.aborted) {
              logger.info({ sessionId: session.id, turnId }, 'TTS streaming aborted due to barge-in');
              return;
            }
            if (!isFirstAudioSent) {
              t6 = Date.now(); // T6: First TTS audio chunk received
              t7 = Date.now(); // T7: First audio prepared
              isFirstAudioSent = true;
            }
            fullAudioChunks.push(chunk);
          }

          if (!isFirstAudioSent) {
            t6 = Date.now();
            t7 = Date.now();
          }

          agentResponse.audio = Buffer.concat(fullAudioChunks);
          const t8_tts = Date.now();
          logger.info({ eventType: 'TTS END', sessionId: session.id, turnId, audioBytes: agentResponse.audio.length, ttsFirstAudioMs: t6 - t5, ttsTotalMs: t8_tts - t5, timestamp: t8_tts }, `TTS END [${turnId}] (${agentResponse.audio.length} bytes, first-audio: ${t6 - t5}ms)`);

          // Estimate speaking duration (16000 bytes = 1s at 8kHz PCM16)
          const estimatedDurationMs = Math.round((agentResponse.audio.length / 16000) * 1000);
          state.speakingUntilTimestamp = Date.now() + estimatedDurationMs + 500;
        } catch (error) {
          logger.error({ sessionId: session.id, turnId, error }, 'TTS synthesis failed');
        }
      }

      if (signal.aborted) {
        logger.info({ sessionId: session.id, turnId }, 'Audio send aborted due to barge-in');
        return;
      }

      // Send unified response to transport
      await transport.send(agentResponse);

      const totalResponseLatencyMs = t7 - t2;
      logger.info({
        eventType: 'LATENCY REPORT',
        sessionId: session.id,
        turnId,
        metrics: {
          t2_sttFinal: t2,
          t5_ttsStart: t5,
          t6_ttsFirstAudio: t6,
          t7_transportSend: t7,
          totalResponseLatencyMs,
        },
      }, `⏱️ LATENCY REPORT [${turnId}]: Total ${totalResponseLatencyMs}ms (STT->Exotel Send: ${t7 - t2}ms | TTS first-audio: ${t6 - t5}ms)`);
    } catch (error) {
      if (signal.aborted) {
        logger.info({ sessionId: session.id, turnId }, 'Turn cancelled by barge-in');
        return;
      }
      logger.error({ sessionId: session.id, turnId, error }, 'Failed to process turn');
    } finally {
      if (state.abortController?.signal === signal) {
        state.abortController = null;
        state.processing = false;
        session.setState('listening');
        logger.info({ eventType: 'SESSION STATE CHANGE', sessionId: session.id, turnId, newState: 'listening', timestamp: Date.now() }, `SESSION STATE CHANGE [${turnId}]: LISTENING`);
      }
    }
  }

  /**
   * Validate that a transcript is meaningful enough to send to LLM.
   * Rejects empty, whitespace-only, punctuation-only, and noise artifacts while allowing short Hindi words.
   */
  private isValidTranscript(text: string): boolean {
    if (!text || text.length === 0) return false;
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;

    // Reject punctuation-only
    if (/^[^\w\u0900-\u097F\u0600-\u06FF\u00C0-\u024F]+$/.test(trimmed)) return false;

    // Check valid short Hindi words (like "हाँ", "जी", "नहीं")
    const validShortWords = ['हाँ', 'नहीं', 'जी', 'अरे', 'सुनो', 'नमस्ते', 'हेलो'];
    if (trimmed.length < MIN_TRANSCRIPT_CHARS && !validShortWords.includes(trimmed)) return false;

    return true;
  }

  /**
   * Detect garbled or low-confidence STT transcripts.
   */
  public isGarbledTranscript(text: string): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;

    const garbledPatterns = [
      /चूँना/i,
      /फुल से ठीक है तेरे को/i,
      /^[^\s]{16,}$/, // Single 16+ char string without spaces
    ];

    for (const pattern of garbledPatterns) {
      if (pattern.test(trimmed)) return true;
    }
    return false;
  }

  /**
   * Process a user message and generate an agent response.
   * This is the shared agent runtime — called by all transports.
   */
  async processUserMessage(
    session: VoiceSession,
    message: VoiceUserMessage,
  ): Promise<VoiceAgentMessage> {
    const agentConfig = (session as any)._agentConfig as AgentConfiguration;
    if (!agentConfig) {
      throw new Error('Agent configuration not loaded');
    }

    // Handle text input
    const userText = message.type === 'text' ? message.transcript : (message.transcript ?? '');

    if (!userText || !this.isValidTranscript(userText)) {
      return this.createAgentMessage(session, 'I didn\'t catch that. Could you please repeat?', false);
    }

    // Add user message to history
    session.addUserMessage(userText);

    // Selective RAG Retrieval — skip vector search for simple greetings/confirmations to save latency
    let knowledgeResults: { content: string; score: number; sourceId: string }[] = [];
    const isSimpleConversational = /^(नमस्ते|हेलो|जी|हाँ|नहीं|नमस्कार|हाय|hello|hi|ok|okay|bye)$/i.test(userText.trim());

    if (!isSimpleConversational) {
      try {
        knowledgeResults = await this.knowledge.retrieveRelevant(
          session.tenantId,
          session.agentId,
          userText,
          3,
        );
      } catch (error) {
        logger.warn({ sessionId: session.id }, 'Knowledge retrieval failed, continuing without RAG');
      }
    }

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(agentConfig, knowledgeResults);

    // Build LLM messages
    const llmMessages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...session.getLLMHistory().map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    try {
      let response = await this.llm.chat(llmMessages, { temperature: 0.7 });

      // Enforce response length for voice — truncate if too long
      response = this.truncateForVoice(response);

      // Hospital Action Safety: Prevent fake booking assertions without executed tool
      response = this.sanitizeHospitalBookingResponse(response, false);

      // Gender Grammar Alignment: Enforce consistent verb endings
      const configuredGender = agentConfig.voice?.gender;
      response = this.applyGenderGrammar(response, configuredGender);

      // Add assistant message to history
      session.addAssistantMessage(response);

      return this.createAgentMessage(session, response, false);
    } catch (error) {
      logger.error({ sessionId: session.id }, 'LLM call failed');
      const fallback = 'माफ़ कीजिए, सर्वर से संपर्क नहीं हो पा रहा है। कृपया कुछ देर बाद प्रयास करें।';
      session.addAssistantMessage(fallback);
      return this.createAgentMessage(session, fallback, false);
    }
  }

  /**
   * Hospital Safety Guard: Prevent fabricated booking assertions without tool execution,
   * while allowing the agent to naturally collect patient details (Name, Time, Specialty).
   */
  private sanitizeHospitalBookingResponse(response: string, hasExecutedBookingTool = false): string {
    if (hasExecutedBookingTool) return response;

    // Only filter assertions that claim final booking completion without tool execution
    const finalBookingAssertions = [
      /अपॉइंटमेंट (बुक|कन्फर्म) हो (गया|गई|चुका|चुकी) है/i,
      /(मैंने|आपकी|यह)?.*?(appointment|अपॉइंटमेंट)?.*?(बुक|कन्फर्म) कर (दी|दी है|ली|ली है)/i,
      /आपकी (slot|appointment|अपॉइंटमेंट) (confirm|कन्फर्म|booked) (हो गई|हो गया|है)/i,
      /appointment (is )?booked and confirmed/i,
    ];

    let sanitized = response;
    for (const pattern of finalBookingAssertions) {
      if (pattern.test(sanitized)) {
        logger.warn({ originalResponse: response }, 'HOSPITAL SAFETY GUARD: Filtered unconfirmed booking assertion');
        sanitized = 'जी, मैं आपके लिए appointment request note कर लेता हूँ। आप किस दिन और किस समय आना चाहेंगे?';
        break;
      }
    }
    return sanitized;
  }

  /**
   * Apply consistent masculine/feminine Hindi grammar based on configured voice gender.
   */
  private applyGenderGrammar(response: string, gender?: 'male' | 'female'): string {
    if (!gender) return response;

    if (gender === 'male') {
      return response
        .replace(/कर सकती हूँ/g, 'कर सकता हूँ')
        .replace(/कर देती हूँ/g, 'कर देता हूँ')
        .replace(/सुन रही हूँ/g, 'सुन रहा हूँ')
        .replace(/बोल रही हूँ/g, 'बोल रहा हूँ')
        .replace(/आ रही हूँ/g, 'आ रहा हूँ')
        .replace(/नोट कर लेती हूँ/g, 'नोट कर लेता हूँ');
    } else if (gender === 'female') {
      return response
        .replace(/कर सकता हूँ/g, 'कर सकती हूँ')
        .replace(/कर देता हूँ/g, 'कर देती हूँ')
        .replace(/सुन रहा हूँ/g, 'सुन रही हूँ')
        .replace(/बोल रहा हूँ/g, 'बोल रही हूँ')
        .replace(/आ रहा हूँ/g, 'आ रही हूँ')
        .replace(/नोट कर लेता हूँ/g, 'नोट कर लेती हूँ');
    }
    return response;
  }

  private createAgentMessage(
    session: VoiceSession,
    transcript: string,
    isPartial: boolean,
  ): VoiceAgentMessage {
    return {
      type: 'speech',
      transcript,
      isPartial,
      timestamp: Date.now(),
    };
  }

  /**
   * Truncate LLM response for voice output.
   * Enforces max length. If response has multiple sentences, keep only the first 1-2.
   */
  private truncateForVoice(text: string): string {
    if (text.length <= MAX_VOICE_RESPONSE_CHARS) return text;

    // Split on sentence boundaries (Hindi and English)
    const sentences = text.split(/(?<=[।.!?\n])\s+/);
    if (sentences.length <= 1) {
      // Single sentence — truncate at max length with ellipsis
      return text.substring(0, MAX_VOICE_RESPONSE_CHARS - 3) + '...';
    }

    // Multiple sentences — keep first 2 max, truncate if needed
    let result = sentences[0];
    if (sentences.length > 1 && result.length + sentences[1].length + 1 <= MAX_VOICE_RESPONSE_CHARS) {
      result += ' ' + sentences[1];
    }

    // If still too long, truncate
    if (result.length > MAX_VOICE_RESPONSE_CHARS) {
      result = result.substring(0, MAX_VOICE_RESPONSE_CHARS - 3) + '...';
    }

    return result;
  }

  private buildSystemPrompt(config: AgentConfiguration, knowledge: { content: string; score: number }[]): string {
    return promptCompiler.compileAgentPrompt({
      configuration: config,
      knowledgeResults: knowledge,
    });
  }

  private async loadAgentConfig(tenantId: string, agentId: string): Promise<AgentConfiguration | null> {
    const agentResults = await db.select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)))
      .limit(1);

    if (agentResults.length === 0) return null;

    const versionResults = await db.select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(agentVersions.versionNumber))
      .limit(1);

    if (versionResults.length === 0) return null;

    return versionResults[0].configuration as AgentConfiguration;
  }
}

export function createVoiceRuntime(llm: LLMService, knowledge: KnowledgeService, config?: VoiceRuntimeConfig): VoiceRuntime {
  return new VoiceRuntime(llm, knowledge, config);
}
