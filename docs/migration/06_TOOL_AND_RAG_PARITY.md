# Tools & pgvector RAG Forensic Parity

**Tools Layer:** `apps/pipecat-worker/app/tools/` & `apps/api/src/routes/internal.ts`  
**RAG Pipeline:** `apps/api/src/services/chunking.ts`, `embedding.ts`, `knowledge.ts`  
**Audit Date:** September 2026

---

## 1. Realtime Tools Parity

| Tool Name | Parameters Schema | Confirmation Req. | Trusted Context Injected | Database Side Effects | Return Schema |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `query_knowledge_base` | `{ query: string }` | No | `tenantId`, `agentId` | Read-only vector search | `{ success: boolean, results: string[], confidence: number }` |
| `book_appointment` | `{ customerName: string, customerPhone?: string, serviceType: string, appointmentDate: string, appointmentTime: string, notes?: string }` | Yes | `tenantId`, `agentId`, `callerPhoneNumber` | Increments `tenant_appointment_counters`, inserts `appointments` | `{ success: boolean, appointmentNumber: string, status: 'SCHEDULED', appointmentTime: string }` |
| `create_callback_lead` | `{ customerName: string, customerPhone?: string, requirement: string, priority?: 'LOW'\|'MEDIUM'\|'HIGH' }` | Yes | `tenantId`, `agentId`, `callerPhoneNumber` | Inserts `leads` table | `{ success: boolean, leadNumber: string, status: 'NEW' }` |

---

## 2. Trusted Context Injection Security

Under no circumstance can the LLM forge `tenantId` or `agentId`.
1. The realtime worker holds the authoritative `RuntimeAgentConfig` received during call initialization.
2. When the LLM emits a tool call, the worker extracts LLM arguments (`customerName`, `serviceType`, `appointmentDate`, `appointmentTime`).
3. The worker strips any caller-supplied `tenantId` or `agentId` and injects verified context:
   ```json
   {
     "tenantId": "11111111-1111-4111-8111-111111111111",
     "agentId": "22222222-2222-4222-8222-222222222222",
     "callerPhoneNumber": "+919876543210"
   }
   ```
4. In the target Python architecture, tools can execute directly via Shared Domain Services or via FastAPI internal endpoints with identical validation.

---

## 3. pgvector RAG Pipeline

```
Document Upload (PDF, Markdown, TXT)
      ↓
Semantic Chunking (Max 500 tokens, 50 token overlap, sentence-boundary aligned)
      ↓
NVIDIA / Sarvam Embedding API (1024-dimensional vector)
      ↓
PostgreSQL `knowledge_chunks` Table (`vector(1024)`)
      ↓
Vector Search Query:
SELECT chunk_text, (1 - (embedding <=> $query_vector)) AS similarity
FROM knowledge_chunks
WHERE tenant_id = $tenantId AND agent_id = $agentId AND (1 - (embedding <=> $query_vector)) > $threshold
ORDER BY embedding <=> $query_vector ASC
LIMIT $topK;
```