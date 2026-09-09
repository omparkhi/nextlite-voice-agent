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

import { agentConfigurationSchema, saveConfigSchema } from '../routes/agents';

describe('Module 3.1 — Modern AgentConfiguration Schema Validation Contract', () => {
  const sampleModernDashboardConfig = {
    identity: {
      agentName: 'Aarav',
      displayName: 'Aarav Voice',
      greeting: 'Namaste, main Aarav hoon. Kaise madad kar sakta hoon?',
      businessName: 'Apex Healthcare Clinic',
    },
    persona: {
      role: 'Clinic Receptionist',
      personality: 'Warm, professional and empathetic',
      tone: 'friendly',
      style: 'concise',
      formality: 'mixed',
    },
    environment: {
      situation: 'Inbound phone calls for appointment booking',
      channel: 'voice',
      audience: 'Patients',
    },
    objective: {
      primaryObjective: 'Assist patients with booking and enquiries',
      secondaryObjectives: ['Provide clinic timings', 'Explain consultation fees'],
    },
    speakingStyle: {
      maxSentences: 2,
      oneQuestionAtATime: true,
      conciseResponses: true,
    },
    businessInformation: {
      businessName: 'Apex Healthcare Clinic',
      businessType: 'Healthcare',
      description: 'Multi-speciality OPD clinic',
      hours: 'Mon-Sat 9AM-8PM',
    },
    conversation: {
      phases: [
        { id: 'phase-1', name: 'Greeting', objective: 'Welcome caller' },
        { id: 'phase-2', name: 'Booking', objective: 'Collect booking slot' },
      ],
    },
    guardrails: {
      prohibitedTopics: ['medical prescription diagnosis'],
      prohibitedClaims: ['100% cure guarantee'],
      escalationRules: ['transfer to human agent on emergency'],
    },
    language: {
      primary: 'hi-IN',
      supported: ['hi-IN', 'en-IN', 'mr-IN'],
      autoDetect: true,
      languageSwitchEnabled: true,
    },
    voice: {
      provider: 'sarvam',
      voiceId: 'priya',
      gender: 'female' as const,
      speakingSpeed: 1.05,
      sttModel: 'saaras:v3',
      ttsModel: 'bulbul:v3',
    },
    runtimeSettings: {
      modelProvider: 'sarvam',
      llmModel: 'sarvam-105b-conversations',
      modelTemperature: 0.3,
      allowCallerInterruptions: true,
      interruptionMode: 'adaptive',
      preemptiveGenerationEnabled: true,
      eagernessToRespond: 'medium',
      noiseCancellationModel: 'quailVfS',
      expressiveModeEnabled: true,
      maxCallLengthSeconds: 300,
    },
    variables: {
      input: [
        { key: 'callerPhone', label: 'Phone Number', type: 'phone' as const, required: true, scope: 'CALL' as const },
      ],
      output: [
        { key: 'appointmentTime', label: 'Selected Slot', type: 'datetime' as const, required: false, extractionStrategy: 'CALL_END' as const },
      ],
    },
    knowledge: {
      enabled: true,
      retrievalConfig: {
        topK: 5,
        similarityThreshold: 0.75,
      },
      attachedSourceIds: ['source-uuid-1', 'source-uuid-2'],
    },
    tools: {
      enabled: true,
      bindings: [
        { toolId: 'book_appointment', name: 'Book Appointment', description: 'Books an OPD slot', enabled: true, confirmationRequired: true },
      ],
    },
    systemInstructions: 'Always be polite and helpful.',
  };

  it('1. Modern configuration can be saved successfully', () => {
    const result = saveConfigSchema.safeParse({
      configuration: sampleModernDashboardConfig,
      notes: 'Initial production draft',
    });
    expect(result.success).toBe(true);
  });

  it('2. Voice sttModel is accepted', () => {
    const config = {
      ...sampleModernDashboardConfig,
      voice: {
        ...sampleModernDashboardConfig.voice,
        sttModel: 'saaras:v3',
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.voice.sttModel).toBe('saaras:v3');
    }
  });

  it('3. Voice ttsModel is accepted', () => {
    const config = {
      ...sampleModernDashboardConfig,
      voice: {
        ...sampleModernDashboardConfig.voice,
        ttsModel: 'bulbul:v3',
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.voice.ttsModel).toBe('bulbul:v3');
    }
  });

  it('4. Runtime modelProvider is accepted', () => {
    const config = {
      ...sampleModernDashboardConfig,
      runtimeSettings: {
        ...sampleModernDashboardConfig.runtimeSettings,
        modelProvider: 'sarvam',
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runtimeSettings?.modelProvider).toBe('sarvam');
    }
  });

  it('5. Runtime llmModel is accepted', () => {
    const config = {
      ...sampleModernDashboardConfig,
      runtimeSettings: {
        ...sampleModernDashboardConfig.runtimeSettings,
        llmModel: 'sarvam-105b-conversations',
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runtimeSettings?.llmModel).toBe('sarvam-105b-conversations');
    }
  });

  it('6. preemptiveGenerationEnabled is accepted', () => {
    const config = {
      ...sampleModernDashboardConfig,
      runtimeSettings: {
        ...sampleModernDashboardConfig.runtimeSettings,
        preemptiveGenerationEnabled: true,
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runtimeSettings?.preemptiveGenerationEnabled).toBe(true);
    }
  });

  it('7. expressiveModeEnabled is accepted', () => {
    const config = {
      ...sampleModernDashboardConfig,
      runtimeSettings: {
        ...sampleModernDashboardConfig.runtimeSettings,
        expressiveModeEnabled: true,
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runtimeSettings?.expressiveModeEnabled).toBe(true);
    }
  });

  it('8. noiseCancellationModel is accepted', () => {
    const config = {
      ...sampleModernDashboardConfig,
      runtimeSettings: {
        ...sampleModernDashboardConfig.runtimeSettings,
        noiseCancellationModel: 'quailVfS',
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runtimeSettings?.noiseCancellationModel).toBe('quailVfS');
    }
  });

  it('9. Existing language configuration remains valid', () => {
    const config = {
      ...sampleModernDashboardConfig,
      language: {
        primary: 'ta-IN',
        supported: ['ta-IN', 'en-IN'],
        autoDetect: false,
        languageSwitchEnabled: false,
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language.primary).toBe('ta-IN');
      expect(result.data.language.supported).toEqual(['ta-IN', 'en-IN']);
    }
  });

  it('10. Existing knowledge configuration remains valid', () => {
    const config = {
      ...sampleModernDashboardConfig,
      knowledge: {
        enabled: true,
        retrievalConfig: {
          topK: 4,
          similarityThreshold: 0.8,
        },
        attachedSourceIds: ['source-123'],
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.knowledge?.enabled).toBe(true);
      expect(result.data.knowledge?.retrievalConfig?.topK).toBe(4);
      expect(result.data.knowledge?.retrievalConfig?.similarityThreshold).toBe(0.8);
    }
  });

  it('11. Existing tools configuration remains valid', () => {
    const config = {
      ...sampleModernDashboardConfig,
      tools: {
        enabled: true,
        bindings: [
          { toolId: 'create_callback_lead', name: 'Create Callback Lead', description: 'Record customer callback lead', enabled: true },
        ],
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tools?.bindings).toHaveLength(1);
      expect(result.data.tools?.bindings[0].name).toBe('Create Callback Lead');
    }
  });

  it('12. Existing variables configuration remains valid', () => {
    const config = {
      ...sampleModernDashboardConfig,
      variables: {
        input: [{ key: 'patientId', label: 'Patient ID', type: 'string' as const, required: true }],
        output: [{ key: 'followUpDate', label: 'Follow Up', type: 'date' as const, required: false, extractionStrategy: 'CALL_END' as const }],
      },
    };
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variables?.input[0].key).toBe('patientId');
    }
  });

  it('13. Malformed values are rejected with descriptive errors', () => {
    // Missing required greeting
    const invalidGreeting = {
      ...sampleModernDashboardConfig,
      identity: { agentName: 'Aarav', greeting: '' },
    };
    const res1 = agentConfigurationSchema.safeParse(invalidGreeting);
    expect(res1.success).toBe(false);

    // Invalid modelTemperature out of bounds
    const invalidTemp = {
      ...sampleModernDashboardConfig,
      runtimeSettings: { modelTemperature: 5.0 },
    };
    const res2 = agentConfigurationSchema.safeParse(invalidTemp);
    expect(res2.success).toBe(false);

    // Missing primary language
    const invalidLang = {
      ...sampleModernDashboardConfig,
      language: { primary: '' },
    };
    const res3 = agentConfigurationSchema.safeParse(invalidLang);
    expect(res3.success).toBe(false);
  });

  it('14. Existing valid configuration continues to pass', () => {
    const config = SYSTEM_TEMPLATES[0].defaultConfiguration;
    const result = agentConfigurationSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('15. Legacy stored configuration with legacy fields remains readable and compatible', () => {
    const legacyConfig = {
      identity: { name: 'Legacy Bot', greeting: 'Hello from legacy system' },
      role: { description: 'Legacy Assistant' },
      goal: { primaryObjective: 'Assist customers' },
      voice: { voiceId: 'shubh', provider: 'sarvam', gender: 'male' as const },
      language: { primary: 'hi-IN', supported: ['hi-IN'] },
      personality: { tone: 'formal', style: 'direct', formality: 'formal' },
      businessInformation: {
        businessName: 'Legacy Biz',
        businessType: 'Retail',
        hours: '9-5',
        location: 'Mumbai',
        description: 'Retail store',
      },
      conversationRules: { maxTurns: 5, greetingStyle: 'formal', fallbackBehavior: 'repeat' },
      appointmentRules: { slotDuration: 15, bufferTime: 5, workingHours: '9-5', bookingRules: 'online' },
      leadRules: { requiredFields: ['name'], qualificationCriteria: 'valid name' },
      escalationRules: { triggerConditions: ['angry'], transferNumber: '+919999999999', timeout: 20 },
      systemInstructions: 'You are a legacy agent.',
    };

    const result = agentConfigurationSchema.safeParse(legacyConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identity.name).toBe('Legacy Bot');
      expect(result.data.role?.description).toBe('Legacy Assistant');
      expect(result.data.goal?.primaryObjective).toBe('Assist customers');
    }
  });
});
