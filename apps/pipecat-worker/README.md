# NextLite Pipecat Worker — Phase 4: Real Sarvam LLM Integration

> **IMPORTANT**: This is **PHASE 4** of the Pipecat evaluation/migration. It implements the native conversational voice pipeline connecting **Plivo PSTN ↔ Pipecat Transport ↔ Sarvam STT ↔ Pipecat LLMContext ↔ Sarvam LLM (`sarvam-105b`) ↔ Sarvam TTS (`bulbul:v3`) ↔ Plivo PSTN**.
>
> The temporary Phase 2/3 deterministic test response is **removed from the active pipeline**.
>
> All conversation state, context aggregation, streaming token handling, and multi-turn message retention are managed natively by Pipecat 1.8.1 (`LLMContext`, `LLMContextAggregatorPair`, `SarvamLLMService`).
>
> The existing LiveKit production architecture (`apps/livekit-worker`, `apps/api`, `apps/web`) remains the authoritative production system and is completely untouched.

---

## 1. Conversational Pipeline Architecture (Phase 4)

```
Caller (Phone) 
      ↓ (PSTN)
 Plivo Telecom
      ↓ (WebSocket Stream: 8kHz μ-law Base64 JSON)
FastAPI WebSocket Endpoint (/ws/plivo)
      ↓ (PlivoFrameSerializer: 8kHz μ-law ↔ Linear PCM)
Pipecat Transport Input (transport.input())
      ↓ (InputAudioRawFrame)
Sarvam STT Service (saaras:v3 WebSocket)
      ↓ (TranscriptionFrame)
RealtimeStreamingTimingMonitor (Measures STT Latency, LLM TTFT, TTS TTFB)
      ↓ (TranscriptionFrame)
LLMUserAggregator (from LLMContextAggregatorPair)
      ↓ (LLMContextFrame)
Sarvam LLM Service (sarvam-105b Streaming WebSocket)
      ↓ (LLMTextFrame Chunks)
Sarvam TTS Service (bulbul:v3 WebSocket, Voice: shubh [Test default])
      ↓ (TTSAudioRawFrame Chunks)
Pipecat Transport Output (transport.output())
      ↓ (PlivoFrameSerializer)
LLMAssistantAggregator (from LLMContextAggregatorPair)
      ↓
 Plivo Telecom
      ↓ (PSTN)
Caller (Hears streaming natural speech response with multi-turn context)
```

---

## 2. Environment & Dependencies

- **Python Version**: `Python 3.14.3` (64-bit AMD64)
- **Pipecat Version**: `pipecat-ai==1.8.1`
- **Sarvam SDK**: `sarvamai>=0.1.28` (Installed: `sarvamai==0.1.28`)
- **Key Dependencies**:
  - `pipecat-ai`: Core pipeline, audio frames, `FastAPIWebsocketTransport`, `PlivoFrameSerializer`, `PipelineWorker`, `WorkerRunner`, `LLMContext`, `LLMContextAggregatorPair`, `SarvamLLMService`
  - `sarvamai`: Official Sarvam AI SDK for streaming STT, LLM, & TTS
  - `fastapi`: Async HTTP & WebSocket server
  - `uvicorn`: ASGI server
  - `websockets`: Realtime WebSocket protocol
  - `audioop-lts` & `soxr`: Fast C-accelerated μ-law and PCM resampling
  - `pydantic-settings`: Type-safe configuration
  - `loguru`: Structured logging
  - `pytest` & `pytest-asyncio`: Automated testing

---

## 3. Configuration

In `apps/pipecat-worker/.env`:

```env
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=INFO

# Sarvam AI API Key (required for real STT / LLM / TTS)
SARVAM_API_KEY=your-sarvam-api-key

# Optional Plivo credentials for REST auto hangup (optional in POC)
PLIVO_AUTH_ID=
PLIVO_AUTH_TOKEN=
PLIVO_PHONE_NUMBER=

# Optional POC Secret Key for endpoint authentication
POC_SECRET_KEY=
```

