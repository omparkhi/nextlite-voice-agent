# Database Forensic Parity Matrix

**Database Engine:** PostgreSQL 16+ with `pgvector` extension  
**Total Tables:** 20  
**Total Enums:** 13  
**Audit Date:** September 2026

---

## 1. Database Enums

| Enum Name | Postgres Identifier | Allowed Values |
| :--- | :--- | :--- |
| `versionStatusEnum` | `version_status` | `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| `deploymentEnvironmentEnum` | `deployment_environment` | `TEST`, `PRODUCTION` |
| `deploymentStatusEnum` | `deployment_status` | `ACTIVE`, `INACTIVE`, `ROLLED_BACK` |
| `userRoleEnum` | `user_role` | `ADMIN`, `CLIENT_OWNER`, `CLIENT_VIEWER` |
| `agentStatusEnum` | `agent_status` | `DRAFT`, `READY`, `LIVE`, `PAUSED`, `ARCHIVED` |
| `subscriptionStatusEnum` | `subscription_status` | `PENDING`, `PAYMENT_PENDING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `EXPIRED` |
| `knowledgeSourceStatusEnum` | `knowledge_source_status` | `PROCESSING`, `READY`, `FAILED` |
| `configProposalStatusEnum` | `config_proposal_status` | `PENDING`, `APPROVED`, `REJECTED` |
| `callDirectionEnum` | `call_direction` | `INBOUND`, `OUTBOUND`, `WEB_TEST` |
| `callStatusEnum` | `call_status` | `ACTIVE`, `COMPLETED`, `FAILED`, `MISSED` |
| `leadStatusEnum` | `lead_status` | `NEW`, `CONTACTED`, `QUALIFIED`, `CLOSED` |
| `appointmentStatusEnum` | `appointment_status` | `REQUESTED`, `CONFIRMED`, `CANCELLED` |
| `followUpStatusEnum` | `follow_up_status` | `PENDING`, `SENT`, `DELIVERED`, `FAILED` |

---

## 2. Table-by-Table Forensic Specifications

### `tenants`

- **Drizzle Variable:** `tenants`
- **Column Count:** 6
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `name` | `name` | `varchar` | False | False | None | None |
| `slug` | `slug` | `varchar` | False | False | None | None |
| `status` | `status` | `varchar` | False | False | None | `'active'` |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---

### `users`

- **Drizzle Variable:** `users`
- **Column Count:** 8
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | True | False | `tenants.id` | None |
| `email` | `email` | `varchar` | False | False | None | None |
| `passwordHash` | `password_hash` | `text` | False | False | None | None |
| `role` | `role` | `userRoleEnum` | False | False | None | None |
| `emailVerified` | `email_verified` | `boolean` | False | False | None | `false` |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---

### `refresh_tokens`

- **Drizzle Variable:** `refreshTokens`
- **Column Count:** 5
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `userId` | `user_id` | `uuid` | False | False | `users.id` | None |
| `token` | `token` | `text` | False | False | None | None |
| `expiresAt` | `expires_at` | `timestamp` | False | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `audit_logs`

- **Drizzle Variable:** `auditLogs`
- **Column Count:** 8
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | True | False | `tenants.id` | None |
| `actorId` | `actor_id` | `uuid` | True | False | `users.id` | None |
| `action` | `action` | `varchar` | False | False | None | None |
| `entityType` | `entity_type` | `varchar` | False | False | None | None |
| `entityId` | `entity_id` | `varchar` | True | False | None | None |
| `metadata` | `metadata` | `jsonb` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `verification_tokens`

- **Drizzle Variable:** `verificationTokens`
- **Column Count:** 7
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `userId` | `user_id` | `uuid` | False | False | `users.id` | None |
| `token` | `token` | `text` | False | False | None | None |
| `type` | `type` | `varchar` | False | False | None | None |
| `expiresAt` | `expires_at` | `timestamp` | False | False | None | None |
| `usedAt` | `used_at` | `timestamp` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `subscriptions`

- **Drizzle Variable:** `subscriptions`
- **Column Count:** 8
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `planName` | `plan_name` | `varchar` | True | False | None | None |
| `status` | `status` | `subscriptionStatusEnum` | False | False | None | `'PENDING'` |
| `startedAt` | `started_at` | `timestamp` | True | False | None | None |
| `currentPeriodEnd` | `current_period_end` | `timestamp` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---

### `agent_templates`

- **Drizzle Variable:** `agentTemplates`
- **Column Count:** 7
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `name` | `name` | `varchar` | False | False | None | None |
| `description` | `description` | `text` | False | False | None | None |
| `industry` | `industry` | `varchar` | False | False | None | None |
| `defaultConfiguration` | `default_configuration` | `jsonb` | False | False | None | None |
| `isSystem` | `is_system` | `boolean` | False | False | None | `true` |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `agents`

