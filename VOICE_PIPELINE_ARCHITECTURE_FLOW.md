# NextLite Voice V3 — Complete Pipeline Architecture & Data Flow

This document provides a comprehensive, visual guide to the **NextLite Voice V3** realtime telephony pipeline. It illustrates each pipeline node, the network protocols used, data payloads, timing budgets, and the exact lifecycle of tool calls (function calling).

---

## 1. High-Level Visual Node Architecture (n8n-Style Flow)

```
 [ 📞 1. Plivo Telephony Gateway ]
                 │
                 ▼  (WebSocket: 8kHz μ-law / Linear16 Audio)
 [ 🔌 2. FastAPI WebSocket Transport (PlivoFrameSerializer) ]
                 │
                 ▼  (Internal Frame: InputAudioRawFrame)
 [ 🚪 3. Startup Gate & Barge-in Controller (StartupGateProcessor) ]
                 │
                 ▼  (Persistent WSS: 20ms Audio Frames)
 [ 🎙️ 4. Sarvam Realtime STT (saaras:v3-realtime | VAD: 380ms) ]
                 │
                 ▼  (JSON over WSS: TranscriptionFrame)
 [ ⏱️ 5. Turn Controller & Language Manager (ExternalUserTurnStopStrategy) ]
                 │
                 ▼  (HTTP Keepalive Pool: Compiled System Prompt + History)
 [ 🧠 6. Sarvam LLM Engine (sarvam-105b-conversations) ]
                 │
         ┌───────┴──────────────────────────────────────┐
         │ (Direct Answer Path)                         │ (Tool Call Detected)
         ▼                                              ▼
 [ ⚡ 8. Early Release Text Aggregator ]     [ ⚙️ 7A. Native Tool Router ]
   (min 30 chars / 3 words)                             │
         │                                              ├──> [ 🔊 9. Sarvam TTS (Immediate Filler) ]
         │ (First Text Phrase)                          │       ("जी, मैं अभी चेक करता हूँ...")
         │                                              │
         │                                              ▼  (HTTP REST + Secret Auth)
         │                                   [ 🏥 7B. NextLite API & Database ]
         │                                      (PostgreSQL: book_appointment)
         │                                              │
         │                                              ▼  (Result Payload: APT-1001)
         │                                   [ 🧠 6. Sarvam LLM (Turn 2 Confirmation) ]
         │                                              │
         └──────────────────────┬───────────────────────┘
                                │ (Text Stream to Synthesize)
                                ▼
 [ 🔊 9. Sarvam Bulbul TTS (bulbul:v3 | 8kHz WebSocket) ]
                                │
                                ▼ (Base64 Encoded 8kHz PCM Audio)
 [ 📡 10. Plivo Outbound Streaming (DiagnosticPlivoFrameSerializer) ]
                                │
                                ▼ (Telephone Line Audio to Caller)
 [ 👂 Caller Hears Agent Response (P50: ~750–850 ms) ]
```

---

## 2. Component-by-Component Protocol & Data Specification

| Node / Step | Component | Protocol / Transport | Input Data | Output Data | Latency Budget |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Plivo Inbound** | PSTN / SIP Gateway | `WSS` (Plivo WebSocket) | Caller Voice Stream (8kHz μ-law / PCM) | Base64 Audio Packets | **~4 ms** |
| **2. Transport In** | `FastAPIWebsocketTransport` | Internal Python Async Queue | Base64 Media Payload | `InputAudioRawFrame` (PCM 8kHz) | **~1 ms** |
| **3. Startup Gate** | `StartupGateProcessor` | Memory Pipeline Gate | Incoming Audio Frames | Gated / Passed Frames (Interruption handling) | **~0 ms** |
| **4. Realtime STT** | `SarvamRealtimeSTTService` | `WSS` to `api.sarvam.ai` | 20ms Audio Frame Chunks | `TranscriptionFrame` (e.g. `"नमस्ते, अपॉइंटमेंट चाहिए"`) | **~95–110 ms** *(after 380ms VAD silence)* |
| **5. Turn Controller** | `ExternalUserTurnStopStrategy` | Python Memory Event Loop | `TranscriptionFrame` | Finalized Conversation Context Array | **~50 ms** *(Debounce timeout)* |
| **6. LLM Engine** | `InstrumentedSarvamLLMService` | `HTTP/1.1` Keepalive Pool | Prompt + Chat History JSON | SSE Streaming Token Stream | **~450–520 ms** *(First Token TTFB)* |
| **7A. Tool Router** | `ToolRegistry` | In-Memory Function Binding | LLM Tool Call Delta | 1. Early Filler to TTS<br/>2. API Execution Payload | **~10 ms** |
| **7B. API Backend** | NextLite FastAPI Control Plane | `HTTP/1.1` Internal REST | JSON: `{name, age, place, caller_phone}` | `{"status": "success", "appointmentNumber": "APT-1042"}` | **~80–120 ms** |
| **8. Text Aggregator**| `EarlyReleaseTextAggregator` | Memory Clause Parser | Streaming LLM Token Stream | First phrase chunk (min 30 chars / 3 words) | **~50–70 ms** |
| **9. Bulbul TTS** | `SarvamTTSService` | `WSS` to `api.sarvam.ai` | `{"type": "text", "data": {"text": "..."}}` | `TTSAudioRawFrame` (8kHz Linear16 PCM) | **~140–180 ms** *(TTS TTFB)* |
| **10. Plivo Out** | `DiagnosticPlivoFrameSerializer`| `WSS` to Plivo Gateway | Binary PCM Audio | Plivo `playAudio` JSON frame | **~4 ms** |

