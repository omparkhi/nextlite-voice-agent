import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const versionStatusEnum = pgEnum('version_status', [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
]);

export const deploymentEnvironmentEnum = pgEnum('deployment_environment', [
  'TEST',
  'PRODUCTION',
]);

export const deploymentStatusEnum = pgEnum('deployment_status', [
  'ACTIVE',
  'INACTIVE',
  'ROLLED_BACK',
]);


export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'CLIENT_OWNER', 'CLIENT_VIEWER']);

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 255 }).notNull(),
  entityType: varchar('entity_type', { length: 255 }).notNull(),
  entityId: varchar('entity_id', { length: 255 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  type: varchar('type', { length: 50 }).notNull(), // 'email_verification' | 'password_reset'
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agentStatusEnum = pgEnum('agent_status', [
  'DRAFT',
  'READY',
  'LIVE',
  'PAUSED',
  'ARCHIVED',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'PENDING',
  'PAYMENT_PENDING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
]);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull().unique(),
  planName: varchar('plan_name', { length: 255 }),
  status: subscriptionStatusEnum('status').notNull().default('PENDING'),
  startedAt: timestamp('started_at'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Phase 2: Agent Builder ---

export const agentTemplates = pgTable('agent_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  industry: varchar('industry', { length: 100 }).notNull(),
  defaultConfiguration: jsonb('default_configuration').notNull(),
  isSystem: boolean('is_system').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  templateId: uuid('template_id').references(() => agentTemplates.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  status: agentStatusEnum('status').default('DRAFT').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const agentVersions = pgTable('agent_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  versionNumber: integer('version_number').notNull(),
  configuration: jsonb('configuration').notNull(),
  status: versionStatusEnum('status').default('DRAFT').notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deployments = pgTable('deployments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  versionId: uuid('version_id').references(() => agentVersions.id).notNull(),
  environment: deploymentEnvironmentEnum('environment').default('TEST').notNull(),
  status: deploymentStatusEnum('status').default('ACTIVE').notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  deployedAt: timestamp('deployed_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('deployments_tenant_idx').on(table.tenantId),
  index('deployments_agent_idx').on(table.agentId),
  index('deployments_version_idx').on(table.versionId),
  uniqueIndex('active_deployment_per_agent_env_idx')
    .on(table.agentId, table.environment)
    .where(sql`status = 'ACTIVE'`),
]);

export const agentTools = pgTable('agent_tools', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  toolName: varchar('tool_name', { length: 255 }).notNull(),
  toolConfig: jsonb('tool_config').default({}).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const knowledgeSourceStatusEnum = pgEnum('knowledge_source_status', [
  'PROCESSING',
  'READY',
  'FAILED',
]);

export const knowledgeSources = pgTable('knowledge_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  filePath: text('file_path').notNull(),
  fileType: varchar('file_type', { length: 50 }).notNull(),
  chunkCount: integer('chunk_count').default(0).notNull(),
  contentHash: varchar('content_hash', { length: 64 }),
  status: knowledgeSourceStatusEnum('status').default('PROCESSING').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').references(() => knowledgeSources.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  content: text('content').notNull(),
  embedding: jsonb('embedding').$type<number[]>(),
  chunkIndex: integer('chunk_index').notNull(),
  tokenCount: integer('token_count'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('knowledge_chunks_agent_idx').on(table.agentId),
  index('knowledge_chunks_tenant_agent_idx').on(table.tenantId, table.agentId),
]);

export const configProposalStatusEnum = pgEnum('config_proposal_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

export const configChangeProposals = pgTable('config_change_proposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  proposedBy: uuid('proposed_by').references(() => users.id).notNull(),
  userMessage: text('user_message').notNull(),
  currentConfig: jsonb('current_config').notNull(),
  proposedConfig: jsonb('proposed_config').notNull(),
  diff: jsonb('diff'),
  status: configProposalStatusEnum('status').default('PENDING').notNull(),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type AgentTemplate = typeof agentTemplates.$inferSelect;
export type NewAgentTemplate = typeof agentTemplates.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type AgentVersion = typeof agentVersions.$inferSelect;
export type NewAgentVersion = typeof agentVersions.$inferInsert;

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;

export type AgentTool = typeof agentTools.$inferSelect;
export type NewAgentTool = typeof agentTools.$inferInsert;

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSource = typeof knowledgeSources.$inferInsert;

export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;

export type ConfigChangeProposal = typeof configChangeProposals.$inferSelect;
export type NewConfigChangeProposal = typeof configChangeProposals.$inferInsert;

// Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  subscriptions: many(subscriptions),
  auditLogs: many(auditLogs),
  agents: many(agents),
  deployments: many(deployments),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  refreshTokens: many(refreshTokens),
  verificationTokens: many(verificationTokens),
  auditLogs: many(auditLogs),
  createdAgentVersions: many(agentVersions),
  createdDeployments: many(deployments),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [subscriptions.tenantId],
    references: [tenants.id],
  }),
}));

export const agentTemplatesRelations = relations(agentTemplates, ({ many }) => ({
  agents: many(agents),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [agents.tenantId],
    references: [tenants.id],
  }),
  template: one(agentTemplates, {
    fields: [agents.templateId],
    references: [agentTemplates.id],
  }),
  versions: many(agentVersions),
  tools: many(agentTools),
  knowledgeSources: many(knowledgeSources),
  knowledgeChunks: many(knowledgeChunks),
  configProposals: many(configChangeProposals),
  deployments: many(deployments),
}));

export const agentVersionsRelations = relations(agentVersions, ({ one, many }) => ({
  agent: one(agents, {
    fields: [agentVersions.agentId],
    references: [agents.id],
  }),
  createdByUser: one(users, {
    fields: [agentVersions.createdBy],
    references: [users.id],
  }),
  deployments: many(deployments),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [deployments.tenantId],
    references: [tenants.id],
  }),
  agent: one(agents, {
    fields: [deployments.agentId],
    references: [agents.id],
  }),
  version: one(agentVersions, {
    fields: [deployments.versionId],
    references: [agentVersions.id],
  }),
  createdByUser: one(users, {
    fields: [deployments.createdBy],
    references: [users.id],
  }),
}));


