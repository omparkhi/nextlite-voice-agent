# NextLite Voice V3 — Complete Configuration Dependency Graph

> **Domain**: End-to-End Configuration & Data Flow Graph  
> **Status**: Verified from Codebase (Read-Only)  
> **Timestamp**: 2026-09-09  

---

## 1. Visual Dependency Graph

```mermaid
graph TD
    ENV[1. Environment Variables: .env] -->|Secrets, URLs, Ports| API[2. Express Control Plane API]
    API -->|Drizzle ORM SQL Migration| DB[(3. PostgreSQL Database)]
    
    DB -->|agent_templates: default_configuration| Agent[4. Agent Entity: agents table]
    Agent -->|Initial snapshot / Save edits| Version[5. Agent Version: agent_versions table]
    Version -->|Bind version_id & environment| Deployment[6. Deployment: deployments table]
    
    Deployment -->|GET /api/internal/runtime-config/:deploymentId| Resolver[7. RuntimeAgentConfigService]
    Resolver -->|Compile Layer A + Layer B| Compiler[8. PromptCompilerService]
    Compiler -->|Output DTO| RuntimeConfig[9. RuntimeAgentConfig DTO]
    
    RuntimeConfig -->|Delivered over HTTP REST / Bearer Secret| Worker[10. Voice Worker Process]
    Worker -->|Configure Transport, STT, LLM, TTS| Pipeline[11. Realtime Voice Pipeline]
    
    Pipeline -->|Conversational Dialogue| LLM[12. Sarvam-105B LLM Engine]
    LLM -->|Trigger Function Tool Call| Tools[13. Tool Registry / Factories]
    
    Tools -->|POST /api/internal/appointments, /leads, /knowledge/retrieve| InternalAPI[14. Internal Control Plane API]
    InternalAPI -->|Persist Records with Derived Tenant Isolation| DB
```

---

## 2. Step-by-Step Flow Annotations

| Arrow / Step | Data Transferred | Authentication | Transformation Applied | Owning Component |
|---|---|---|---|---|
| **ENV &rarr; API** | `DATABASE_URL`, `JWT_SECRET`, `SARVAM_API_KEY`, `WORKER_API_SECRET`, etc. | Local file / OS env | Zod schema validation & normalization (`apps/api/src/config/env.ts`) | Platform Infrastructure |
| **API &rarr; DB** | Schema DDL, seed data, templates | PostgreSQL Connection String | Drizzle ORM schema mapping (`apps/api/src/db/schema.ts`) | Data Architecture |
| **DB &rarr; Agent** | `templateId`, `tenantId`, `name` | Session JWT (ADMIN) | Clones template config into version v1 (`apps/api/src/services/agent.ts`) | Agent Service |
| **Agent &rarr; Version** | `configuration` (JSONB), `versionNumber` | Session JWT (ADMIN) | Increments version number; normalizes tool bindings (`apps/api/src/services/agent.ts`) | Agent Service |
| **Version &rarr; Deployment** | `versionId`, `agentId`, `tenantId`, `environment` | Session JWT (ADMIN) | Binds active version to `TEST` (on save) or `PRODUCTION` (on publish) | Deployment Service |
| **Deployment &rarr; Resolver** | `deploymentId` (UUID) | Worker Secret (`x-worker-secret`) | Resolves active deployment, agent, and linked version snapshot (`apps/api/src/services/runtimeAgentConfig.ts`) | Control Plane API |
| **Resolver &rarr; Compiler** | `AgentConfiguration` JSONB | In-memory function call | Compiles Layer A safety rules + Layer B customer persona & phases (`apps/api/src/services/promptCompiler.ts`) | Prompt System |
| **Compiler &rarr; RuntimeConfig**| `compiledSystemPrompt` (String) | In-memory function call | Maps to pure `RuntimeAgentConfig` DTO conforming to `@nextlite/shared` | Shared Contract |
| **RuntimeConfig &rarr; Worker** | JSON payload over HTTP REST | Bearer `WORKER_API_SECRET` | Deserialized in worker memory; injects temporal and calendar instructions | Worker Runtime |
| **Worker &rarr; Pipeline** | Sample rate, models, voices, languages | In-process instantiation | Initializes STT (`saaras:v3`), LLM (`sarvam-105b`), TTS (`bulbul:v3`), `ConversationLanguageManager` | Voice Pipeline |
| **Pipeline &rarr; LLM** | User audio frames &rarr; Transcriptions | In-process frame flow | Accumulated in `LLMContext` / user message turn | Speech Recognition |
| **LLM &rarr; Tools** | Function tool call arguments (`query`, `customerName`, `bookingDate`) | In-process function execution | Validates with Zod schema; injects trusted `deploymentId` and `callerPhone` | Tool Registry |
| **Tools &rarr; Internal API** | `{ deploymentId, ...toolArgs }` | Bearer `WORKER_API_SECRET` | HTTP POST to `/api/internal/appointments`, `/leads`, `/knowledge/retrieve` | Worker HTTP Client |
| **Internal API &rarr; DB** | Verified SQL insert / update with derived `tenantId` | PostgreSQL Connection Pool | Concurrency-safe sequencing (`tenant_appointment_counters`); inserts into `appointments`/`leads` | Database Layer |
