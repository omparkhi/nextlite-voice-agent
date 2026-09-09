import { describe, it, expect, vi } from 'vitest';
import {
  PLATFORM_TOOL_CATALOG,
  getPlatformToolCatalog,
  validateCatalogAlignment,
} from '../services/toolCatalog';
import { KNOWN_PLATFORM_TOOL_IDS } from '../services/template';
import { saveConfigSchema } from '../routes/agents';
import { ConfigAssistantServiceImpl } from '../services/config-assistant';
import type { LLMService } from '../services/llm';

describe('Module 1C-F-C: Platform Tool Catalog & Validation', () => {
  describe('Tool Catalog Discovery & Invariants', () => {
    it('1. should return all known registered platform tools', () => {
      const catalog = getPlatformToolCatalog();
      expect(Array.isArray(catalog)).toBe(true);
      expect(catalog.length).toBe(KNOWN_PLATFORM_TOOL_IDS.length);

      const catalogIds = catalog.map((t) => t.toolId);
      for (const id of KNOWN_PLATFORM_TOOL_IDS) {
        expect(catalogIds).toContain(id);
      }
    });

    it('2. should enforce catalog invariant alignment with registered platform tool IDs', () => {
      expect(() => validateCatalogAlignment()).not.toThrow();
    });

    it('3. should expose safe metadata and no secrets or private worker internals', () => {
      const catalog = getPlatformToolCatalog();
      for (const item of catalog) {
        expect(item.toolId).toBeDefined();
        expect(typeof item.displayName).toBe('string');
        expect(item.displayName.length).toBeGreaterThan(0);
        expect(typeof item.description).toBe('string');
        expect(item.description.length).toBeGreaterThan(0);
        expect(typeof item.category).toBe('string');
        expect(Array.isArray(item.parameters)).toBe(true);
        expect(typeof item.confirmationSupported).toBe('boolean');

        // Check that parameters have valid schema descriptors
        for (const p of item.parameters) {
          expect(typeof p.name).toBe('string');
          expect(typeof p.type).toBe('string');
          expect(typeof p.description).toBe('string');
          expect(typeof p.required).toBe('boolean');
        }

        // Security check: ensure no private keys or URLs are leaked
        const str = JSON.stringify(item);
        expect(str).not.toMatch(/secret|key|token|password|webhook|internal|http:\/\/|https:\/\//i);
      }
    });

    it('4. should be completely industry-independent and generic', () => {
      const catalog = getPlatformToolCatalog();
      const categories = catalog.map((t) => t.category);
      expect(categories).toContain('Knowledge');
      expect(categories).toContain('Leads');
      expect(categories).toContain('Scheduling');

      // Ensure no hardcoded industry names in tool categories
      expect(categories).not.toContain('Healthcare');
      expect(categories).not.toContain('Real Estate');
      expect(categories).not.toContain('Education');
      expect(categories).not.toContain('Automobile');
      expect(categories).not.toContain('Finance');
    });
  });

  describe('Agent Configuration Save Validation', () => {
    const validBaseConfig = {
      identity: { agentName: 'Test Agent', greeting: 'Hello' },
      language: { primary: 'en-IN', supported: ['en-IN'] },
      voice: { provider: 'sarvam', voiceId: 'shubh' },
      businessInformation: { businessName: 'Test Corp' },
    };

    it('5. should accept valid platform tool bindings', () => {
      const validPayload = {
        configuration: {
          ...validBaseConfig,
          tools: {
            enabled: true,
            bindings: [
              {
                toolId: 'book_appointment',
                name: 'book_appointment',
                description: 'Book consultation appointment',
                enabled: true,
                confirmationRequired: false,
              },
              {
                toolId: 'create_callback_lead',
                name: 'create_callback_lead',
                description: 'Record callback lead',
                enabled: false,
              },
            ],
          },
        },
      };

      const parsed = saveConfigSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.configuration.tools?.bindings?.length).toBe(2);
        expect(parsed.data.configuration.tools?.bindings?.[0].enabled).toBe(true);
        expect(parsed.data.configuration.tools?.bindings?.[1].enabled).toBe(false);
      }
    });

    it('6. should reject unknown or unauthorized toolId', () => {
      const invalidPayload = {
        configuration: {
          ...validBaseConfig,
          tools: {
            enabled: true,
            bindings: [
              {
                toolId: 'arbitrary_unauthorized_tool_id',
                name: 'arbitrary_tool',
                description: 'Unsafe execution',
                enabled: true,
              },
            ],
          },
        },
      };

      const parsed = saveConfigSchema.safeParse(invalidPayload);
      expect(parsed.success).toBe(false);
    });

    it('7. should reject duplicate toolId bindings in the same configuration', () => {
      const duplicatePayload = {
        configuration: {
          ...validBaseConfig,
          tools: {
            enabled: true,
            bindings: [
              {
                toolId: 'book_appointment',
                name: 'book_appointment_1',
                description: 'First booking tool',
                enabled: true,
              },
              {
                toolId: 'book_appointment',
                name: 'book_appointment_2',
                description: 'Second booking tool',
                enabled: false,
              },
            ],
          },
        },
      };

      const parsed = saveConfigSchema.safeParse(duplicatePayload);
      expect(parsed.success).toBe(false);
    });

    it('8. should preserve extra metadata / future-compatible properties on tool bindings', () => {
      const futurePayload = {
        configuration: {
          ...validBaseConfig,
          tools: {
            enabled: true,
            bindings: [
              {
                toolId: 'book_appointment',
                name: 'book_appointment',
                description: 'Book appointment',
                enabled: true,
                confirmationRequired: true,
                customFutureFlag: 'future_feature_value',
              },
            ],
          },
        },
      };

      const parsed = saveConfigSchema.safeParse(futurePayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        const binding = parsed.data.configuration.tools?.bindings?.[0] as any;
        expect(binding.customFutureFlag).toBe('future_feature_value');
        expect(binding.confirmationRequired).toBe(true);
      }
    });
  });

  describe('Config Assistant Tool Preservation & Safety', () => {
    it('9. Case 1: proposal omitting tools preserves currentConfig.tools', async () => {
      const mockLLM: LLMService = {
        chatWithJsonOutput: vi.fn().mockResolvedValue({
          identity: { greeting: 'Updated greeting by assistant' },
          voice: { voiceId: 'aditya', provider: 'sarvam' },
          language: { primary: 'hi-IN', supported: ['hi-IN'] },
          businessInformation: { businessName: 'Updated Biz' },
          // Tools omitted by LLM output!
        }),
      } as any;

      const service = new ConfigAssistantServiceImpl(mockLLM);

      // Mock DB calls
      const mockAgent = { id: 'agent-1', tenantId: 'tenant-1' };
      const currentTools = {
        enabled: true,
        bindings: [
          {
            toolId: 'book_appointment',
            name: 'book_appointment',
            description: 'Preserved booking tool',
            enabled: true,
          },
        ],
      };

      const mockVersion = {
        configuration: {
          identity: { greeting: 'Old greeting' },
          voice: { voiceId: 'shubh', provider: 'sarvam' },
          language: { primary: 'en-IN', supported: ['en-IN'] },
          businessInformation: { businessName: 'Old Biz' },
          tools: currentTools,
        },
      };

      // Spy on db.select
      const { db } = await import('../db');
      vi.spyOn(db, 'select').mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockVersion]),
            }),
          }),
        }),
      }) as any);

      vi.spyOn(db, 'insert').mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'prop-1',
              agentId: 'agent-1',
              tenantId: 'tenant-1',
              proposedBy: 'user-1',
              userMessage: 'Change greeting',
              currentConfig: mockVersion.configuration,
              proposedConfig: {
                ...mockVersion.configuration,
                identity: { greeting: 'Updated greeting by assistant' },
                tools: currentTools, // Preserved!
              },
              diff: {},
              status: 'PENDING',
              createdAt: new Date(),
            },
          ]),
        }),
      }) as any);

      const proposal = await service.proposeChange('tenant-1', 'agent-1', 'user-1', 'Change greeting');
      expect(proposal.proposedConfig.tools).toBeDefined();
      expect(proposal.proposedConfig.tools?.enabled).toBe(true);
      expect(proposal.proposedConfig.tools?.bindings?.length).toBe(1);
      expect(proposal.proposedConfig.tools?.bindings?.[0].toolId).toBe('book_appointment');
    });

    it('10. Case 2: proposal explicitly specifying tools updates tools', async () => {
      const explicitlyProposedTools = {
        enabled: true,
        bindings: [
          {
            toolId: 'create_callback_lead',
            name: 'create_callback_lead',
            description: 'Lead capture tool proposed by LLM',
            enabled: true,
          },
        ],
      };

      const mockLLM: LLMService = {
        chatWithJsonOutput: vi.fn().mockResolvedValue({
          identity: { greeting: 'New greeting' },
          voice: { voiceId: 'priya', provider: 'sarvam' },
          language: { primary: 'en-IN', supported: ['en-IN'] },
          businessInformation: { businessName: 'Test Biz' },
          tools: explicitlyProposedTools,
        }),
      } as any;

      const service = new ConfigAssistantServiceImpl(mockLLM);

      const mockAgent = { id: 'agent-1', tenantId: 'tenant-1' };
      const mockVersion = {
        configuration: {
          identity: { greeting: 'Old greeting' },
          voice: { voiceId: 'shubh', provider: 'sarvam' },
          language: { primary: 'en-IN', supported: ['en-IN'] },
          businessInformation: { businessName: 'Test Biz' },
          tools: { enabled: false, bindings: [] },
        },
      };

      const { db } = await import('../db');
      vi.spyOn(db, 'select').mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockVersion]),
            }),
          }),
        }),
      }) as any);

      vi.spyOn(db, 'insert').mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'prop-2',
              agentId: 'agent-1',
              tenantId: 'tenant-1',
              proposedBy: 'user-1',
              userMessage: 'Enable callback tool',
              currentConfig: mockVersion.configuration,
              proposedConfig: {
                ...mockVersion.configuration,
                tools: explicitlyProposedTools,
              },
              diff: {},
              status: 'PENDING',
              createdAt: new Date(),
            },
          ]),
        }),
      }) as any);

      const proposal = await service.proposeChange('tenant-1', 'agent-1', 'user-1', 'Enable callback tool');
      expect(proposal.proposedConfig.tools?.bindings?.[0].toolId).toBe('create_callback_lead');
    });

    it('11. Case 4: proposal with invalid tool ID is rejected by schema validation', async () => {
      const invalidProposedTools = {
        enabled: true,
        bindings: [
          {
            toolId: 'invalid_malicious_tool',
            name: 'invalid_tool',
            description: 'bad tool',
            enabled: true,
          },
        ],
      };

      const mockLLM: LLMService = {
        chatWithJsonOutput: vi.fn().mockResolvedValue({
          identity: { greeting: 'New greeting' },
          voice: { voiceId: 'priya', provider: 'sarvam' },
          language: { primary: 'en-IN', supported: ['en-IN'] },
          businessInformation: { businessName: 'Test Biz' },
          tools: invalidProposedTools,
        }),
      } as any;

      const service = new ConfigAssistantServiceImpl(mockLLM);

      const mockAgent = { id: 'agent-1', tenantId: 'tenant-1' };
      const mockVersion = {
        configuration: {
          identity: { greeting: 'Old greeting' },
          voice: { voiceId: 'shubh', provider: 'sarvam' },
          language: { primary: 'en-IN', supported: ['en-IN'] },
          businessInformation: { businessName: 'Test Biz' },
          tools: { enabled: true, bindings: [] },
        },
      };

      const { db } = await import('../db');
      vi.spyOn(db, 'select').mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockAgent]),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockVersion]),
            }),
          }),
        }),
      }) as any);

      await expect(
        service.proposeChange('tenant-1', 'agent-1', 'user-1', 'Add bad tool')
      ).rejects.toThrow();
    });
  });
});