export const agentToolsRelations = relations(agentTools, ({ one }) => ({
  agent: one(agents, {
    fields: [agentTools.agentId],
    references: [agents.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const verificationTokensRelations = relations(verificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [verificationTokens.userId],
    references: [users.id],
  }),
}));

export const knowledgeSourcesRelations = relations(knowledgeSources, ({ one, many }) => ({
  agent: one(agents, {
    fields: [knowledgeSources.agentId],
    references: [agents.id],
  }),
  tenant: one(tenants, {
    fields: [knowledgeSources.tenantId],
    references: [tenants.id],
  }),
  chunks: many(knowledgeChunks),
}));

export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  source: one(knowledgeSources, {
    fields: [knowledgeChunks.sourceId],
    references: [knowledgeSources.id],
  }),
  agent: one(agents, {
    fields: [knowledgeChunks.agentId],
    references: [agents.id],
  }),
  tenant: one(tenants, {
    fields: [knowledgeChunks.tenantId],
    references: [tenants.id],
  }),
}));

export const configChangeProposalsRelations = relations(configChangeProposals, ({ one }) => ({
  agent: one(agents, {
    fields: [configChangeProposals.agentId],
    references: [agents.id],
  }),
  tenant: one(tenants, {
    fields: [configChangeProposals.tenantId],
    references: [tenants.id],
  }),
  proposedByUser: one(users, {
    fields: [configChangeProposals.proposedBy],
    references: [users.id],
  }),
  reviewedByUser: one(users, {
    fields: [configChangeProposals.reviewedBy],
    references: [users.id],
  }),
}));
