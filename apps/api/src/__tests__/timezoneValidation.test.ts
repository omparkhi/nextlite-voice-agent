import { describe, it, expect } from 'vitest';
import { saveConfigSchema } from '../routes/agents';
import { buildRuntimeAgentConfig } from '../services/runtimeAgentConfig';
import type { AgentConfiguration } from '../services/template';

describe('Generic Business Timezone Architecture & Validation (Module 1C-F-D)', () => {
  const validBaseConfig = {
    identity: { agentName: 'Test Agent', greeting: 'Hello' },
    language: { primary: 'en-IN', supported: ['en-IN'] },
    voice: { provider: 'sarvam', voiceId: 'shubh' },
  };

  describe('1. Zod Schema Validation for IANA Timezone', () => {
    it('1. accepts valid IANA timezone identifiers across regions', () => {
      const validZones = [
        'Asia/Kolkata',
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Asia/Dubai',
        'Asia/Singapore',
        'Asia/Tokyo',
        'Australia/Sydney',
        'UTC',
      ];

      for (const tz of validZones) {
        const payload = {
          configuration: {
            ...validBaseConfig,
            businessInformation: {
              businessName: 'Global Clinic',
              timezone: tz,
            },
          },
        };
        const result = saveConfigSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.configuration.businessInformation?.timezone).toBe(tz);
        }
      }
    });

    it('2. rejects invalid or malformed IANA timezone identifiers with clear error', () => {
      const invalidZones = [
        'Invalid/Nonexistent_Timezone_12345',
        'Mars/Olympus_Mons',
        'America/NonExistentCity',
        'Kolkata/India',
      ];

      for (const tz of invalidZones) {
        const payload = {
          configuration: {
            ...validBaseConfig,
            businessInformation: {
              businessName: 'Invalid Corp',
              timezone: tz,
            },
          },
        };
        const result = saveConfigSchema.safeParse(payload);
        expect(result.success).toBe(false);
        if (!result.success) {
          const errors = result.error.errors;
          const tzError = errors.find((e) => e.path.includes('timezone'));
          expect(tzError).toBeDefined();
          expect(tzError?.message).toBe('Invalid IANA timezone identifier');
        }
      }
    });

    it('3. allows omitting timezone or passing empty string without error', () => {
      const payloadWithoutTz = {
        configuration: {
          ...validBaseConfig,
          businessInformation: {
            businessName: 'Standard Academy',
          },
        },
      };
      const result1 = saveConfigSchema.safeParse(payloadWithoutTz);
      expect(result1.success).toBe(true);

      const payloadWithEmptyTz = {
        configuration: {
          ...validBaseConfig,
          businessInformation: {
            businessName: 'Standard Academy',
            timezone: '',
          },
        },
      };
      const result2 = saveConfigSchema.safeParse(payloadWithEmptyTz);
      expect(result2.success).toBe(true);
    });

    it('4. preserves timezone when updating unrelated configuration fields', () => {
      const payload = {
        configuration: {
          ...validBaseConfig,
          identity: { greeting: 'Welcome to our dental clinic!' },
          businessInformation: {
            businessName: 'Dental Care',
            hours: '9am - 5pm',
            timezone: 'America/New_York',
          },
          tools: {
            enabled: true,
            bindings: [
              {
                toolId: 'book_appointment',
                name: 'book_appointment',
                description: 'Book dental visit',
                enabled: true,
              },
            ],
          },
        },
      };

      const result = saveConfigSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.configuration.businessInformation?.timezone).toBe('America/New_York');
        expect(result.data.configuration.businessInformation?.hours).toBe('9am - 5pm');
        expect(result.data.configuration.identity?.greeting).toBe('Welcome to our dental clinic!');
        expect(result.data.configuration.tools?.bindings?.length).toBe(1);
      }
    });
  });

  describe('2. RuntimeAgentConfig Mapping & Backward-Compatibility Fallback', () => {
    it('5. maps configured businessInformation.timezone to runtimeConfig.prompt.timezone', () => {
      const config: AgentConfiguration = {
        identity: { agentName: 'Global Agent', greeting: 'Hi' },
        businessInformation: {
          businessName: 'Apex Health NYC',
          timezone: 'America/New_York',
        },
      } as any;

      const runtimeConfig = buildRuntimeAgentConfig(config);
      expect(runtimeConfig.prompt?.timezone).toBe('America/New_York');
    });

    it('6. falls back to Asia/Kolkata when timezone is omitted (backward compatibility)', () => {
      const legacyConfig: AgentConfiguration = {
        identity: { agentName: 'Legacy Agent', greeting: 'Hi' },
        businessInformation: {
          businessName: 'Arogya Clinic',
        },
      } as any;

      const runtimeConfig = buildRuntimeAgentConfig(legacyConfig);
      expect(runtimeConfig.prompt?.timezone).toBe('Asia/Kolkata');
    });

    it('7. falls back to Asia/Kolkata when businessInformation object is missing', () => {
      const minimalConfig: AgentConfiguration = {
        identity: { agentName: 'Bare Agent', greeting: 'Hi' },
      } as any;

      const runtimeConfig = buildRuntimeAgentConfig(minimalConfig);
      expect(runtimeConfig.prompt?.timezone).toBe('Asia/Kolkata');
    });
  });
});
