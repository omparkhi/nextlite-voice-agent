# External Integrations Forensic Parity

**Audit Date:** September 2026

---

## 1. External Integration Matrix

| Service | Protocol | SDK / Library | Auth Mechanism | Endpoints / Ports | Timeout | Retry Policy | Fallback Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Plivo PSTN** | WebSocket + REST | `websockets` / `httpx` | Basic Auth (Auth ID + Token) | `wss://<host>/ws/plivo`, `https://api.plivo.com/v1/` | 10s | 2 retries on 5xx | Hangup call on WS disconnect |
| **Sarvam STT** | WebSocket / REST | `sarvamai` / `httpx` | `api-subscription-key` header | `wss://api.sarvam.ai/speech-to-text-ws` | 5s | Auto-reconnect WS | Log error, notify caller |
| **Sarvam LLM** | HTTP POST Streaming | `httpx` / `aiohttp` | `api-subscription-key` header | `https://api.sarvam.ai/v1/chat/completions` | 8s | None (live audio) | Return default apology response |
| **Sarvam TTS** | WebSocket / REST | `sarvamai` / `httpx` | `api-subscription-key` header | `wss://api.sarvam.ai/text-to-speech-ws` | 5s | Auto-reconnect WS | Instant fallback to cached audio |
| **PostgreSQL** | TCP / SSL | `asyncpg` / `SQLAlchemy` | Database Credentials | Port 5432 | 10s | Connection pool retry | 500 DB Error with logged trace |
| **Redis** | TCP / SSL | `redis-py` (`redis.asyncio`)| Password Auth | Port 6379 | 2s | 3 exponential retries | Graceful degradation for rate limiting |
| **Resend Email** | HTTPS REST | `httpx` | Bearer API Key | `https://api.resend.com/emails` | 5s | Background job retry | Log failed email delivery |
| **WhatsApp** | HTTPS REST | `httpx` | Bearer Token | Provider Webhook API | 5s | Queue retry | Mark follow-up status 'FAILED' |