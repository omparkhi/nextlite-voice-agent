import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import { audioEnhancement } from '@livekit/plugins-ai-coustics';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SYSTEM_PROMPT,
  createAgent,
  resolveInterruptionOptions,
  resolvePreemptiveGenerationOptions,
  resolveExpressiveOption,
} from './agent.ts';
import {
  ConversationLanguageManager,
  buildFullInstructions,
} from './languageManager.ts';
import { buildTemporalInstruction } from './temporalContext.ts';
import { buildCalendarInstruction } from './calendarContext.ts';
import {
  extractDeploymentId,
  getRuntimeAgentConfig,
  createCallSession,
  updateCallSession,
} from './runtimeConfigClient.ts';
import { DebugTranscriptCollector } from './debugTranscript.ts';
import { detectCallContext, formatPlainTranscript } from './callLifecycle.ts';
import { RealtimeTimingTracker } from './realtimeTiming.ts';
import type { ToolRuntimeContext } from './tools/index.ts';

// Load environment variables from a local file.
// Make sure to set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET
// when running locally or self-hosting your agent server.
dotenv.config({ path: '.env.local' });

export default defineAgent({
  entry: async (ctx) => {
    // 1. Read room metadata
    const rawMetadata = ctx.room?.metadata || ctx.job?.room?.metadata;
    let deploymentId: string | undefined;
    let callSessionId: string | undefined;
    const roomName = ctx.room?.name || (ctx.job as any)?.room?.name || 'unknown';
    const debugCollector = new DebugTranscriptCollector();
    const timingTracker = new RealtimeTimingTracker({ roomName });
    const executedTools = new Set<string>();
    const sessionStartMs = Date.now();
    let isFinalizing = false;
    let isFinalized = false;

    let finalizeCallSession = async (_status: 'COMPLETED' | 'FAILED' | 'MISSED' = 'COMPLETED') => {};

    try {
      // 2. Extract deploymentId (fails clearly if missing/malformed, preventing unconfigured agent fallback)
      deploymentId = extractDeploymentId(rawMetadata);

      // 3. Resolve authoritative RuntimeAgentConfig from NextLite Control Plane API
      const runtimeConfig = await getRuntimeAgentConfig(deploymentId);

      const sttModel = runtimeConfig.voice?.sttModel || 'saaras:v3';
      const ttsModel = runtimeConfig.voice?.ttsModel || 'bulbul:v3';
      const ttsSpeaker = runtimeConfig.voice?.voiceId || 'priya';
      const llmModel = runtimeConfig.runtime?.llmModel || 'sarvam-105b-conversations';

      // 4. Initialize ConversationLanguageManager
      const languageManager = new ConversationLanguageManager(runtimeConfig.language);
      const initialSttLanguage = languageManager.getSttInitialLanguage();
      const initialTtsLanguage = languageManager.getTtsCurrentLanguage();

      const roomName = ctx.room?.name || (ctx.job as any)?.room?.name || 'unknown';
      const callContext = detectCallContext(roomName, (ctx.job as any)?.publisher?.identity, undefined);

      debugCollector.startCall({
        callId: roomName,
        roomName,
        jobId: ctx.job?.id ?? undefined,
        deploymentId,
        agentId: runtimeConfig.agent?.agentId,
        agentName: runtimeConfig.agent?.agentName,
        primaryLanguage: languageManager.primaryLanguage,
        supportedLanguages: languageManager.supportedLanguages,
      });

      // 5. Create ACTIVE call session in control plane
      try {
        const sessionRecord = await createCallSession({
          tenantId: runtimeConfig.tenant.tenantId,
          agentId: runtimeConfig.agent.agentId,
          deploymentId: runtimeConfig.deployment.deploymentId,
          roomName,
          callerNumber: callContext.callerNumber,
          direction: callContext.direction,
          status: 'ACTIVE',
          primaryLanguage: languageManager.primaryLanguage,
          startedAt: new Date(sessionStartMs).toISOString(),
        });
        callSessionId = sessionRecord.id;
        timingTracker.setCallSessionId(callSessionId);
        console.log(
          `[Worker] Created ACTIVE call session id=${callSessionId} (direction=${callContext.direction}, caller=${callContext.callerNumber || 'none'})`,
        );
      } catch (sessionErr) {
        console.error(
          `[Worker] Non-fatal: Failed to create call session for deployment=${deploymentId}:`,
          sessionErr instanceof Error ? sessionErr.message : sessionErr,
        );
      }

      console.log(
        `[Worker] Initializing session for deployment=${deploymentId} (agent=${runtimeConfig.agent.agentName}, ` +
          `sttModel=${sttModel}, sttLang=${initialSttLanguage}, ttsModel=${ttsModel}, ttsSpeaker=${ttsSpeaker}, ttsLang=${initialTtsLanguage}, llmModel=${llmModel}, ` +
          `autoDetect=${languageManager.autoDetectEnabled}, switching=${languageManager.languageSwitchingEnabled}, supported=[${languageManager.supportedLanguages.join(',')}])`,
      );

      const stt = new sarvam.STT({
        model: sttModel as any,
        languageCode: initialSttLanguage as any,
        mode: 'transcribe',
      });

      const tts = new sarvam.TTS({
        model: ttsModel as any,
        targetLanguageCode: initialTtsLanguage as any,
        speaker: ttsSpeaker as any,
        ...(typeof runtimeConfig.voice?.speakingSpeed === 'number'
          ? { pace: runtimeConfig.voice.speakingSpeed }
          : {}),
      });

      // Set up a voice AI pipeline using Sarvam and LiveKit local in-process turn detector (v1-mini)
      // v1-mini runs locally in-process with 0ms network transport latency, avoiding cloud EOT timeouts
      const session = new voice.AgentSession({
        stt,
        tts,
        maxToolSteps: 2,
        turnHandling: {
          turnDetection: new inference.TurnDetector({
            version: 'v1-mini',
          }),
          endpointing: {
            minDelay: 450,
            maxDelay: 2500,
          },
          interruption: resolveInterruptionOptions(runtimeConfig.runtime?.interruptionMode),
          preemptiveGeneration: resolvePreemptiveGenerationOptions(
            runtimeConfig.runtime?.preemptiveGenerationEnabled,
          ),
        },
        expressive: resolveExpressiveOption(runtimeConfig.runtime?.expressiveModeEnabled),
      });

      const timeZone = runtimeConfig.prompt?.timezone || 'Asia/Kolkata';
      const temporalInstruction = buildTemporalInstruction(new Date(), timeZone);
      const calendarInstruction = buildCalendarInstruction(new Date(), timeZone);
      const basePrompt = (
        runtimeConfig.prompt?.compiledSystemPrompt?.trim()
          ? runtimeConfig.prompt.compiledSystemPrompt
          : DEFAULT_SYSTEM_PROMPT
      ) + temporalInstruction + calendarInstruction;

      const runtimeConfigWithTemporal = {
        ...runtimeConfig,
        prompt: {
          ...runtimeConfig.prompt,
          compiledSystemPrompt: basePrompt,
        },
      };

      // Injected tool runtime context with active callSessionId and callerPhone
      const runtimeContext: ToolRuntimeContext = {
        deploymentId,
        callSessionId,
        callerPhone: callContext.callerNumber || undefined,
      };

      const agent = createAgent(runtimeConfigWithTemporal, languageManager, runtimeContext);

      // Session-scoped finalizer implementation
      finalizeCallSession = async (finalStatus: 'COMPLETED' | 'FAILED' | 'MISSED' = 'COMPLETED') => {
        if (!callSessionId || isFinalized || isFinalizing) {
          return;
        }
        isFinalizing = true;
        try {
          const transcriptData = debugCollector.endCall();
          const durationSeconds = Math.max(0, Math.round((Date.now() - sessionStartMs) / 1000));
          const turns = transcriptData.turns || [];
          const plainTranscript = formatPlainTranscript(turns);

          let status: 'COMPLETED' | 'FAILED' | 'MISSED' = finalStatus;
          if (status === 'COMPLETED' && turns.length === 0 && durationSeconds < 3) {
            status = 'MISSED';
          }

          const metricsPayload: Record<string, unknown> = {
            totalTurns: turns.length,
            executedToolsCount: executedTools.size,
            errorsCount: transcriptData.errors?.length || 0,
          };
          if (session.usage) {
            metricsPayload.usage = session.usage;
          }
          if (transcriptData.errors && transcriptData.errors.length > 0) {
            metricsPayload.errors = transcriptData.errors;
          }

          await updateCallSession(callSessionId, {
            tenantId: runtimeConfig.tenant.tenantId,
            status,
            durationSeconds,
            endedAt: new Date().toISOString(),
            primaryLanguage: languageManager.currentLanguage || runtimeConfig.language?.primary || 'en-IN',
            transcriptText: plainTranscript || null,
            turnsJson: turns,
            toolsUsed: Array.from(executedTools),
            metricsJson: metricsPayload,
          });

          isFinalized = true;
          console.log(
            `[Worker] Finalized call session ${callSessionId} with status=${status} (duration=${durationSeconds}s, turns=${turns.length}, tools=[${Array.from(executedTools).join(',')}])`,
          );
        } catch (err) {
          console.error(`[Worker] Failed to update call session ${callSessionId}:`, err);
        } finally {
          isFinalizing = false;
        }
      };

      // Register shutdown callback for process/job termination
      ctx.addShutdownCallback(async () => {
        await finalizeCallSession('COMPLETED');
      });

      // Dynamic Multilingual Voice: listen to user transcription events and update TTS & LLM when language changes
      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, async (ev: voice.UserInputTranscribedEvent) => {
        if (ev.isFinal && ev.transcript) {
          timingTracker.recordTranscriptFinal(ev.transcript, ev.language);

          const activeBefore = languageManager.currentLanguage;
          const turnResult = languageManager.processUserTurn(ev.transcript, ev.language);

          debugCollector.recordUserTurn({
            transcript: ev.transcript,
            detectedLanguage: ev.language ?? undefined,
            activeLanguageBefore: activeBefore,
            activeLanguageAfter: turnResult.currentLanguage,
            languageDecision: turnResult.decision || (turnResult.switched ? 'SWITCHED' : 'REJECTED'),
            languageDecisionReason: turnResult.details || (turnResult.switched ? turnResult.reason : 'none'),
            createdAt: ev.createdAt,
          });

          if (turnResult.switched) {
            console.log(
              `[Worker] Dynamic language switch triggered: ${turnResult.previousLanguage} -> ${turnResult.currentLanguage} (reason: ${turnResult.reason})`,
            );
            tts.updateOptions({ targetLanguageCode: turnResult.currentLanguage });
            await agent.updateInstructions(buildFullInstructions(basePrompt, turnResult.currentLanguage));
          }
        }
      });

      // Structured Audio Lifecycle Timing Diagnostics
      session.on(voice.AgentSessionEventTypes.SpeechCreated, (ev: voice.SpeechCreatedEvent) => {
        timingTracker.recordTtsStarted({
          speechId: ev.speechHandle?.id,
          source: ev.source,
          userInitiated: ev.userInitiated,
        });
      });

      session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev: voice.AgentStateChangedEvent) => {
        if (ev.newState === 'thinking') {
          timingTracker.recordTurnCommitted();
          timingTracker.recordLlmStarted(llmModel);
        } else if (ev.newState === 'speaking') {
          timingTracker.recordFirstAudioFrame();
        } else if (ev.oldState === 'speaking') {
          timingTracker.recordAudioForwardCompleted(ev.newState);
        }
      });

      // Conversation item tracking for debug transcript (agent responses)
      session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev: voice.ConversationItemAddedEvent) => {
        if (ev.item.type === 'message' && ev.item.role === 'assistant') {
          const responseText = (ev.item as any).rawTextContent ?? (ev.item as any).textContent ?? '';
          const isInterrupted = (ev.item as any).interrupted === true;
          if (isInterrupted) {
            timingTracker.recordTtsInterrupted();
          } else {
            timingTracker.recordTtsCompleted(responseText.length);
          }

          if (responseText && responseText.trim()) {
            debugCollector.recordAgentMessage({
              response: responseText,
              activeLanguage: languageManager.currentLanguage,
              interrupted: (ev.item as any).interrupted ?? undefined,
              metrics: (ev.item as any).metrics ?? undefined,
              createdAt: ev.createdAt,
            });
          }
        }
      });

      // Function tools execution tracking
      session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (ev: voice.FunctionToolsExecutedEvent) => {
        for (let i = 0; i < ev.functionCalls.length; i++) {
          const call = ev.functionCalls[i];
          const output = ev.functionCallOutputs[i];
          if (call) {
            if (call.name) {
              executedTools.add(call.name);
            }
            debugCollector.recordToolCall({
              toolName: call.name,
              callId: call.callId,
              args: call.args,
              createdAt: ev.createdAt,
            });
          }
          if (output) {
            let resultCount: number | undefined = undefined;
            try {
              const parsed = JSON.parse(output.output);
              if (Array.isArray(parsed?.results)) {
                resultCount = parsed.results.length;
              }
            } catch {
              // Ignore parse errors for non-JSON tool output
            }
            debugCollector.recordToolResult({
              callId: output.callId,
              resultCount,
              isError: output.isError,
              error: output.isError ? output.output : undefined,
              createdAt: ev.createdAt,
            });
          }
        }
      });

      session.on(voice.AgentSessionEventTypes.Error, (ev: voice.ErrorEvent) => {
        debugCollector.recordError(
          (ev.error as any)?.message || String(ev.error),
          (ev as any).source ? 'session' : undefined,
        );
      });

      session.on(voice.AgentSessionEventTypes.Close, async () => {
        await finalizeCallSession('COMPLETED');
      });

      // Start the session, which initializes the voice pipeline and warms up the models
      await session.start({
        agent,
        room: ctx.room,
      });

      // Join the room and connect to the user
      await ctx.connect();

      // Greet the user on joining
      const greetingInstructions = runtimeConfig.prompt?.greeting?.trim()
        ? runtimeConfig.prompt.greeting
        : 'Greet the user in a helpful and friendly manner.';

      session.generateReply({
        instructions: greetingInstructions,
      });
    } catch (error) {
      debugCollector.recordError(error instanceof Error ? error.message : String(error), 'initialization');
      if (callSessionId && !isFinalized) {
        await finalizeCallSession('FAILED');
      }
      console.error(
        `[Worker] Fatal job initialization error for room=${ctx.room?.name || 'unknown'}, deployment=${deploymentId || 'unknown'}:`,
        error,
      );
      throw error;
    }
  },
});

// Run the agent server
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'my-agent',
    initializeProcessTimeout: 20_000,
  }),
);
