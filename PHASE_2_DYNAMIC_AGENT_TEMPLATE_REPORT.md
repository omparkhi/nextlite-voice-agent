# NEXTLITE VOICE V3 — PHASE 2 REPORT
## Dynamic Agent Template Architecture

**Date:** 2026-09-12  
**Status:** PASS  
**Scope:** Reusable Agent Template Architecture, Prompt Layering, Agent-Template Association, Multi-Tenancy Isolation, and Backward Compatibility.

---

### 1. Executive Summary

Phase 2 successfully establishes a clean, production-grade **Agent Template Architecture** for NEXTLITE VOICE V3.

The architecture strictly enforces separation across all five structural layers:
1. **PLATFORM**: Universal voice-agent runtime and non-overridable safety invariants (`CORE_SAFETY_BOUNDARY`).
2. **AGENT TEMPLATE**: Reusable baseline definitions of agent roles, capabilities, and base prompts (e.g. `Receptionist`, `Customer Support`, `Sales & Lead Qualification`, `Booking & Scheduling`, alongside specialized domain templates).
3. **AGENT**: Client agent records referencing a template via `templateId`.
4. **CLIENT CONFIGURATION**: Client-specific business identity, operating hours, custom facts, policies, instructions, and workflows captured in versioned snapshots (`AgentVersion`).
5. **RUNTIME ENGINE**: Resolved runtime payloads dispatched to the Pipecat voice worker.

Modifying an agent's configuration updates only that agent's version snapshot without mutating global templates or affecting other agents. Non-healthcare agents (such as restaurants, coaching institutes, salons, and real estate agencies) compile without healthcare assumptions, while the first-client healthcare workflow continues to operate with full domain fidelity.

---

### 2. Current Template Architecture Discovered

During repository inspection:
- `AgentTemplate` existed in `apps/api/app/models.py` and `apps/api/src/db/schema.ts` with columns `id`, `name`, `description`, `industry`, `defaultConfiguration`, and `isSystem`.
- In the initial Python migration, template retrieval and management lacked a unified service layer, resulting in inconsistent attribute access (`tmpl.defaultConfig` vs `tmpl.defaultConfiguration`).
- Templates were not integrated into the authoritative prompt compilation pipeline (`PromptCompilerService`), meaning base prompts were not formally composed with platform safety invariants and client configurations.
- Default agent creation lacked a clean link to template defaults.

---

### 3. Existing Template Implementation Before Changes

- **Models**: `AgentTemplate` had no property helpers for `systemPromptTemplate` or `basePrompt`. `Agent` had `templateId` foreign key but no relationship mapping.
- **Service Layer**: No dedicated `TemplateService` existed in Python.
- **Prompt Compiler**: `compile_system_prompt` did not accept or inject a template base prompt layer.
- **Runtime Resolution**: `RuntimeAgentConfigService` ignored `agent.templateId` during prompt compilation.
- **Agent Creation**: `create_agent` performed partial manual dictionary lookups without cloning or decoupling template defaults.

---

### 4. Template Hardcoding Findings

| File | Area | Finding | Classification | Action | Reason |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `apps/api/app/services/agent_service.py` | Agent Creation | Direct lookup without deep copy; hardcoded fallback config | B. AGENT TEMPLATE BEHAVIOR | Refactored to use `TemplateService` with deep-copied snapshot | Guarantee template immutability when clients customize agents |
| `apps/api/app/services/prompt_compiler_service.py` | Compilation Pipeline | Missing explicit template base prompt layer | A. PLATFORM INFRASTRUCTURE | Added `template_base_prompt` layer | Formally layer Platform Safety -> Template Role -> Client Config |
| `apps/api/app/services/runtime_config_service.py` | Runtime Resolution | Ignored `agent.templateId` during prompt compilation | A. PLATFORM INFRASTRUCTURE | Added template resolution and passed `template_base_prompt` | Runtime worker receives full role discipline |
| `apps/api/app/routers/admin.py` | Admin Routes | Raw DB queries accessing inconsistent attribute names | A. PLATFORM INFRASTRUCTURE | Updated to use `TemplateService` | Clean, standardized template exposure |
| `apps/api/app/routers/client.py` | Client Routes | Missing template listing endpoint for tenant users | A. PLATFORM INFRASTRUCTURE | Added `/api/client/templates` | Tenant users can browse available templates safely |

