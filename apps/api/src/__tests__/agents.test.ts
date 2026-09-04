import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock database
vi.mock('../db', () => ({
  db: {
    query: {
      agentTemplates: { findMany: vi.fn(), findFirst: vi.fn() },
      agents: { findMany: vi.fn(), findFirst: vi.fn() },
      agentVersions: { findMany: vi.fn(), findFirst: vi.fn() },
      agentTools: { findMany: vi.fn() },
      deployments: { findMany: vi.fn(), findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{}]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

import { templateService, SYSTEM_TEMPLATES } from '../services/template';
import { agentService } from '../services/agent';
import { db } from '../db';

describe('Template Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have system templates defined', () => {
    expect(SYSTEM_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('should have valid configuration in each template', () => {
    for (const template of SYSTEM_TEMPLATES) {
      const config = template.defaultConfiguration;
      expect(config.identity).toBeDefined();
      expect(config.identity.agentName || config.identity.name).toBeTruthy();
      expect(config.identity.greeting).toBeTruthy();
      expect(config.role?.description || config.persona?.role).toBeTruthy();
      expect(config.goal?.primaryObjective || config.objective?.primaryObjective).toBeTruthy();
      expect(config.voice).toBeDefined();
      expect(config.voice.voiceId).toBeTruthy();
      expect(config.language).toBeDefined();
      expect(config.language.primary).toBeTruthy();
      expect(config.businessInformation).toBeDefined();
      expect(config.systemInstructions).toBeTruthy();
    }
  });

  it('should have templates for different industries', () => {
    const industries = new Set(SYSTEM_TEMPLATES.map(t => t.industry));
    expect(industries.has('Healthcare')).toBe(true);
    expect(industries.has('Finance')).toBe(true);
    expect(industries.has('Education')).toBe(true);
    expect(industries.has('Real Estate')).toBe(true);
    expect(industries.has('Automobile')).toBe(true);
  });

  it('listTemplates should query database', async () => {
    const mockTemplates = [{ id: '1', name: 'Test Template' }];
    (db.query.agentTemplates.findMany as any).mockResolvedValue(mockTemplates);

    const result = await templateService.listTemplates();
    expect(result).toEqual(mockTemplates);
    expect(db.query.agentTemplates.findMany).toHaveBeenCalled();
  });

  it('getTemplate should return a template by id', async () => {
    const mockTemplate = { id: '1', name: 'Test Template' };
    (db.query.agentTemplates.findFirst as any).mockResolvedValue(mockTemplate);

    const result = await templateService.getTemplate('1');
    expect(result).toEqual(mockTemplate);
  });

  it('getTemplate should return null for non-existent id', async () => {
    (db.query.agentTemplates.findFirst as any).mockResolvedValue(null);

    const result = await templateService.getTemplate('non-existent');
    expect(result).toBeNull();
  });
});

describe('Agent Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createAgent should throw for non-existent template', async () => {
    (db.query.agentTemplates.findFirst as any).mockResolvedValue(null);

    await expect(
      agentService.createAgent('tenant-1', 'non-existent-template', 'Test Agent', 'user-1')
    ).rejects.toThrow('Template not found');
  });

  it('getAgent should return null for non-existent agent', async () => {
    (db.query.agents.findFirst as any).mockResolvedValue(null);

    const result = await agentService.getAgent('non-existent', 'tenant-1');
    expect(result).toBeNull();
  });

  it('updateAgent should throw for non-existent agent', async () => {
    (db.query.agents.findFirst as any).mockResolvedValue(null);

    await expect(
      agentService.updateAgent('non-existent', 'tenant-1', { name: 'New Name' })
    ).rejects.toThrow('Agent not found');
  });

  it('saveConfiguration should throw for non-existent agent', async () => {
    (db.query.agents.findFirst as any).mockResolvedValue(null);

    const config = SYSTEM_TEMPLATES[0].defaultConfiguration;
    await expect(
      agentService.saveConfiguration('non-existent', 'tenant-1', config, 'user-1')
    ).rejects.toThrow('Agent not found');
  });

  it('getVersions should throw for non-existent agent', async () => {
    (db.query.agents.findFirst as any).mockResolvedValue(null);

    await expect(
      agentService.getVersions('non-existent', 'tenant-1')
    ).rejects.toThrow('Agent not found');
  });

  it('getVersion should throw for non-existent agent', async () => {
    (db.query.agents.findFirst as any).mockResolvedValue(null);

    await expect(
      agentService.getVersion('version-1', 'non-existent', 'tenant-1')
    ).rejects.toThrow('Agent not found');
  });

  it('getCurrentConfig should throw for non-existent agent', async () => {
    (db.query.agents.findFirst as any).mockResolvedValue(null);

    await expect(
      agentService.getCurrentConfig('non-existent', 'tenant-1')
    ).rejects.toThrow('Agent not found');
  });

  it('generateRuntimeConfig should throw for non-existent agent', async () => {
    (db.query.agents.findFirst as any).mockResolvedValue(null);

    await expect(
      agentService.generateRuntimeConfig('non-existent', 'tenant-1')
    ).rejects.toThrow('Agent not found');
  });
});

describe('Agent Configuration', () => {
  it('should have all required configuration sections', () => {
    const config = SYSTEM_TEMPLATES[0].defaultConfiguration;

    expect(config).toHaveProperty('identity');
    expect(config).toHaveProperty('role');
    expect(config).toHaveProperty('goal');
    expect(config).toHaveProperty('voice');
    expect(config).toHaveProperty('language');
    expect(config).toHaveProperty('personality');
    expect(config).toHaveProperty('businessInformation');
    expect(config).toHaveProperty('conversationRules');
    expect(config).toHaveProperty('appointmentRules');
    expect(config).toHaveProperty('leadRules');
    expect(config).toHaveProperty('escalationRules');
    expect(config).toHaveProperty('systemInstructions');
  });

  it('identity should have name and greeting', () => {
    const config = SYSTEM_TEMPLATES[0].defaultConfiguration;
    expect(typeof config.identity.name).toBe('string');
    expect(typeof config.identity.greeting).toBe('string');
  });

  it('voice should have voiceId and provider', () => {
    const config = SYSTEM_TEMPLATES[0].defaultConfiguration;
    expect(typeof config.voice.voiceId).toBe('string');
    expect(typeof config.voice.provider).toBe('string');
  });

  it('language should have primary and supported array', () => {
    const config = SYSTEM_TEMPLATES[0].defaultConfiguration;
    expect(typeof config.language.primary).toBe('string');
    expect(Array.isArray(config.language.supported)).toBe(true);
  });

  it('escalationRules should have triggerConditions array', () => {
    const config = SYSTEM_TEMPLATES[0].defaultConfiguration;
    expect(Array.isArray(config.escalationRules?.triggerConditions || config.guardrails?.escalationRules)).toBe(true);
  });

  it('leadRules should have requiredFields array', () => {
    const config = SYSTEM_TEMPLATES[0].defaultConfiguration;
    expect(Array.isArray(config.leadRules?.requiredFields || [])).toBe(true);
  });
});