- **Drizzle Variable:** `agents`
- **Column Count:** 7
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `templateId` | `template_id` | `uuid` | False | False | `agentTemplates.id` | None |
| `name` | `name` | `varchar` | False | False | None | None |
| `status` | `status` | `agentStatusEnum` | False | False | None | `'DRAFT'` |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---

### `agent_versions`

- **Drizzle Variable:** `agentVersions`
- **Column Count:** 8
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `agentId` | `agent_id` | `uuid` | False | False | `agents.id` | None |
| `versionNumber` | `version_number` | `integer` | False | False | None | None |
| `configuration` | `configuration` | `jsonb` | False | False | None | None |
| `status` | `status` | `versionStatusEnum` | False | False | None | `'DRAFT'` |
| `createdBy` | `created_by` | `uuid` | False | False | `users.id` | None |
| `notes` | `notes` | `text` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `deployments`

- **Drizzle Variable:** `deployments`
- **Column Count:** 10
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `agentId` | `agent_id` | `uuid` | False | False | `agents.id` | None |
| `versionId` | `version_id` | `uuid` | False | False | `agentVersions.id` | None |
| `environment` | `environment` | `deploymentEnvironmentEnum` | False | False | None | `'TEST'` |
| `status` | `status` | `deploymentStatusEnum` | False | False | None | `'ACTIVE'` |
| `createdBy` | `created_by` | `uuid` | False | False | `users.id` | None |
| `deployedAt` | `deployed_at` | `timestamp` | False | False | None | `now()` |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---

### `agent_tools`

- **Drizzle Variable:** `agentTools`
- **Column Count:** 6
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `agentId` | `agent_id` | `uuid` | False | False | `agents.id` | None |
| `toolName` | `tool_name` | `varchar` | False | False | None | None |
| `toolConfig` | `tool_config` | `jsonb` | False | False | None | `{}` |
| `enabled` | `enabled` | `boolean` | False | False | None | `true` |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `knowledge_sources`

- **Drizzle Variable:** `knowledgeSources`
- **Column Count:** 10
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `agentId` | `agent_id` | `uuid` | False | False | `agents.id` | None |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `fileName` | `file_name` | `varchar` | False | False | None | None |
| `filePath` | `file_path` | `text` | False | False | None | None |
| `fileType` | `file_type` | `varchar` | False | False | None | None |
| `chunkCount` | `chunk_count` | `integer` | False | False | None | `0` |
| `contentHash` | `content_hash` | `varchar` | True | False | None | None |
| `status` | `status` | `knowledgeSourceStatusEnum` | False | False | None | `'PROCESSING'` |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `knowledge_chunks`

- **Drizzle Variable:** `knowledgeChunks`
- **Column Count:** 10
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `sourceId` | `source_id` | `uuid` | False | False | `knowledgeSources.id` | None |
| `agentId` | `agent_id` | `uuid` | False | False | `agents.id` | None |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `content` | `content` | `text` | False | False | None | None |
| `embedding` | `embedding` | `jsonb` | True | False | None | None |
| `chunkIndex` | `chunk_index` | `integer` | False | False | None | None |
| `tokenCount` | `token_count` | `integer` | True | False | None | None |
| `metadata` | `metadata` | `jsonb` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `config_change_proposals`

- **Drizzle Variable:** `configChangeProposals`
- **Column Count:** 12
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `agentId` | `agent_id` | `uuid` | False | False | `agents.id` | None |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `proposedBy` | `proposed_by` | `uuid` | False | False | `users.id` | None |
| `userMessage` | `user_message` | `text` | False | False | None | None |
| `currentConfig` | `current_config` | `jsonb` | False | False | None | None |
| `proposedConfig` | `proposed_config` | `jsonb` | False | False | None | None |
| `diff` | `diff` | `jsonb` | True | False | None | None |
| `status` | `status` | `configProposalStatusEnum` | False | False | None | `'PENDING'` |
| `reviewedBy` | `reviewed_by` | `uuid` | True | False | `users.id` | None |
| `reviewedAt` | `reviewed_at` | `timestamp` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `call_sessions`

- **Drizzle Variable:** `callSessions`
- **Column Count:** 17
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `agentId` | `agent_id` | `uuid` | False | False | `agents.id` | None |
| `deploymentId` | `deployment_id` | `uuid` | False | False | `deployments.id` | None |
| `roomName` | `room_name` | `varchar` | False | False | None | None |
| `callerNumber` | `caller_number` | `varchar` | True | False | None | None |
| `direction` | `direction` | `callDirectionEnum` | False | False | None | `'INBOUND'` |
| `status` | `status` | `callStatusEnum` | False | False | None | `'COMPLETED'` |
| `durationSeconds` | `duration_seconds` | `integer` | False | False | None | `0` |
| `primaryLanguage` | `primary_language` | `varchar` | True | False | None | `'en-IN'` |
| `startedAt` | `started_at` | `timestamp` | False | False | None | `now()` |
| `endedAt` | `ended_at` | `timestamp` | True | False | None | None |
| `transcriptText` | `transcript_text` | `text` | True | False | None | None |
| `turnsJson` | `turns_json` | `jsonb` | True | False | None | None |
| `toolsUsed` | `tools_used` | `jsonb` | True | False | None | None |
| `metricsJson` | `metrics_json` | `jsonb` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |

