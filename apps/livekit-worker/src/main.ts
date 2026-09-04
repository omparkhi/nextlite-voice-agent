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
import { extractDeploymentId, getRuntimeAgentConfig } from './runtimeConfigClient.ts';

// Load environment variables from a local file.
// Make sure to set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET
// when running locally or self-hosting your agent server.
dotenv.config({ path: '.env.local' });

export default defineAgent({
  entry: async (ctx) => {
    // 1. Read room metadata
    const rawMetadata = ctx.room?.metadata || ctx.job?.room?.metadata;

    // 2. Extract deploymentId (fails clearly if missing/malformed, preventing unconfigured agent fallback)
    const deploymentId = extractDeploymentId(rawMetadata);

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

    // Set up a voice AI pipeline using Sarvam and LiveKit turn detector
    const session = new voice.AgentSession({
      stt,
      tts,
      maxToolSteps: 2,
      turnHandling: {
        // Turn detection determines when the user is speaking and when the agent should respond.
        // The LiveKit audio turn detector is a multimodal model that encodes the user's audio
        // directly to predict end of turn. It's built into the SDK (no extra plugin) and
        // AgentSession supplies the required VAD automatically.
        // See more at https://docs.livekit.io/agents/logic/turns/turn-detector/
        turnDetection: new inference.TurnDetector(),
        // Interruption mode configured dynamically from RuntimeAgentConfig ('adaptive' | 'always' | 'disabled')
        interruption: resolveInterruptionOptions(runtimeConfig.runtime?.interruptionMode),
        // Preemptive generation configured dynamically from RuntimeAgentConfig (defaults to enabled)
        preemptiveGeneration: resolvePreemptiveGenerationOptions(
          runtimeConfig.runtime?.preemptiveGenerationEnabled,
        ),
      },

      // Expressive mode configured dynamically from RuntimeAgentConfig (defaults to enabled)
      expressive: resolveExpressiveOption(runtimeConfig.runtime?.expressiveModeEnabled),
    });

    const basePrompt = runtimeConfig.prompt?.compiledSystemPrompt?.trim()
      ? runtimeConfig.prompt.compiledSystemPrompt
      : DEFAULT_SYSTEM_PROMPT;

    const agent = createAgent(runtimeConfig, languageManager, deploymentId);

    // Dynamic Multilingual Voice: listen to user transcription events and update TTS & LLM when language changes
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, async (ev: voice.UserInputTranscribedEvent) => {
      if (ev.isFinal && ev.transcript) {
        const turnResult = languageManager.processUserTurn(ev.transcript, ev.language);
        if (turnResult.switched) {
          console.log(
            `[Worker] Dynamic language switch triggered: ${turnResult.previousLanguage} -> ${turnResult.currentLanguage} (reason: ${turnResult.reason})`,
          );
          tts.updateOptions({ targetLanguageCode: turnResult.currentLanguage });
          await agent.updateInstructions(buildFullInstructions(basePrompt, turnResult.currentLanguage));
        }
      }
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
  },
});

// Run the agent server
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'my-agent',
  }),
);
