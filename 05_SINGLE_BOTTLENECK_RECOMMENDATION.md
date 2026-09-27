# Single First Bottleneck Optimization Recommendation
**Document ID:** `05_SINGLE_BOTTLENECK_RECOMMENDATION.md`  
**Purpose:** Formal, actionable recommendation of the exact ONE component to optimize first post-audit.  
**Implementation Status:** Strictly Read-Only Proposal (Not implemented in this audit).  

---

### FIRST TARGET:
**Prompt & Context Token Compression Engine (`PromptCompilerService` & `LLMContext` Payload Pruning)**

---

### WHY:
1. **Primary Root Cause of the 62.2K Input Tokens**: Every single LLM request (15 requests in a 1.3-minute call) re-submits ~4,146 tokens of uncompressed system rules, duplicate temporal instructions, verbose conversation phase descriptions, and 5 full JSON tool schemas over stateless HTTP POST calls.
2. **Primary Driver of LLM TTFT & True Response Latency**: The GPU attention prefill latency on Sarvam's servers is directly proportional to prompt token length. Processing 4,146 input tokens introduces an initial TTFB delay of **568 ms – 895 ms** before generating the very first response token.
3. **Biggest ROI on Operational Cost**: Input tokens represent **42.2% (₹1.80)** of the total call bill. Compressing the baseline context from ~4,150 tokens to <950 tokens immediately cuts ~₹1.40 per call with zero code risk to the audio/telephony streaming transport.
4. **Eliminates Prompt Contradictions**: Pruning redundant, verbose guidelines resolves internal prompt conflicts that currently cause the model to generate long 20–30 word chatbot explanations instead of short 3–8 word human receptionist confirmations.

---

### CURRENT MEASURED VALUE:
- **System + Context Tokens per Request**: **4,146 Input Tokens**
- **Total Input Tokens per 1.3-Min Call (15 Requests)**: **62,190 Tokens**
- **LLM HTTP TTFB Latency (Time to First Byte/Token)**: **568 ms – 895 ms** (P50: 619 ms, Max: 1,351 ms)
- **Total LLM Cost per Call**: **₹1.84**
- **Total Cost per Minute**: **₹3.28 / min**

---

### TARGET:
- **System + Context Tokens per Request**: **< 950 Input Tokens**
- **Total Input Tokens per 1.3-Min Call**: **< 12,000 Tokens**
- **LLM HTTP TTFB Latency**: **320 ms – 400 ms** (P50: ~350 ms)
- **Total LLM Cost per Call**: **< ₹0.38**
- **Total Cost per Minute**: **< ₹1.10 / min**

---

### EXPECTED IMPACT:
- **Financial Savings**: **75% to 80% reduction in LLM API spend** (Saving ~₹1.40 to ₹1.50 per call) *(Estimated)*.
- **Latency Reduction**: **180 ms to 260 ms reduction in True Time To First Answer (True TTFA)** across all conversational and tool-calling turns *(Estimated)*.
- **Conversational Conciseness**: Shorter system context will naturally yield shorter, crisper 3–8 word human-like responses, further saving ~₹0.80/call in downstream TTS synthesis costs *(Estimated)*.

---

### RISK:
- **Behavioral & Guardrail Retention Risk**: If prompt rules are pruned too aggressively, the model could fail to respect Devanagari script rules, omit required appointment parameters (date/time/name), or mishandle emergency escalations.
- **Mitigation Strategy**: Maintain Core Safety Rules and Emergency Policies in concise, deterministic bullet format while stripping duplicate 7-day calendar tables, redundant explanatory prose, and inactive tool schemas on post-tool turns.

---

### HOW WE WILL VALIDATE:
We will execute a 10-call automated PSTN test matrix across Marathi, Hindi, and English evaluating:
1. **Token Accounting**: Verify that total input tokens for a standard 4-turn appointment booking do not exceed **12,000 tokens**.
2. **Timing Telemetry**: Verify via `[TURN_METRICS]` that `llmHttpRequestMs` (HTTP TTFB) drops from `~680ms` to **`< 400ms`**.
3. **True TTFA Latency**: Measure speech stop to first non-filler answer audio reaching Plivo (Target: **`< 850ms`** on normal turns).
4. **Cost Benchmark**: Confirm the total Sarvam invoice per 1.5-minute call is **`< ₹1.25`**.