---

### 5. Final Template Architecture

```
PLATFORM ENGINE (Universal Safety Invariants)
       ↓
AGENT TEMPLATE (Reusable Role Definition + Base Prompt)
       ↓
AGENT (Client's Agent Instance referencing templateId)
       ↓
CLIENT CONFIGURATION (Identity, Business Info, Custom Facts, Rules)
       ↓
RUNTIME CONFIG RESOLUTION (Deterministic Assembly)
       ↓
PIPECAT WORKER (Low-latency Audio & LLM Turn Execution)
```

The system provides two distinct classes of templates:
1. **Generic Role Templates** (`industry: "General"`):
   - `Receptionist` (`receptionist`): Front-desk phone receptionist, FAQ, appointment and callback assistant.
   - `Customer Support` (`customer_support`): Issue troubleshooting and support ticket logger.
   - `Sales & Lead Qualification` (`sales_lead_gen`): Inbound sales inquiry and qualified lead capture.
   - `Booking & Scheduling` (`booking_scheduling`): Appointment, reservation, and slot coordinator.
2. **Specialized Industry Templates**:
   - `Clinic Receptionist` (`clinic_receptionist`, Healthcare): Outpatient consultation and OPD scheduling.
   - `Admission Counselling` (`admission_counselling`, Education): Course guidance and demo class booking.
   - `Property Inquiry` (`property_inquiry`, Real Estate): Property specifications and site visit tours.
   - `Automobile Service` (`automobile_service`, Automobile): Vehicle maintenance bay bookings.
   - `Loan Lead Qualification` (`loan_lead_qualification`, Finance): Loan eligibility and advisor consultations.

---

### 6. Template Data Model

```python
class AgentTemplate(Base):
    __tablename__ = "agent_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    industry: Mapped[str] = mapped_column(String(100), nullable=False)
    defaultConfiguration: Mapped[dict] = mapped_column("default_configuration", JSONB, nullable=False, default=dict)
    isSystem: Mapped[bool] = mapped_column("is_system", Boolean, default=True, nullable=False)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)

    @property
    def defaultConfig(self) -> dict:
        return self.defaultConfiguration or {}

    @property
    def systemPromptTemplate(self) -> Optional[str]:
        if isinstance(self.defaultConfiguration, dict):
            return self.defaultConfiguration.get("basePrompt") or self.defaultConfiguration.get("systemPrompt") or self.defaultConfiguration.get("systemInstructions")
        return None

    @property
    def basePrompt(self) -> Optional[str]:
        return self.systemPromptTemplate
```

---

### 7. Agent → Template Relationship

```python
class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenantId: Mapped[uuid.UUID] = mapped_column("tenant_id", UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    templateId: Mapped[Optional[uuid.UUID]] = mapped_column("template_id", UUID(as_uuid=True), ForeignKey("agent_templates.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[AgentStatus] = mapped_column(SQLEnum(AgentStatus, name="agent_status", native_enum=False), nullable=False, default=AgentStatus.DRAFT)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime, default=datetime.utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="agents")
    template = relationship("AgentTemplate", foreign_keys=[templateId])
    versions = relationship("AgentVersion", back_populates="agent", cascade="all, delete-orphan")
```

---

### 8. Prompt Compilation Flow & Layering

Prompt compilation in `apps/api/app/services/prompt_compiler_service.py` executes in the following sequence:

1. **Layer 1: CORE RUNTIME SAFETY BOUNDARY** (Highest authority: Anti-hallucination, turn length, single question rule, caller ID verification, tool mutation checks).
2. **Layer 2: TEMPORAL CONTEXT** (Dynamic date, time, weekday, timezone).
3. **Layer 3: ROLE BASELINE & CONVERSATIONAL PRINCIPLES** (Template Base Prompt: role responsibilities, conversational guidelines, clarification protocols, limitation acknowledgment).
4. **Layer 4: IDENTITY & PERSONA** (Agent name, business name, tone, style, formality, AI disclosure).
5. **Layer 5: ENVIRONMENT & CONTEXT** (Situation, channel, target audience).
6. **Layer 6: OBJECTIVES** (Primary objective, secondary objectives).
7. **Layer 7: SPEAKING STYLE** (Conciseness, single question rule, spoken numbers).
8. **Layer 8: BUSINESS INFORMATION & CUSTOM FACTS** (Business type, location, operating hours, custom key-value facts).
9. **Layer 9: CONVERSATION PHASES** (Workflow phases, step goals, required parameters).
10. **Layer 10: SAFETY GUARDRAILS & ESCALATION** (Prohibited claims, escalation rules, fallback actions).
11. **Layer 11: LANGUAGE & CODE-SWITCHING** (Primary language, supported languages, Hinglish/Minglish conversational guidance).
12. **Layer 12: CUSTOM SYSTEM INSTRUCTIONS** (Client-specific custom prompts).
13. **Layer 13: RELEVANT KNOWLEDGE CONTEXT** (RAG snippets from knowledge base).
14. **Layer 14: INITIAL GREETING GUIDANCE** (On-connect greeting instruction).
15. **Layer 15: VOICE PERSONA & GENDER GRAMMAR** (Masculine/feminine Hindi verb agreements).

