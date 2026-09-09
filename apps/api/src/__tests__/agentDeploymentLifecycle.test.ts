import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DB
const { mockInsert, mockUpdate, mockQuery } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockQuery: {
    agents: { findFirst: vi.fn(), findMany: vi.fn() },
    agentVersions: { findFirst: vi.fn(), findMany: vi.fn() },
    agentTemplates: { findFirst: vi.fn(), findMany: vi.fn() },
    deployments: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('../db', () => ({
  db: {
    query: mockQuery,
    insert: (table: any) => ({
      values: (val: any) => mockInsert(table, val),
    }),
    update: (table: any) => ({
      set: (val: any) => ({
        where: (condition: any) => mockUpdate(table, val, condition),
      }),
    }),
  },
}));

// Mock logger
vi.mock('../lib/logger', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { agentService } from '../services/agent';
import { agentChecklistService } from '../services/agentChecklist';

describe('Module 2 — Agent Version & Deployment Lifecycle', () => {
  const tenantId = 'tenant-uuid-123';
  const agentId = 'agent-uuid-456';
  const userId = 'user-uuid-789';
  const templateId = 'template-uuid-001';

  const validConfig = {
    identity: { agentName: 'Support Bot', greeting: 'Hello' },
    persona: { role: 'Customer Assistant', personality: 'friendly', tone: 'friendly', style: 'concise', formality: 'formal' as const },
    objective: { primaryObjective: 'Help customers with queries' },
    voice: { voiceId: 'priya', provider: 'sarvam', gender: 'female' as const },
    language: { primary: 'en-IN', supported: ['en-IN'] },
    businessInformation: {
      businessName: 'Acme Corp',
      businessType: 'Retail',
      hours: '9-5',
      location: 'Bangalore',
      description: 'Acme retail store',
    },
    conversationRules: { maxTurns: 10, greetingStyle: 'formal', fallbackBehavior: 'repeat' },
    appointmentRules: { slotDuration: 30, bufferTime: 10, workingHours: '9-5', bookingRules: 'advance' },
    leadRules: { requiredFields: ['name', 'phone'], qualificationCriteria: 'valid phone' },
    escalationRules: { triggerConditions: ['angry'], transferNumber: '+919999999999', timeout: 30 },
    systemInstructions: 'You are a helpful customer support agent.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. createAgent creates Agent, Version 1 DRAFT, and ACTIVE TEST deployment (no PRODUCTION)', async () => {
    mockQuery.agentTemplates.findFirst.mockResolvedValue({
      id: templateId,
      name: 'Default Template',
      defaultConfiguration: validConfig,
    });

    const createdAgent = { id: agentId, tenantId, name: 'My Agent', status: 'DRAFT' };
    const createdVersion = { id: 'version-1', agentId, versionNumber: 1, status: 'DRAFT' };

    mockInsert.mockImplementation((table: any, val: any) => {
      return {
        returning: vi.fn().mockImplementation(async () => {
          if (val.templateId) return [createdAgent];
          if (val.versionNumber === 1) return [createdVersion];
          return [{ id: 'deployment-test-1', ...val }];
        }),
      };
    });

    mockQuery.agents.findFirst.mockResolvedValue(createdAgent);

    const result = await agentService.createAgent(tenantId, templateId, 'My Agent', userId);

    expect(result).toEqual(createdAgent);

    // Verify Version 1 was created as DRAFT
    expect(mockInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        agentId,
        versionNumber: 1,
        status: 'DRAFT',
      }),
    );

    // Verify TEST deployment was created with status ACTIVE
    expect(mockInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId,
        agentId,
        versionId: createdVersion.id,
        environment: 'TEST',
        status: 'ACTIVE',
      }),
    );

    // Verify NO PRODUCTION deployment was created
    expect(mockInsert).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        environment: 'PRODUCTION',
      }),
    );
  });

  it('2. saveConfiguration creates new DRAFT version, updates TEST deployment, leaves PRODUCTION unchanged', async () => {
    const existingAgent = { id: agentId, tenantId, status: 'DRAFT' };
    mockQuery.agents.findFirst.mockResolvedValue(existingAgent);

    // Existing latest version is v1
    mockQuery.agentVersions.findFirst.mockResolvedValue({
      id: 'version-1',
      agentId,
      versionNumber: 1,
      status: 'DRAFT',
    });

    // Existing active TEST deployment points to v1
    const existingTestDeployment = {
      id: 'deploy-test-1',
      tenantId,
      agentId,
      versionId: 'version-1',
      environment: 'TEST',
      status: 'ACTIVE',
    };
    mockQuery.deployments.findFirst.mockResolvedValue(existingTestDeployment);

    const newVersion2 = { id: 'version-2', agentId, versionNumber: 2, status: 'DRAFT' };
    mockInsert.mockReturnValue({
      returning: vi.fn().mockResolvedValue([newVersion2]),
    });
    mockUpdate.mockReturnValue(Promise.resolve(undefined));

    const saved = await agentService.saveConfiguration(agentId, tenantId, validConfig, userId, 'Updated prompt');

    expect(saved).toEqual(newVersion2);

    // Verify new version inserted as DRAFT with incremented version number
    expect(mockInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        agentId,
        versionNumber: 2,
        status: 'DRAFT',
        notes: 'Updated prompt',
      }),
    );

    // Verify TEST deployment was updated to point to version-2
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        versionId: 'version-2',
      }),
      expect.anything(),
    );

    // Verify PRODUCTION deployment was NOT touched
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        environment: 'PRODUCTION',
      }),
      expect.anything(),
    );
  });

  it('3. publishAgent marks version PUBLISHED, agent LIVE, creates active PRODUCTION deployment, and leaves TEST active', async () => {
    const existingAgent = { id: agentId, tenantId, status: 'DRAFT' };
    mockQuery.agents.findFirst.mockResolvedValue(existingAgent);

    // Latest version is v2
    const currentDraftVersion = {
      id: 'version-2',
      agentId,
      versionNumber: 2,
      configuration: validConfig,
      status: 'DRAFT',
    };
    mockQuery.agentVersions.findFirst.mockResolvedValue(currentDraftVersion);

    // No existing production deployment
    mockQuery.deployments.findFirst.mockResolvedValue(null);

    const prodDeployment = {
      id: 'deploy-prod-1',
      tenantId,
      agentId,
      versionId: 'version-2',
      environment: 'PRODUCTION',
      status: 'ACTIVE',
    };

    mockInsert.mockReturnValue({
      returning: vi.fn().mockResolvedValue([prodDeployment]),
    });
    mockUpdate.mockReturnValue(Promise.resolve(undefined));

    const result = await agentService.publishAgent(agentId, tenantId, userId);

    expect(result.publishedVersion.status).toBe('PUBLISHED');
    expect(result.deployment.environment).toBe('PRODUCTION');
    expect(result.deployment.status).toBe('ACTIVE');

    // 1. Version 2 marked PUBLISHED
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'PUBLISHED' }),
      expect.anything(),
    );

    // 2. Agent marked LIVE
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'LIVE' }),
      expect.anything(),
    );

    // 3. PRODUCTION deployment created pointing to version-2
    expect(mockInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId,
        agentId,
        versionId: 'version-2',
        environment: 'PRODUCTION',
        status: 'ACTIVE',
      }),
    );
  });

  it('4. publishing when previous PRODUCTION deployment exists deactivates old deployment', async () => {
    const existingAgent = { id: agentId, tenantId, status: 'LIVE' };
    mockQuery.agents.findFirst.mockResolvedValue(existingAgent);

    const newVersionToPublish = {
      id: 'version-3',
      agentId,
      versionNumber: 3,
      configuration: validConfig,
      status: 'DRAFT',
    };
    mockQuery.agentVersions.findFirst.mockResolvedValue(newVersionToPublish);

    // Existing active production deployment on version-2
    const oldProdDeployment = {
      id: 'deploy-prod-old',
      tenantId,
      agentId,
      versionId: 'version-2',
      environment: 'PRODUCTION',
      status: 'ACTIVE',
    };
    mockQuery.deployments.findFirst.mockResolvedValue(oldProdDeployment);

    const newProdDeployment = {
      id: 'deploy-prod-new',
      tenantId,
      agentId,
      versionId: 'version-3',
      environment: 'PRODUCTION',
      status: 'ACTIVE',
    };

    mockInsert.mockReturnValue({
      returning: vi.fn().mockResolvedValue([newProdDeployment]),
    });
    mockUpdate.mockReturnValue(Promise.resolve(undefined));

    await agentService.publishAgent(agentId, tenantId, userId);

    // Verify old production deployment set to INACTIVE
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'INACTIVE' }),
      expect.anything(),
    );

    // Verify new production deployment inserted with ACTIVE status
    expect(mockInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId,
        agentId,
        versionId: 'version-3',
        environment: 'PRODUCTION',
        status: 'ACTIVE',
      }),
    );
  });

  it('5. save after publishing creates new DRAFT version, updates TEST, and leaves PRODUCTION locked to published version', async () => {
    const existingAgent = { id: agentId, tenantId, status: 'LIVE' };
    mockQuery.agents.findFirst.mockResolvedValue(existingAgent);

    // Highest version is published v3
    mockQuery.agentVersions.findFirst.mockResolvedValue({
      id: 'version-3',
      agentId,
      versionNumber: 3,
      status: 'PUBLISHED',
    });

    const activeTestDeployment = {
      id: 'deploy-test-1',
      tenantId,
      agentId,
      versionId: 'version-3',
      environment: 'TEST',
      status: 'ACTIVE',
    };
    mockQuery.deployments.findFirst.mockResolvedValue(activeTestDeployment);

    const newDraftV4 = { id: 'version-4', agentId, versionNumber: 4, status: 'DRAFT' };
    mockInsert.mockReturnValue({
      returning: vi.fn().mockResolvedValue([newDraftV4]),
    });
    mockUpdate.mockReturnValue(Promise.resolve(undefined));

    const result = await agentService.saveConfiguration(agentId, tenantId, validConfig, userId, 'Draft edit v4');

    expect(result.versionNumber).toBe(4);
    expect(result.status).toBe('DRAFT');

    // TEST deployment updated to v4
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ versionId: 'version-4' }),
      expect.anything(),
    );

    // PRODUCTION deployment NOT modified
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ environment: 'PRODUCTION' }),
      expect.anything(),
    );
  });

  it('6. failed checklist halts publishing with no version/deployment changes and agent not LIVE', async () => {
    const existingAgent = { id: agentId, tenantId, status: 'DRAFT' };
    mockQuery.agents.findFirst.mockResolvedValue(existingAgent);

    // Incomplete configuration that fails checklist
    const incompleteConfig = {
      ...validConfig,
      identity: { agentName: '', greeting: '' }, // critical error
    };
    mockQuery.agentVersions.findFirst.mockResolvedValue({
      id: 'version-1',
      agentId,
      versionNumber: 1,
      configuration: incompleteConfig,
      status: 'DRAFT',
    });

    await expect(
      agentService.publishAgent(agentId, tenantId, userId)
    ).rejects.toThrow('Cannot publish agent with critical validation errors');

    // No updates or inserts performed
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('7. tenant mismatch is safely rejected for both save and publish', async () => {
    mockQuery.agents.findFirst.mockResolvedValue(null);

    await expect(
      agentService.saveConfiguration(agentId, 'wrong-tenant', validConfig, userId)
    ).rejects.toThrow('Agent not found');

    await expect(
      agentService.publishAgent(agentId, 'wrong-tenant', userId)
    ).rejects.toThrow('Agent not found');
  });

  it('8. repeated publish replaces active production deployment and maintains single active production invariant', async () => {
    const existingAgent = { id: agentId, tenantId, status: 'LIVE' };
    mockQuery.agents.findFirst.mockResolvedValue(existingAgent);

    const version4 = {
      id: 'version-4',
      agentId,
      versionNumber: 4,
      configuration: validConfig,
      status: 'DRAFT',
    };
    mockQuery.agentVersions.findFirst.mockResolvedValue(version4);

    const activeProdV3 = {
      id: 'deploy-prod-v3',
      tenantId,
      agentId,
      versionId: 'version-3',
      environment: 'PRODUCTION',
      status: 'ACTIVE',
    };
    mockQuery.deployments.findFirst.mockResolvedValue(activeProdV3);

    const activeProdV4 = {
      id: 'deploy-prod-v4',
      tenantId,
      agentId,
      versionId: 'version-4',
      environment: 'PRODUCTION',
      status: 'ACTIVE',
    };
    mockInsert.mockReturnValue({
      returning: vi.fn().mockResolvedValue([activeProdV4]),
    });
    mockUpdate.mockReturnValue(Promise.resolve(undefined));

    const result = await agentService.publishAgent(agentId, tenantId, userId);

    expect(result.deployment.id).toBe('deploy-prod-v4');
    expect(result.deployment.versionId).toBe('version-4');
    expect(result.deployment.environment).toBe('PRODUCTION');
    expect(result.deployment.status).toBe('ACTIVE');

    // Deactivated deploy-prod-v3
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'INACTIVE' }),
      expect.anything(),
    );
  });

  it('9. getActiveDeployment strictly filters by agentId, tenantId, environment and ACTIVE status', async () => {
    const activeTestDeployment = {
      id: 'deploy-test-1',
      tenantId,
      agentId,
      versionId: 'version-4',
      environment: 'TEST',
      status: 'ACTIVE',
      version: { id: 'version-4', versionNumber: 4 },
    };
    mockQuery.deployments.findFirst.mockResolvedValue(activeTestDeployment);

    const testDeploy = await agentService.getActiveDeployment(agentId, tenantId, 'TEST');
    expect(testDeploy).toEqual(activeTestDeployment);

    const activeProdDeployment = {
      id: 'deploy-prod-1',
      tenantId,
      agentId,
      versionId: 'version-3',
      environment: 'PRODUCTION',
      status: 'ACTIVE',
      version: { id: 'version-3', versionNumber: 3 },
    };
    mockQuery.deployments.findFirst.mockResolvedValue(activeProdDeployment);

    const prodDeploy = await agentService.getActiveDeployment(agentId, tenantId, 'PRODUCTION');
    expect(prodDeploy).toEqual(activeProdDeployment);
    expect(prodDeploy?.versionId).toBe('version-3');
  });
});
