# NextLite Voice V3 — Runtime Agent Config & Prompt Parity Report

**Status:** PASS (100% Parity)  

## 1. RuntimeAgentConfig Authority
- **Single Authority:** Canonical Python implementation with all 26 fields fully defined in `apps/api/app/schemas.py`.
- **Authoritative Resolution:** `RuntimeConfigService` resolves dynamic configurations directly from the active `deployments` or dialed `phone_numbers`.

## 2. Prompt Compilation & Multilingual Dynamic Context
- **Universal Safety:** Anti-hallucination constraints, UUID suppression rules, PSTN concise formatting, and phonetic number pronunciation rules.
- **Dynamic Temporal Context:** Computed in the configured IANA timezone (e.g. `Asia/Kolkata`).
- **Dynamic Code-Switching:** Seamless multi-turn language persistence across English, Hindi, Marathi, and Hinglish.\n