---

### 9. Prompt Precedence

```
┌───────────────────────────────────────────────────────────┐
│ PLATFORM SAFETY RULES (Non-overridable, highest authority)│
├───────────────────────────────────────────────────────────┤
│ TEMPLATE BASE PROMPT (Role baseline & conversation dis.)  │
├───────────────────────────────────────────────────────────┤
│ AGENT INSTRUCTIONS (Client-specific role & instructions) │
├───────────────────────────────────────────────────────────┤
│ BUSINESS DATA & CUSTOM FACTS (Authoritative business info)│
├───────────────────────────────────────────────────────────┤
│ TOOLS (Action capabilities & execution rules)             │
├───────────────────────────────────────────────────────────┤
│ KNOWLEDGE (Retrieved RAG context)                         │
├───────────────────────────────────────────────────────────┤
│ RUNTIME & TEMPORAL CONTEXT (Dynamic call context)         │
└───────────────────────────────────────────────────────────┘
```

---

### 10. Template Ownership & Multi-Tenancy Model

- **System Templates**: Global platform resources (`is_system = True`) managed by platform administrators.
- **Tenant Access**: Tenants can list and inspect system templates via `GET /api/client/templates` and `GET /api/admin/templates`.
- **Tenant Mutation Isolation**: Tenants cannot alter global system templates.
- **Agent Isolation**: When a tenant creates an agent from a template, an independent `AgentVersion` record is provisioned under that tenant's `tenantId`. Modifications to Agent A never touch `AgentTemplate` or Agent B.

---

### 11. Versioning Strategy

- **Immutable Snapshots**: Each agent deployment points to a specific `AgentVersion` (`versionId`).
- **Template Updates**: Updates to a global template definition affect only newly created agents. Existing published versions retain their immutable snapshot configurations.

---

### 12. API Changes

- Added `apps/api/app/services/template_service.py` (`TemplateService`).
- Updated `GET /api/admin/templates`: Returns all system templates with industry filtering (`?industry=...`).
- Updated `GET /api/admin/templates/{template_id}`: Returns template details by UUID or slug.
- Added `GET /api/client/templates`: Read-only template listing for tenant users.
- Added `GET /api/client/templates/{template_id}`: Read-only template retrieval for tenant users.
- Updated `POST /api/admin/agents` & `POST /api/admin/clients/{client_id}/agents`: Creates agent and initializes version 1 from template defaults.

---

### 13. Frontend Changes

No breaking frontend changes. The existing `AgentBuilder.tsx` consuming `/api/admin/templates` and `/api/admin/templates/{id}` works seamlessly with the expanded template catalog.

---

### 14. Database Changes

No schema migrations required. The existing `agent_templates` and `agents` tables in PostgreSQL were fully compatible and were enriched at the ORM layer with property helpers and relationships.

---

### 15. Backward Compatibility Considerations

1. **Healthcare First-Client**: `clinic_receptionist` template and existing clinical agent configurations continue to compile with full clinical guidance, OPD schedules, doctor availability, and safety rules intact.
2. **Missing Template Handling**: Creating an agent without `template_id` safely defaults to the platform-safe neutral `AI Voice Assistant` without failing or injecting healthcare assumptions.
3. **Property Backward Compatibility**: Accessing `tmpl.defaultConfig` or `tmpl.systemPromptTemplate` is fully supported via ORM properties.

---

### 16. Tests Added & Modified

