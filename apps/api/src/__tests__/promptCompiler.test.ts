import { describe, it, expect } from 'vitest';
import { promptCompiler } from '../services/promptCompiler';
import { SYSTEM_TEMPLATES, type AgentConfiguration } from '../services/template';

describe('PromptCompilerService (Module 1B - Generic Prompt Compiler & Universal Safety Layer)', () => {
  const genericConfig: AgentConfiguration = {
    identity: {
      agentName: 'Aarav',
      greeting: 'Hello, how can I help you today?',
      businessName: 'NextLite Enterprise Solutions',
    },
    persona: {
      role: 'Customer Support Specialist',
      personality: 'Helpful and professional',
      tone: 'warm',
      style: 'concise',
      formality: 'formal',
    },
    language: {
      primary: 'hi-IN',
      supported: ['hi-IN', 'en-IN'],
    },
    voice: {
      provider: 'sarvam',
      voiceId: 'shubh',
      gender: 'male',
    },
    businessInformation: {
      businessName: 'NextLite Enterprise Solutions',
      hours: 'Mon-Sat 9AM-8PM',
      location: 'Bangalore',
    },
    objective: {
      primaryObjective: 'Assist customers with business inquiries, pricing, and scheduling requests.',
    },
  };

  it('1. Universal Layer A safety contains NO healthcare/clinic-specific assumptions', () => {
    const compiled = promptCompiler.compileAgentPrompt({ configuration: genericConfig });

    // Extract Layer A section
    const layerA = compiled.split('=== IDENTITY & PERSONA ===')[0];

    expect(layerA).not.toContain('doctor');
    expect(layerA).not.toContain('Doctor');
    expect(layerA).not.toContain('patient');
    expect(layerA).not.toContain('clinic');
    expect(layerA).not.toContain('hospital');
    expect(layerA).not.toContain('OPD');
  });

  it('2. Universal prompt preserves strict booking safety and tool-aware execution rules', () => {
    const compiled = promptCompiler.compileAgentPrompt({ configuration: genericConfig });

    expect(compiled).toContain('TOOL VERIFICATION & MUTATION SAFETY:');
    expect(compiled).toContain('APPOINTMENT & BOOKING ACTION RULES:');
    expect(compiled).toContain('if the book_appointment tool is available, collect the required details');
    expect(compiled).toContain('execute the book_appointment tool');
    expect(compiled).toContain('You may state the appointment request was recorded ONLY AFTER the tool returns success');
    expect(compiled).toContain('You must NEVER claim the appointment is confirmed (the request status is REQUESTED; team/staff will verify and confirm)');
    expect(compiled).toContain('If book_appointment is not available or fails, explain that the request could not be submitted automatically');
  });

  it('3. Universal prompt contains OPERATING HOURS VS SLOT AVAILABILITY rule', () => {
    const compiled = promptCompiler.compileAgentPrompt({ configuration: genericConfig });

    expect(compiled).toContain('OPERATING HOURS VS SLOT AVAILABILITY:');
    expect(compiled).toContain('Operating/business hours are NOT specific slot availability');
    expect(compiled).toContain('The business hours are from 10 AM to 2 PM, so 11 AM falls within operating hours');
    expect(compiled).toContain('You must NOT say: "11 AM slot is available."');
    expect(compiled).toContain('Actual slot availability must be confirmed by staff or an availability check');
  });

  it('4. Universal prompt contains DATE & CALENDAR INTERPRETATION rules', () => {
    const compiled = promptCompiler.compileAgentPrompt({ configuration: genericConfig });

    expect(compiled).toContain('DATE & CALENDAR INTERPRETATION:');
    expect(compiled).toContain('Use the provided calendar reference for weekday/date interpretation');
    expect(compiled).toContain('Do not independently calculate weekday/date relationships');
    expect(compiled).toContain('If the caller provides a weekday and date that conflict with the calendar reference, ask the caller to clarify instead of guessing');
  });

  it('5. Healthcare template still legitimately contains healthcare terminology', () => {
    const healthcareTemplate = SYSTEM_TEMPLATES.find((t) => t.industry === 'Healthcare');
    expect(healthcareTemplate).toBeDefined();

    const compiled = promptCompiler.compileAgentPrompt({
      configuration: healthcareTemplate!.defaultConfiguration,
    });

    // Identity and role sections maintain healthcare-specific context
    expect(compiled).toContain('Arogya Medical Clinic');
    expect(compiled).toContain('Medical Clinic Receptionist');
    expect(compiled).toContain('patient');
  });

  it('6. Real Estate template compiles valid prompt', () => {
    const realEstateTemplate = SYSTEM_TEMPLATES.find((t) => t.industry === 'Real Estate');
    expect(realEstateTemplate).toBeDefined();

    const compiled = promptCompiler.compileAgentPrompt({
      configuration: realEstateTemplate!.defaultConfiguration,
    });

    expect(compiled).toContain('Skyline Realty');
    expect(compiled).toContain('Real Estate');
  });

  it('7. Education template compiles valid prompt', () => {
    const educationTemplate = SYSTEM_TEMPLATES.find((t) => t.industry === 'Education');
    expect(educationTemplate).toBeDefined();

    const compiled = promptCompiler.compileAgentPrompt({
      configuration: educationTemplate!.defaultConfiguration,
    });

    expect(compiled).toContain('SuccessPath');
    expect(compiled).toContain('JEE');
  });

  it('8. Finance template compiles valid prompt', () => {
    const financeTemplate = SYSTEM_TEMPLATES.find((t) => t.industry === 'Finance');
    expect(financeTemplate).toBeDefined();

    const compiled = promptCompiler.compileAgentPrompt({
      configuration: financeTemplate!.defaultConfiguration,
    });

    expect(compiled).toContain('Capital Trust Loans');
    expect(compiled).toContain('Loan');
  });

  it('9. Prompt preserves masculine and feminine Hindi grammar requirements', () => {
    const malePrompt = promptCompiler.compileAgentPrompt({ configuration: genericConfig });
    expect(malePrompt).toContain('Voice Gender: MALE voice');
    expect(malePrompt).toContain('Use MASCULINE Hindi verb forms');
    expect(malePrompt).toContain('कर सकता हूँ');
    expect(malePrompt).toContain('NEVER use feminine endings');

    const femaleConfig: AgentConfiguration = {
      ...genericConfig,
      voice: {
        provider: 'sarvam',
        voiceId: 'priya',
        gender: 'female',
      },
    };
    const femalePrompt = promptCompiler.compileAgentPrompt({ configuration: femaleConfig });
    expect(femalePrompt).toContain('Voice Gender: FEMALE voice');
    expect(femalePrompt).toContain('Use FEMININE Hindi verb forms');
    expect(femalePrompt).toContain('कर सकती हूँ');
    expect(femalePrompt).toContain('NEVER use masculine endings');
  });

  it('10. Prompt contains generic LATEST USER INTENT, SHORT UTTERANCES, and PHONE NUMBER SEMANTICS', () => {
    const prompt = promptCompiler.compileAgentPrompt({ configuration: genericConfig });

    expect(prompt).toContain('LATEST USER INTENT PRIORITY:');
    expect(prompt).toContain('Always prioritize answering the user\'s latest question directly first (e.g. today\'s date, operating hours, pricing/fees, business location)');
    expect(prompt).toContain('Never repeat a previous scripted question blindly');

    expect(prompt).toContain('SHORT UTTERANCES & DISAGREEMENTS:');
    expect(prompt).toContain('Interpret short utterances (e.g. "हाँ", "नहीं", "नहीं नहीं", "Okay", "अच्छा") in context of the previous turn');

    expect(prompt).toContain('PHONE NUMBER SEMANTICS:');
    expect(prompt).toContain('When a caller says "यही नंबर है", "इसी नंबर पर", "जिस नंबर से कॉल किया है", or "use this number"');
    expect(prompt).toContain('मुझे incoming number दिखाई नहीं दे रहा है, कृपया अपना number बता दीजिए.');
  });

  it('11. Prompt contains generic NATURAL CODE-SWITCHING and DO NOT RANDOMLY SWITCH TO ENGLISH', () => {
    const prompt = promptCompiler.compileAgentPrompt({ configuration: genericConfig });

    expect(prompt).toContain('NATURAL CODE-SWITCHING:');
    expect(prompt).toContain('Speak natural conversational language (e.g. Hinglish for Hindi, Minglish for Marathi)');
    expect(prompt).toContain('Keep standard business and everyday English words in English');

    expect(prompt).toContain('DO NOT RANDOMLY SWITCH TO ENGLISH:');
    expect(prompt).toContain('Never switch the entire conversation to English merely because the caller uses an English word');
  });
});
