import { describe, it, expect } from 'vitest';
import { DEFAULT_SYSTEM_PROMPT } from './agent.ts';
import { createKnowledgeTool } from './knowledgeTool.ts';
import { buildLanguageInstruction, buildFullInstructions } from './languageManager.ts';

describe('Module 1B: Generic Prompt Compiler & Universal Safety Layer (Worker)', () => {
  it('1. DEFAULT_SYSTEM_PROMPT is industry-neutral and free of healthcare-only assumptions', () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain('OPD');
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain('clinic');
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain('doctor');
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain('patient');
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain('hospital');

    expect(DEFAULT_SYSTEM_PROMPT).toContain('operating hours');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('fees/pricing');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('location');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('staff/resource schedules');
  });

  it('2. query_knowledge_base tool description is generic and multi-industry', () => {
    const tool = createKnowledgeTool('11111111-2222-3333-4444-555555555555');

    expect(tool.description).not.toContain('clinic');
    expect(tool.description).not.toContain('doctor');
    expect(tool.description).toContain('business, organizational, and domain-specific knowledge');
    expect(tool.description).toContain('staff/resource information');
  });

  it('3. buildLanguageInstruction generates generic code-switching and intent guidance', () => {
    const hindiInstruction = buildLanguageInstruction('hi-IN');
    expect(hindiInstruction).not.toContain('OPD');
    expect(hindiInstruction).not.toContain('clinic');
    expect(hindiInstruction).toContain('Keep standard business/everyday terms in English');
    expect(hindiInstruction).toContain('operating hours, fees/pricing, location');

    const marathiInstruction = buildLanguageInstruction('mr-IN');
    expect(marathiInstruction).not.toContain('OPD');
    expect(marathiInstruction).not.toContain('clinic');
    expect(marathiInstruction).toContain('Keep standard business/everyday terms in English');

    const full = buildFullInstructions('You are a real estate agent.', 'hi-IN');
    expect(full).toContain('You are a real estate agent.');
    expect(full).toContain('ACTIVE CONVERSATION LANGUAGE POLICY');
  });
});
