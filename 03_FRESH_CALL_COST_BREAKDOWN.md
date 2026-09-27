# Fresh Call Cost Forensics & Financial Optimization Analysis
**Document ID:** `03_FRESH_CALL_COST_BREAKDOWN.md`  
**Call Reference:** Session `a441481e-0d76-4f93-abd6-23542ca989d4` (1.3 Minutes PSTN Call)  

---

## 1. Complete Call Operational Metrics

| Metric | Measured Value |
| :--- | :--- |
| **Total Call Duration** | **1.3 Minutes (78 Seconds)** |
| **Number of User Turns** | **5 Turns** |
| **Caller Words** | **~26 Words** |
| **AI Spoken Words** | **~112 Words** |
| **AI Synthesized Characters** | **680 Characters** |
| **TTS Invocations / Requests** | **8 Requests** |
| **LLM HTTP Invocations / Requests** | **15 Requests** |
| **Total LLM Input Tokens** | **62,190 Tokens** |
| **Total LLM Output Tokens** | **244 Tokens** |
| **STT Stream Duration** | **1.3 Billable Minutes** |

---

## 2. Itemized Sarvam Cost Calculation

| Service Component | Measured Volume | Provider Rate | Computed Cost (INR) | % of Total Cost |
| :--- | :--- | :--- | :--- | :--- |
| **TTS (Bulbul:v2 / Bulbul:v3)** | 680 characters | ₹3.00 per 1,000 chars | **₹2.04** | **47.89%** |
| **LLM (Input Tokens)** | 62,190 tokens | ₹0.029 per 1,000 tokens | **₹1.80** | **42.25%** |
| **LLM (Output Tokens)** | 244 tokens | ₹0.16 per 1,000 tokens | **₹0.04** | **0.94%** |
| **STT (Saaras:v3-realtime)** | 1.3 minutes | ₹0.29 per minute | **₹0.38** | **8.92%** |
| **TOTAL COST PER CALL** | — | — | **₹4.26** | **100.00%** |
| **TOTAL COST PER MINUTE** | — | — | **~₹3.28 / min** | — |

---

## 3. Root Cause Attribution of Costs

### What Is Burning Money?

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. Excessive AI Speech & Multi-Sentence TTS Generation: ₹1.45 (34.0%)     │
│    (AI spoke 112 words/680 chars; human receptionist needs only ~35 words)│
│                                                                          │
│ 2. Uncompressed Context Re-transmission in LLM:         ₹1.42 (33.3%)     │
│    (4.2K tokens resent on all 15 requests instead of ~900 tokens)        │
│                                                                          │
│ 3. Unnecessary Early Filler Phrases (EarlyToolAck TTS): ₹0.48 (11.3%)     │
│    ("एक मिनिट, मी लगेच तपासतो" synthesized when tool finished in 2ms)     │
│                                                                          │
│ 4. Necessary Base STT, LLM output & Minimal Confirmation:₹0.91 (21.4%)   │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Avoidable Waste**: **₹3.35 per call (78.6% of the bill)** is pure architectural and prompt waste.
- **Optimized Target Cost**: An optimized 1.3-minute call should cost **~₹0.91 to ₹1.15 (under ₹0.85/min)**.
