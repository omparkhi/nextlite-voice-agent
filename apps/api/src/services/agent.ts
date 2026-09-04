import { db } from '../db';
import { agents, agentVersions, agentTools, agentTemplates, deployments } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createChildLogger } from '../lib/logger';
import { AgentConfiguration, templateService } from './template';
import { agentChecklistService } from './agentChecklist';

const logger = createChildLogger({ module: 'agent-service' });

export class AgentService {
  async listAgents(tenantId: string) {
    return db.query.agents.findMany({
      where: eq(agents.tenantId, tenantId),
      with: {
        template: { columns: { id: true, name: true, industry: true } },
        versions: { columns: { versionNumber: true, createdAt: true }, orderBy: (v, { desc }) => [desc(v.versionNumber)], limit: 1 },
      },
      orderBy: (a, { desc }) => [desc(a.updatedAt)],
    });
  }

  async getAgent(agentId: string, tenantId: string) {
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
      with: {
        template: { columns: { id: true, name: true, industry: true, description: true } },
        versions: {
          orderBy: (v, { desc }) => [desc(v.versionNumber)],
          with: { createdByUser: { columns: { id: true, email: true } } },
        },
        tools: true,
      },
    });
    return agent;
  }

  async createAgent(tenantId: string, templateId: string, name: string, createdBy: string) {
    const template = await templateService.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const now = new Date();
    const [agent] = await db.insert(agents).values({
      tenantId,
      templateId,
      name,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
    }).returning();

    const config = template.defaultConfiguration as any;
    const [version] = await db.insert(agentVersions).values({
      agentId: agent.id,
      versionNumber: 1,
      configuration: config,
      status: 'DRAFT',
      createdBy,
      notes: 'Initial configuration from template',
      createdAt: now,
    }).returning();

    // Create initial ACTIVE TEST deployment (pointing to draft version 1)
    await db.insert(deployments).values({
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      environment: 'TEST',
      status: 'ACTIVE',
      createdBy,
      deployedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    logger.info({ agentId: agent.id, tenantId, templateId, versionId: version.id }, 'Agent created with initial TEST deployment');

    return this.getAgent(agent.id, tenantId);
  }

  async updateAgent(agentId: string, tenantId: string, updates: { name?: string; status?: string }) {
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (updates.name) updateData.name = updates.name;
    if (updates.status) updateData.status = updates.status;

    await db.update(agents).set(updateData).where(eq(agents.id, agentId));

    return this.getAgent(agentId, tenantId);
  }

  async saveConfiguration(agentId: string, tenantId: string, configuration: AgentConfiguration, createdBy: string, notes?: string) {
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    const latestVersion = await db.query.agentVersions.findFirst({
      where: eq(agentVersions.agentId, agentId),
      orderBy: (v, { desc }) => [desc(v.versionNumber)],
    });

    const nextVersion = latestVersion ? latestVersion.versionNumber + 1 : 1;
    const now = new Date();

    const [newVersion] = await db.insert(agentVersions).values({
      agentId,
      versionNumber: nextVersion,
      configuration: configuration as any,
      status: 'DRAFT',
      createdBy,
      notes: notes || `Configuration version ${nextVersion}`,
      createdAt: now,
    }).returning();

    await db.update(agents).set({ updatedAt: now }).where(eq(agents.id, agentId));

    // Update or upsert active TEST deployment to point to the new draft version
    const existingTestDeployment = await db.query.deployments.findFirst({
      where: and(
        eq(deployments.agentId, agentId),
        eq(deployments.tenantId, tenantId),
        eq(deployments.environment, 'TEST'),
        eq(deployments.status, 'ACTIVE'),
      ),
    });

    if (existingTestDeployment) {
      await db
        .update(deployments)
        .set({
          versionId: newVersion.id,
          deployedAt: now,
          updatedAt: now,
        })
        .where(eq(deployments.id, existingTestDeployment.id));
    } else {
      await db.insert(deployments).values({
        tenantId,
        agentId,
        versionId: newVersion.id,
        environment: 'TEST',
        status: 'ACTIVE',
        createdBy,
        deployedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    logger.info(
      { agentId, versionNumber: nextVersion, versionId: newVersion.id },
      'Agent configuration saved and TEST deployment updated',
    );

    return newVersion;
  }

  async publishAgent(agentId: string, tenantId: string, publishedBy: string) {
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    const latestVersion = await db.query.agentVersions.findFirst({
      where: eq(agentVersions.agentId, agentId),
      orderBy: (v, { desc }) => [desc(v.versionNumber)],
    });
    if (!latestVersion) {
      throw new Error('No agent version available to publish');
    }

    // Evaluate checklist
    const checklist = agentChecklistService.evaluateAgent(latestVersion.configuration as any);
    if (!checklist.canPublish) {
      const error: any = new Error('Cannot publish agent with critical validation errors');
      error.checklist = checklist;
      throw error;
    }

    const now = new Date();

    // 1. Mark selected version as PUBLISHED (immutable)
    await db
      .update(agentVersions)
      .set({ status: 'PUBLISHED' })
      .where(eq(agentVersions.id, latestVersion.id));

    // 2. Set Agent status as LIVE
    await db
      .update(agents)
      .set({ status: 'LIVE', updatedAt: now })
      .where(eq(agents.id, agentId));

    // 3. Find any existing active PRODUCTION deployment and deactivate it
    const existingProdDeployment = await db.query.deployments.findFirst({
      where: and(
        eq(deployments.agentId, agentId),
        eq(deployments.tenantId, tenantId),
        eq(deployments.environment, 'PRODUCTION'),
        eq(deployments.status, 'ACTIVE'),
      ),
    });

    if (existingProdDeployment) {
      await db
        .update(deployments)
        .set({ status: 'INACTIVE', updatedAt: now })
        .where(eq(deployments.id, existingProdDeployment.id));
    }

    // 4. Create new active PRODUCTION deployment pointing to the published version
    const [prodDeployment] = await db.insert(deployments).values({
      tenantId,
      agentId,
      versionId: latestVersion.id,
      environment: 'PRODUCTION',
      status: 'ACTIVE',
      createdBy: publishedBy,
      deployedAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning();

    logger.info(
      {
        agentId,
        tenantId,
        versionId: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
        productionDeploymentId: prodDeployment.id,
      },
      'Agent published successfully and PRODUCTION deployment activated',
    );

    const updatedAgent = await this.getAgent(agentId, tenantId);
    return {
      agent: updatedAgent,
      publishedVersion: { ...latestVersion, status: 'PUBLISHED' },
      deployment: prodDeployment,
      checklist,
    };
  }

  async getActiveDeployment(agentId: string, tenantId: string, environment: 'TEST' | 'PRODUCTION') {
    return db.query.deployments.findFirst({
      where: and(
        eq(deployments.agentId, agentId),
        eq(deployments.tenantId, tenantId),
        eq(deployments.environment, environment),
        eq(deployments.status, 'ACTIVE'),
      ),
      with: {
        version: true,
      },
    });
  }

  async getVersions(agentId: string, tenantId: string) {
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    return db.query.agentVersions.findMany({
      where: eq(agentVersions.agentId, agentId),
      orderBy: (v, { desc }) => [desc(v.versionNumber)],
      with: { createdByUser: { columns: { id: true, email: true } } },
    });
  }

  async getVersion(versionId: string, agentId: string, tenantId: string) {
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    return db.query.agentVersions.findFirst({
      where: and(eq(agentVersions.id, versionId), eq(agentVersions.agentId, agentId)),
      with: { createdByUser: { columns: { id: true, email: true } } },
    });
  }

  async getCurrentConfig(agentId: string, tenantId: string) {
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    const latestVersion = await db.query.agentVersions.findFirst({
      where: eq(agentVersions.agentId, agentId),
      orderBy: (v, { desc }) => [desc(v.versionNumber)],
    });

    return latestVersion?.configuration as AgentConfiguration | null;
  }

  async generateRuntimeConfig(agentId: string, tenantId: string) {
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
      with: { template: true },
    });
    if (!agent) {
      throw new Error('Agent not found');
    }

    const config = await this.getCurrentConfig(agentId, tenantId);
    if (!config) {
      return null;
    }

    const tools = await db.query.agentTools.findMany({
      where: eq(agentTools.agentId, agentId),
    });

    const systemPrompt = this.buildSystemPrompt(config);

    return {
      agentId: agent.id,
      agentName: agent.name,
      status: agent.status,
      templateName: agent.template?.name,
      configuration: config,
      systemPrompt,
      tools: tools.filter(t => t.enabled).map(t => ({
        name: t.toolName,
        config: t.toolConfig,
      })),
      voice: config.voice,
      language: config.language,
    };
  }

  private buildSystemPrompt(config: AgentConfiguration): string {
    const { promptCompiler } = require('./promptCompiler');
    return promptCompiler.compileAgentPrompt({ configuration: config });
  }
}

export const agentService = new AgentService();

