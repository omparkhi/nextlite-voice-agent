# Realtime Voice Runtime

## Goal

Provide natural, low-latency phone conversations while keeping variable cost near the ₹2–₹3/min target.

## Three Testing Modes

Mode 1 — Chat Test (Phase 3):
Admin types text → Agent Runtime → Sarvam LLM → Text response

Mode 2 — Web Voice Test (Phase 4):
Browser microphone → WebSocket → Backend → Voice Runtime → Sarvam STT → LLM → Sarvam TTS → Browser playback

Mode 3 — Real Phone Call (Phase 4):
Phone → Plivo → Bidirectional WebSocket → Voice Runtime → Sarvam STT → LLM → Sarvam TTS → Plivo → Phone

All three modes share ONE Agent Runtime. The transport/input/output layer differs.

## Runtime path (Inbound and Outbound)

Both inbound and outbound calls converge into the SAME voice runtime.

```text
Inbound:
Customer → Plivo → Node.js Voice Engine → Sarvam STT → Agent/LLM/Tools → Sarvam TTS → Plivo → Customer

Outbound:
NextLite Backend → Plivo (Make Call API) → Plivo connects to customer →
Node.js Voice Engine (same) → Sarvam STT → Agent/LLM/Tools → Sarvam TTS → Plivo → Customer
```

## Plivo Audio Streaming

Plivo provides bidirectional WebSocket audio streaming:

- Audio codec: μ-law 8kHz (default) or Linear PCM 8kHz/16kHz
- Bidirectional: true (for voice agent mode)
- keepCallAlive: true (call stays active during stream)
- Audio chunks: ~20ms frames, base64-encoded
- Send audio back: playAudio event with base64 payload
- Interruption: clearAudio event to stop current playback
- WebSocket events: start, media, dtmf, stop
- Status callbacks: stream connected, stopped, timeout, failed

## Sarvam STT

Model: Saaras v3

Key capabilities:
- 23 languages (22 Indian + English)
- Modes: transcribe, translate, verbatim, translit, codemix
- Streaming WebSocket: wss://api.sarvam.ai/speech-to-text/ws
- Audio formats: WAV, PCM (pcm_s16le, pcm_l16, pcm_raw)
- For telephony: use sample_rate=8000
- VAD: high_vad_sensitivity parameter or fine-tuned VAD parameters
- VAD signals: speech_start, speech_end events
- Idle timeout: 60 seconds (send silent audio as keep-alive for long sessions)
- Authentication: api-subscription-key header

Key parameters:
- language_code: BCP-47 format (hi-IN, en-IN, etc.)
- model: saaras:v3
- mode: transcribe (default), translate, verbatim, translit, codemix
- sample_rate: 8000 (telephony) or 16000
- input_audio_codec: wav, pcm_s16le, pcm_l16, pcm_raw
- high_vad_sensitivity: true/false
- vad_signals: true/false (receive speech start/end events)

Pricing: ₹30/hour (billed per second)

Note: JS SDK connect() does not support mode parameter — use raw WebSocket with ?mode= query parameter for non-transcribe modes.

## Sarvam TTS

Model: Bulbul v3

Key capabilities:
- 35+ voices across 11 Indian languages
- WebSocket streaming: wss://api.sarvam.ai/text-to-speech/ws
- Sub-250ms first-byte latency
- Audio codecs: mp3, wav, linear16, mulaw, alaw, opus, flac, aac
- Sample rates: 8000, 16000, 22050, 24000 Hz
- For telephony: use mulaw codec, 8000 Hz sample rate
- Pace control: 0.5–2.0 (bulbul:v3)
- Temperature control: 0.01–1.0 (bulbul:v3 only)
- Max characters per message: 2500 (recommended under 500 for lowest latency)

Speakers (bulbul:v3):
shubh (default), aditya, ritu, priya, neha, rahul, pooja, rohan, simran, kavya, amit, dev, ishita, shreya, ratan, varun, manan, sumit, roopa, kabir, aayan, ashutosh, advait, anand, tanya, tarun, sunny, mani, gokul, vijay, shruti, suhani, mohit, kavitha, rehan, soham, rupali

Languages: Hindi, Tamil, Telugu, Bengali, Malayalam, Marathi, Gujarati, Kannada, Punjabi, Odia, Assamese

Pricing: ₹30 per 10,000 characters

## Realtime requirements

The runtime must support:
- streaming where provider APIs support it
- interruption/barge-in (Plivo clearAudio event)
- turn detection (STT VAD + silence timeout)
- low-latency responses
- call timeout handling
- provider errors
- retries where safe
- graceful call termination
- human transfer when configured
- outbound call initiation
- busy/no-answer/failed call handling

## Session state

Redis holds active call state:
- call ID
- tenant ID
- agent ID
- language
- current conversation state
- current task/state machine
- selected customer/lead
- pending tool operation
- outbound call context (lead/customer info)

PostgreSQL remains the durable source of truth.

## Cost tracking

For every call (inbound and outbound), record:
- connected duration
- telephony cost (Plivo)
- STT usage/cost (Sarvam Saaras)
- TTS usage/cost (Sarvam Bulbul)
- LLM input/output usage/cost
- infrastructure allocation where measurable
- total estimated cost
- billable minutes

Do not calculate cost using a single hard-coded per-minute number.

Provider pricing (current, verify before production):
- Plivo: per-minute rates (varies by destination)
- Sarvam STT: ₹30/hour = ₹0.50/min
- Sarvam TTS: ₹30/10K chars (approximately ₹0.30–1.00/min depending on speech density)
- LLM: per-token pricing (varies by provider)

## Voice behavior

Agents should be concise:
- ask one question at a time
- avoid unnecessary repetition
- confirm important actions
- interruptible
- do not read long paragraphs unless required
- use configured language and style

## Plivo India compliance

Important requirements for India:
- India data region account required
- KYC compliance: GST Certificate, Certificate of Incorporation, or Udyam Registration
- Number types: landline series (080/022) for service/transactional; 140-series for promotional; 160-series for BFSI
- Caller ID must be a Plivo-rented Indian number
- Media anchoring: both call legs must originate and terminate in India
- Cold calling prohibited without explicit digital consent (UCC compliance)
- Compliance application approval required before renting numbers
- 080/022 numbers: automated review within 5 minutes
- 140/160-series: separate SLA (7-14 business days)

## Call transfer

Plivo supports call transfer via:
- Dial XML element with Number or User (SIP)
- REST API transfer endpoint
- Can transfer to phone numbers or SIP endpoints
- Supports authenticated SIP transfer (sipAuthUsername/sipAuthPassword)
- Human handoff: announce transfer → Dial → fallback message if fails