#### Dedicated Phase 2 Test Suite (`tests/domain/test_phase2_dynamic_agent_templates.py`):
1. `test_01_template_load`: Verifies generic Receptionist template loads with all required metadata.
2. `test_02_template_prompt_included_in_runtime_compilation`: Verifies template base prompt appears in compiled runtime prompt.
3. `test_03_no_client_data_in_generic_template`: Verifies generic templates contain no client-specific business names or custom facts.
4. `test_04_no_healthcare_leakage_in_generic_template`: Verifies generic Receptionist template contains 0 healthcare keywords.
5. `test_05_multiple_agents_same_template`: Verifies Restaurant and Coaching agents share the Receptionist template while maintaining distinct business facts.
6. `test_06_template_isolation`: Verifies mutating an agent's configuration does not mutate the template definition.
7. `test_07_first_client_healthcare_compatibility`: Verifies specialized healthcare clinic configuration compiles accurately with clinical safety rules.
8. `test_08_missing_template_safe_fallback`: Verifies missing template falls back safely to neutral assistant.
9. `test_09_tenant_isolation`: Verifies Tenant A cannot access or modify Tenant B's agent configuration.
10. `test_10_prompt_layering_order`: Verifies Platform Safety -> Temporal Context -> Template Base Prompt -> Identity -> Business Info -> Custom Instructions ordering.
11. `test_11_template_tool_neutrality`: Verifies generic templates bind tools neutrally without healthcare descriptions.
12. `test_12_template_knowledge_empty`: Verifies generic templates have empty custom facts.

---

### 17. Exact Test Commands & Results

```bash
# 1. Phase 2 Test Suite
apps/pipecat-worker/.venv/Scripts/python.exe -m pytest tests/domain/test_phase2_dynamic_agent_templates.py -v
# Result: 12 passed in 3.71s

# 2. Entire API / Domain Test Suite (56 tests)
apps/pipecat-worker/.venv/Scripts/python.exe -m pytest tests/ -q
# Result: 56 passed in 9.90s

# 3. Pipecat Worker Test Suite (304 tests)
apps/pipecat-worker/.venv/Scripts/python.exe -m pytest apps/pipecat-worker/tests/ -q
# Result: 304 passed in 44.17s
```

**Total Tests: 360 passing across all suites (0 failures).**

---

### 18. Remaining Template-Related Hardcoding Intentionally Left

- **Frontend Demo Fixtures** (`apps/api/app/routers/receptionist.py`, `SAMPLE_DOCTORS`): Preserved as demo data for the current web appointment demo until Phase 4 (Admin UI overhaul).
- **Healthcare First-Client Knowledge** (`knowledge_base/*.md`): Preserved as RAG knowledge documents for the first client.

---

### 19. Known Risks

- None identified. Database schema and API contracts are 100% backward-compatible.

---

### 20. Manual Verification Walkthrough

1. **Load Template**:
   `TemplateService.find_system_template("receptionist")` loads generic Receptionist template.
2. **Create Agent A (Restaurant)**:
   Agent A configured with `businessName: "Spice Garden Restaurant"`, `hours: "12:00 PM - 11:00 PM"`, and `customFacts: {"Cuisine": "North Indian & Mughlai"}`.
3. **Create Agent B (Coaching)**:
   Agent B configured with `businessName: "Pinnacle IAS Academy"`, `hours: "8:00 AM - 7:00 PM"`, and `customFacts: {"Target_Exam": "UPSC CSE 2027"}`.
4. **Compile Prompts**:
   - Both prompts contain identical `=== ROLE BASELINE & CONVERSATIONAL PRINCIPLES ===` sections.
   - Prompt A contains only restaurant information; Prompt B contains only coaching information.
   - Neither prompt contains healthcare terms (`doctor`, `patient`, `clinic`, `consultation`, `hospital`, `opd`).
5. **Healthcare Client Verification**:
   - Compiling `clinic_receptionist` with `Arogya Medical Clinic` retains all clinical guardrails and doctor scheduling context.

---

### 21. Recommended Phase 3

In Phase 3:
1. Implement **Schema-Driven Variable Extraction & Interpolation** (`{{businessName}}`, `{{serviceList}}`, `{{operatingHours}}`, `{{customFacts}}`).
2. Build the **Dynamic Tool Registry** to allow agents to selectively bind tools (Appointments, Leads, Knowledge, Order Placement, Custom Webhooks) based on business needs.