---

## 3. Execution Sequences

### Sequence A: Direct Question (Normal Conversational Turn)

```
Caller finishes speaking ("Aapka timing kya hai?")
   │ (VAD detects 380ms silence)
   ▼
STT emits final transcript ("Aapka timing kya hai?")
   │ (Turn finalized in 50ms)
   ▼
LLM receives System Prompt + History via persistent HTTP connection
   │ (LLM produces first tokens in ~450ms)
   ▼
EarlyReleaseTextAggregator catches first 30 characters: "क्लिनिक सुबह 9 बजे से..."
   │ (Aggregator releases immediately to TTS in ~60ms)
   ▼
Sarvam Bulbul:v3 generates first 8kHz audio frame in ~150ms
   │ (Transport transmits to Plivo in ~4ms)
   ▼
🔊 Caller hears first audio (Total Response Time: ~780ms P50)
   │
   └── Remaining tokens continue streaming seamlessly in the background.
```

---

### Sequence B: Action Request (Tool / Appointment Booking Turn)

```
Caller speaks ("I want to book an appointment with Dr. Sharma for tomorrow at 11 AM")
   │
   ▼
LLM recognizes tool intent and emits function call: book_appointment(...)
   │
   ├── [PARALLEL PATH 1: Fast Human Acknowledgement (< 1,000ms)]
   │      │
   │      ▼
   │   Tool Router sends language-matched filler phrase to TTS:
   │   Hindi:   "जी, मैं अभी आपकी अपॉइंटमेंट बुक कर देता हूँ।"
   │   Marathi: "हो, मी लगेच तुमची अपॉइंटमेंट बुक करतो."
   │   English: "Sure, let me book that appointment for you right away."
   │      │
   │      ▼
   │   🔊 Caller hears immediate confirmation that action is underway.
   │
   └── [PARALLEL PATH 2: Secure Server Execution]
          │
          ▼
       Tool attaches trusted telephony phone number from call metadata
          │
          ▼
       POST /api/internal/tools/execute -> PostgreSQL Database
          │
          ▼
       DB confirms booking and generates reference ID: "APT-1042"
          │
          ▼
       Tool returns result to LLM (Turn 2)
          │
          ▼
       LLM streams final confirmation:
       "Aapka appointment APT-1042 confirm ho gaya hai kal subah 11 baje ke liye."
          │
          ▼
       🔊 Caller hears the final confirmed reference number.
```

---

## 4. Built-in Security & Privacy Guarantees

1. **Trusted Telephony Metadata Extraction**:
   - The phone number is extracted from the incoming Plivo SIP/PSTN header and bound to the session context.
   - The LLM never asks the user to speak their phone number.
2. **UUID & Hash Suppression**:
   - Internal UUIDs (e.g. `02a1e84a-2d11-48c9-9209-f6d7de1fa502`) are suppressed by the safe display serializer.
   - The agent only reads aloud short customer-facing reference codes (e.g., `APT-1042` or `LEAD-5001`).
3. **Tenant Isolation**:
   - Every tool call executes strictly scoped within the caller's verified `tenant_id`.
4. **Dynamic Language Switch**:
   - When callers switch dynamically between English, Hindi, and Marathi, STT, LLM, filler acknowledgments, and TTS voice persona remain 100% matched.
