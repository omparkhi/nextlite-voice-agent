# Testing Strategy

## Unit tests

Test:
- agent configuration validation
- prompt/config generation
- tool schemas
- billing state transitions
- deployment state transitions
- usage calculation
- tenant authorization

## Integration tests

Test:
- database
- Redis
- payment webhook
- telephony webhook
- STT adapter
- TTS adapter
- LLM adapter
- business tools

Use provider mocks/stubs for deterministic CI.

## Realtime tests

Test:
- call connect
- audio/stream lifecycle
- interruption
- timeout
- provider failure
- tool failure
- call termination
- transfer/handoff

## End-to-end

Critical happy path:

```text
Create client
→ verify
→ create agent
→ configure
→ test
→ approve
→ checkout
→ payment webhook
→ deploy
→ test live call
→ usage recorded
→ analytics visible
```

## AI quality evaluation

Create scenario test sets:
- normal inquiry
- ambiguous request
- wrong information
- interruption
- language switching
- appointment booking
- cancellation
- escalation
- unavailable slot
- human handoff

Do not judge an agent only by whether the HTTP request succeeded. Evaluate task completion and safety behavior.