---

### `leads`

- **Drizzle Variable:** `leads`
- **Column Count:** 13
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `agentId` | `agent_id` | `uuid` | False | False | `agents.id` | None |
| `callSessionId` | `call_session_id` | `uuid` | True | False | `callSessions.id` | None |
| `customerName` | `customer_name` | `varchar` | False | False | None | None |
| `customerPhone` | `customer_phone` | `varchar` | False | False | None | None |
| `customerEmail` | `customer_email` | `varchar` | True | False | None | None |
| `interestCategory` | `interest_category` | `varchar` | True | False | None | None |
| `status` | `status` | `leadStatusEnum` | False | False | None | `'NEW'` |
| `notes` | `notes` | `text` | True | False | None | None |
| `metadata` | `metadata` | `jsonb` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---

### `appointments`

- **Drizzle Variable:** `appointments`
- **Column Count:** 16
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `agentId` | `agent_id` | `uuid` | False | False | `agents.id` | None |
| `callSessionId` | `call_session_id` | `uuid` | True | False | `callSessions.id` | None |
| `appointmentNumber` | `appointment_number` | `varchar` | True | False | None | None |
| `customerName` | `customer_name` | `varchar` | False | False | None | None |
| `customerPhone` | `customer_phone` | `varchar` | False | False | None | None |
| `title` | `title` | `varchar` | False | False | None | None |
| `resourceName` | `resource_name` | `varchar` | True | False | None | None |
| `bookingDate` | `booking_date` | `varchar` | False | False | None | None |
| `bookingTime` | `booking_time` | `varchar` | False | False | None | None |
| `status` | `status` | `appointmentStatusEnum` | False | False | None | `'REQUESTED'` |
| `notes` | `notes` | `text` | True | False | None | None |
| `metadata` | `metadata` | `jsonb` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---

### `tenant_appointment_counters`

- **Drizzle Variable:** `tenantAppointmentCounters`
- **Column Count:** 3
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tenantId` | `tenant_id` | `uuid` | True | True | `tenants.id` | None |
| `lastNumber` | `last_number` | `integer` | False | False | None | `0` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---

### `phone_numbers`

- **Drizzle Variable:** `phoneNumbers`
- **Column Count:** 9
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `agentId` | `agent_id` | `uuid` | True | False | `agents.id` | None |
| `deploymentId` | `deployment_id` | `uuid` | True | False | `deployments.id` | None |
| `phoneNumber` | `phone_number` | `varchar` | False | False | None | None |
| `provider` | `provider` | `varchar` | False | False | None | `'plivo'` |
| `status` | `status` | `varchar` | False | False | None | `'ACTIVE'` |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---

### `follow_ups`

- **Drizzle Variable:** `followUps`
- **Column Count:** 20
- **Columns:**

| Column | DB Field | Data Type | Nullable | Primary Key | Foreign Key | Default |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `uuid` | True | True | None | `gen_random_uuid()` |
| `tenantId` | `tenant_id` | `uuid` | False | False | `tenants.id` | None |
| `leadId` | `lead_id` | `uuid` | True | False | `leads.id` | None |
| `appointmentId` | `appointment_id` | `uuid` | True | False | `appointments.id` | None |
| `callSessionId` | `call_session_id` | `uuid` | True | False | `callSessions.id` | None |
| `customerName` | `customer_name` | `varchar` | True | False | None | None |
| `customerPhone` | `customer_phone` | `varchar` | False | False | None | None |
| `channel` | `channel` | `varchar` | False | False | None | `'WHATSAPP'` |
| `provider` | `provider` | `varchar` | False | False | None | `'DEMO'` |
| `messageType` | `message_type` | `varchar` | False | False | None | `'CUSTOM'` |
| `messageText` | `message_text` | `text` | False | False | None | None |
| `status` | `status` | `followUpStatusEnum` | False | False | None | `'SENT'` |
| `providerMessageId` | `provider_message_id` | `varchar` | True | False | None | None |
| `isDemo` | `is_demo` | `boolean` | False | False | None | `true` |
| `sentAt` | `sent_at` | `timestamp` | False | False | None | `now()` |
| `deliveredAt` | `delivered_at` | `timestamp` | True | False | None | None |
| `failedAt` | `failed_at` | `timestamp` | True | False | None | None |
| `metadata` | `metadata` | `jsonb` | True | False | None | None |
| `createdAt` | `created_at` | `timestamp` | False | False | None | `now()` |
| `updatedAt` | `updated_at` | `timestamp` | False | False | None | `now()` |

---