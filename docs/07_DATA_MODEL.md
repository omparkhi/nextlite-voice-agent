# Data Model

PostgreSQL is the primary database.

## Core entities

### tenants
Business/client organization.

### users
Authenticated users associated with a tenant and/or NextLite admin.
- Custom JWT + refresh token authentication (no external auth platform)
- Role field: ADMIN | CLIENT_OWNER | CLIENT_VIEWER (enum, not RBAC table)

### agents
Agent identity and status.

### agent_versions
Versioned agent configuration (immutable, append-only).

### agent_templates
Reusable initial configurations.

### agent_knowledge_sources
Documents, FAQs, business information sources.

### knowledge_chunks
Chunked knowledge with embeddings for pgvector (dimension 2048, HNSW index).

### config_change_proposals
Proposed configuration changes from the AI Config Assistant.
- Proposals are Zod-validated before submission
- Admin approves or rejects
- LLM never writes directly to database

### agent_tools
Tools enabled for an agent.

### phone_numbers
Numbers and telephony provider metadata.
- Plivo number provisioning requires India KYC compliance
- Number types: landline (080/022), 140-series, 160-series

### deployments
Agent-to-number deployment records and status.

### calls
Durable call records.
- Supports both inbound and outbound calls
- Supports three transports: chat_test, web_voice, real_call

### call_events
Lifecycle events, tool calls, errors and important runtime events.

### transcripts
Conversation transcript data.
- JSONB array of messages: [{role, content, timestamp, tool_calls?}]

### leads
Business leads created/updated by agents.

### appointments
Appointment records where NextLite is the system of record or integration record.

### subscriptions
Plan/subscription state.
- Cashfree subscription mandate integration

### payments
Payment provider transaction records.
- Cashfree payment records

### usage_records
Minute/token/character/other metering.
- Stores per-call: telephony_cost, stt_cost, tts_cost, llm_cost, infrastructure_cost, total_cost
- Provider pricing stored in configuration (not hardcoded)

### invoices
Billing documents/records where required.

### integrations
CRM/calendar/WhatsApp/etc. integration configuration.

### audit_logs
Security and configuration change history.

## Tenant isolation

Every client-owned record must be scoped by tenant ID.

Authorization must be enforced server-side. Never trust tenant IDs supplied by the frontend.

## Status fields

Agent:
- DRAFT
- READY
- LIVE
- PAUSED
- ARCHIVED

Deployment:
- NOT_DEPLOYED
- PAYMENT_PENDING
- PAYMENT_SUCCESS
- DEPLOYING
- VERIFYING
- ACTIVE
- FAILED
- DISCONNECTED

Subscription:
- PENDING
- PAYMENT_PENDING
- ACTIVE
- PAST_DUE
- CANCELLED
- EXPIRED

Call:
- INITIATED
- CONNECTED
- IN_PROGRESS
- COMPLETED
- FAILED
- NO_ANSWER
- BUSY

## Not building for MVP

The following entities are NOT required for MVP:
- Full RBAC tables (roles, permissions, role_permissions, user_roles) — using enum-based role field instead
- customer_contacts — agents manage callers transiently during calls
- call_recordings — transcripts are sufficient for MVP
- analytics_aggregates — compute on-the-fly or via background job
