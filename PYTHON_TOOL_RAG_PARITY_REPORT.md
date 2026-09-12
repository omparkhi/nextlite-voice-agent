# NextLite Voice V3 — Tools & RAG Engine Parity Report

**Status:** PASS (100% Parity)  

## 1. Realtime Tools Registry
- **Canonical Catalog:** `query_knowledge_base`, `book_appointment`, `create_callback_lead`.
- **UUID Suppression:** Strict rejection of raw UUIDs in caller-facing TTS output.
- **Trusted Context:** Server-side injection of authenticated `tenantId`, `agentId`, `deploymentId`, and caller phone.

## 2. Knowledge Base & Vector Retrieval
- **Vector Search:** Semantic search using pgvector cosine distance (`<=>`).
- **Text Processing:** Sliding chunking with configurable overlap and token estimation.\n