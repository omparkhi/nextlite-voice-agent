# NextLite Voice V3 — Voice Runtime & Provider Integrations Audit

> **Domain**: Realtime Audio, Speech-to-Text (STT), Large Language Models (LLM), and Text-to-Speech (TTS)  
> **Providers Audited**: Sarvam AI, LiveKit Gateway, Plivo Telephony, Pipecat AI  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Voice Provider Integration Matrix

| Component | Provider / SDK | Model / Protocol | API Key / Credential Source | Configuration Source | Runtime Selection Mechanism |
|---|---|---|---|---|---|
| **STT (Speech-to-Text)** | **Sarvam AI** (`@livekit/agents-plugin-sarvam` in Node.js; `pipecat-ai[sarvam]` in Python) | `saaras:v3` (Streaming WebSocket, 8kHz/16kHz) | `SARVAM_API_KEY` (Process env) | `RuntimeAgentConfig.voice.sttModel` | Resolved via `RuntimeAgentConfig` (default: `'saaras:v3'`). Initial language `'unknown'` if auto-detect enabled. |
| **LLM (Primary Voice Model)** | **Sarvam AI** (`SarvamLLM` custom adapter in Node.js; `SarvamLLMService` in Python) | `sarvam-105b-conversations` / `sarvam-105b` (REST / streaming) | `SARVAM_API_KEY` (Process env) | `RuntimeAgentConfig.runtime.llmModel` | Resolved via `RuntimeAgentConfig` (default: `'sarvam-105b-conversations'`). |
| **LLM (Alternative Gateway)** | **LiveKit Inference Gateway** (`inference.LLM`) | `google/gemma-4-31b-it`, `openai/gpt-4.1-mini`, etc. | `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `RuntimeAgentConfig.runtime.modelProvider` | Selected when `modelProvider` is `'google'`, `'openai'`, or `'livekit'`. |
| **TTS (Text-to-Speech)** | **Sarvam AI** (`@livekit/agents-plugin-sarvam` in Node.js; `pipecat-ai[sarvam]` in Python) | `bulbul:v3` (Streaming WebSocket) | `SARVAM_API_KEY` (Process env) | `RuntimeAgentConfig.voice.ttsModel`, `voice.voiceId`, `voice.speakingSpeed` | Speaker voice ID (`shubh`, `priya`, `rahul`, etc.) and pace resolved from `RuntimeAgentConfig`. Dynamic target language updated on switch. |
| **Telephony Transport (LiveKit)** | **Plivo SIP + LiveKit SIP Gateway** | SIP G.711 &rarr; WebRTC | `LIVEKIT_SIP_TRUNK_ID`, `LIVEKIT_URL` | LiveKit Server configuration | SIP Outbound/Inbound Trunk mapped to room dispatch. |
| **Telephony Transport (Pipecat)** | **Plivo WebSocket** | Bidirectional 8kHz μ-law WebSocket (`/ws/plivo`) | `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN` (for call termination) | `FastAPIWebsocketTransport` + `PlivoFrameSerializer` | Plivo Answer XML `<Stream>` connects directly to Pipecat WebSocket. |

---

## 2. Configuration-Driven vs Hardcoded Breakdown

### What is Configuration-Driven (Dynamic from DB `RuntimeAgentConfig`):
- STT model name (`voice.sttModel`).
- TTS model name (`voice.ttsModel`).
- TTS speaker voice ID (`voice.voiceId`).
- TTS speaking speed / pace (`voice.speakingSpeed`).
- Primary language & supported language array (`language.primary`, `language.supportedLanguages`).
- Auto-detection & switching enable flags (`language.autoDetectEnabled`, `language.languageSwitchingEnabled`).
- LLM model provider & model ID (`runtime.modelProvider`, `runtime.llmModel`).
- Model temperature (`runtime.temperature`).
- Interruption mode (`runtime.interruptionMode`: `'adaptive'`, `'always'`, `'disabled'`).
- Preemptive speculative generation (`runtime.preemptiveGenerationEnabled`).
- Expressive audio synthesis (`runtime.expressiveModeEnabled`).
- Max call length duration (`runtime.maxCallDurationSeconds`).

### What is Hardcoded / System-Enforced:
- **Sarvam Saaras STT Mode**: Hardcoded to `'transcribe'` mode.
- **Plivo Audio Rate**: Hardcoded to 8000 Hz μ-law telephony standard.
- **Turn Detector Version**: LiveKit worker hardcoded to local in-process `v1-mini` turn detector (0ms network latency).
- **Endpointing Silence Delays**: `minDelay: 450ms`, `maxDelay: 2500ms`.
- **Max Tool Steps**: Hardcoded to 2 steps per conversation turn.
- **Layer A Core Prompt Rules**: Max 1–2 sentences, single question, anti-self-talk, reference ID rules (`A-001`).

---

## 3. Latency Instrumentation & Realtime Telemetry

Both LiveKit and Pipecat worker runtimes feature monotonic microsecond/millisecond performance instrumentation:
- **STT Latency**: Measured from user speech stopped (VAD) to final `TranscriptionFrame` delivery.
- **LLM TTFT (Time to First Token)**: Measured from STT transcript delivery to first generated LLM token frame.
- **TTS TTFB (Time to First Audio Byte)**: Measured from LLM text chunk arrival to first synthesized audio frame.
- **Total Turn-Taking E2E Latency**: Measured from caller silence onset to first audio frame streamed to caller phone.
- **Interruption Timing**: Monitored when user speech interrupts active TTS synthesis.