---

## 4. Running the Worker

```bash
# Activate virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

# Start server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:
```bash
curl http://localhost:8000/health
```

Output:
```json
{
  "status": "ok",
  "service": "pipecat-worker",
  "phase": "phase-4-sarvam-llm",
  "stt_model": "saaras:v3",
  "llm_model": "sarvam-105b",
  "tts_model": "bulbul:v3",
  "has_sarvam_key": true,
  "timestamp": 1788931200.0
}
```

---

## 5. Automated Tests

Run unit and integration tests:
```bash
pytest tests/ -v
```

All 27 automated test suites verify:
- Pipecat 1.8.1 & Sarvam STT/TTS/LLM module imports
- `SarvamSTTService` construction (`saaras:v3`)
- `SarvamLLMService` construction (`sarvam-105b`)
- `SarvamTTSService` construction (`bulbul:v3`, test voice: `shubh`)
- `LLMContext` and `LLMContextAggregatorPair` construction & multi-turn message accumulation
- Decoupling of `DeterministicTestEchoProcessor` from active pipeline
- Full 8kHz native telephony pipeline linking and assembly
- Plivo serializer and WebSocket transport lifecycle
- Interruption `clearAudio` serialization
- Health check endpoints

---

## 6. Multi-Turn Conversation Logs & Verification

Live multi-turn conversation verification test (`test_multiturn`):

```text
--- Turn 1: User: What is artificial intelligence? ---
Context: [{'role': 'system', 'content': '...'}, {'role': 'user', 'content': 'What is artificial intelligence?'}]
LLM Response: "Artificial intelligence refers to computer systems designed to perform tasks that normally require human intelligence, such as learning, reasoning, problem-solving, and understanding language. It encompasses technologies like machine learning and neural networks that enable machines to analyze data, recognize patterns, and make decisions with minimal human intervention."

--- Turn 2: User: Explain it in simpler words. ---
Context: [..., {'role': 'assistant', 'content': '...'}, {'role': 'user', 'content': 'Explain it in simpler words.'}]
LLM Response: "Artificial intelligence is when computers learn to do things that usually need human brains, like recognizing faces or understanding questions. It's like teaching a computer to get smarter by showing it lots of examples, so it can make decisions on its own."

--- Turn 3: User: Give me one example. ---
Context: [..., {'role': 'assistant', 'content': '...'}, {'role': 'user', 'content': 'Give me one example.'}]
LLM Response: "A great example is a virtual assistant like Siri or Alexa. When you ask it a question, it uses AI to understand your words and find the answer for you."
```

---

## 7. Telephony Verification Procedure

To run a live telephony test with Plivo and Sarvam STT/LLM/TTS:

1. **Start the Pipecat Worker**:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

2. **Expose Local Server via Public HTTPS/WSS (e.g. ngrok)**:
   ```bash
   ngrok http 8000
   ```

3. **Configure a DEDICATED Plivo Test Number**:
   - In Plivo Console, set the test number's **Answer URL** to:
     ```
     https://<your-ngrok-subdomain>.ngrok-free.app/plivo/test-xml
     ```
   - Method: `POST`

4. **Call the Test Number from your phone**:
   - You will hear: *"Connecting to NextLite Pipecat speech pipeline. Please speak after the tone."*
   - Test 1 (Greeting): *"Hello"* &rarr; Agent responds naturally.
   - Test 2 (Question): *"What is artificial intelligence?"* &rarr; Agent answers clearly.
   - Test 3 (Context): *"Can you explain that more simply?"* &rarr; Agent understands "that" refers to AI.
   - Test 4 (Follow-up): *"Give me one example."* &rarr; Agent provides a concrete AI example.
   - Test 5 (Interruption): Interrupt while the agent speaks &rarr; Speech stops immediately via Plivo `clearAudio` event, and agent listens to new speech.

5. **Hang Up**:
   - Verify clean pipeline teardown with zero orphaned tasks.
