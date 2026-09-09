import { describe, it, expect, vi } from 'vitest';
import { TestConversationServiceImpl, type TestMessage } from '../services/test-conversation';
import type { LLMService } from '../services/llm';
import type { KnowledgeService } from '../services/knowledge';
import type { AgentConfiguration } from '../services/template';

describe('TestConversationService with Canonical V3 Prompt Compiler', () => {
  const mockLLM: LLMService = {
    chat: vi.fn().mockResolvedValue('Hello! How can I assist you with your appointment today?'),
    chatWithJsonOutput: vi.fn(),
  };

  const mockKnowledge: KnowledgeService = {
    uploadDocument: vi.fn(),
    listSources: vi.fn(),
    getSource: vi.fn(),
    deleteSource: vi.fn(),
    retrieveRelevant: vi.fn(),
  };

  const sampleV3Config: AgentConfiguration = {
    identity: {
      agentName: 'Aarav',
      displayName: 'Aarav Voice',
      greeting: 'Namaste! Welcome to Apex Healthcare.',
      businessName: 'Apex Healthcare Clinic',
    },
    persona: {
      role: 'Clinic Front Desk Assistant',
      personality: 'Warm, professional and empathetic',
      tone: 'friendly',
      style: 'concise',
      formality: 'mixed',
    },
    objective: {
      primaryObjective: 'Assist patients with booking appointments and answering clinic inquiries.',
      secondaryObjectives: ['Provide doctor consultation hours', 'Explain booking procedures'],
    },
    speakingStyle: {
      maxSentences: 2,
      oneQuestionAtATime: true,
      conciseResponses: true,
    },
    businessInformation: {
      businessName: 'Apex Healthcare Clinic',
      businessType: 'Healthcare',
      hours: 'Mon-Sat 8:00 AM - 8:00 PM',
      location: 'Bangalore, India',
      description: 'Multi-speciality medical outpatient clinic',
      timezone: 'Asia/Kolkata',
    },
    conversation: {
      phases: [
        {
          id: 'phase_1',
          name: 'Greeting & Triage',
          objective: 'Welcome patient and understand need',
        },
      ],
    },
    guardrails: {
      prohibitedTopics: ['Prescribing medication', 'Medical diagnosis'],
      escalationRules: ['Emergency medical queries'],
    },
    language: {
      primary: 'en-IN',
      supported: ['en-IN', 'hi-IN'],
    },
    voice: {
      voiceId: 'shubh',
      provider: 'sarvam',
      gender: 'male',
    },
    tools: {
      enabled: true,
      bindings: [
        {
          toolId: 'book_appointment',
          name: 'book_appointment',
          description: 'Book consultation appointment',
          enabled: true,
        },
      ],
    },
  };

  it('1. compiles system prompt via canonical promptCompiler and sends message to LLM', async () => {
    (mockKnowledge.retrieveRelevant as any).mockResolvedValueOnce([]);
    (mockLLM.chat as any).mockResolvedValueOnce('I can help you book a slot for tomorrow.');

    const service = new TestConversationServiceImpl(mockLLM, mockKnowledge);
    const history: TestMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Namaste! Welcome to Apex Healthcare.' },
    ];

    const result = await service.sendMessage(
      'tenant-123',
      'agent-456',
      'Can I book a doctor visit?',
      history,
      sampleV3Config,
    );

    expect(result.response).toBe('I can help you book a slot for tomorrow.');
    expect(result.knowledgeUsed).toEqual([]);

    // Verify tenant and agent isolation in knowledge call
    expect(mockKnowledge.retrieveRelevant).toHaveBeenCalledWith(
      'tenant-123',
      'agent-456',
      'Can I book a doctor visit?',
      5,
    );

    // Verify LLM chat was invoked with canonical prompt sections
    expect(mockLLM.chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('=== BUSINESS INFORMATION ==='),
        }),
        expect.objectContaining({ role: 'user', content: 'Hi' }),
        expect.objectContaining({ role: 'assistant', content: 'Namaste! Welcome to Apex Healthcare.' }),
        expect.objectContaining({ role: 'user', content: 'Can I book a doctor visit?' }),
      ]),
      { temperature: 0.7 },
    );
  });

  it('2. appends retrieved knowledge context seamlessly when knowledge results are found', async () => {
    const mockResults = [
      {
        content: 'Cardiology OPD operates Mon-Fri 10am-2pm with Dr. Sharma in Room 204.',
        score: 0.92,
        sourceId: 'src-1',
      },
    ];
    (mockKnowledge.retrieveRelevant as any).mockResolvedValueOnce(mockResults);
    (mockLLM.chat as any).mockResolvedValueOnce('Cardiology OPD is available Monday to Friday.');

    const service = new TestConversationServiceImpl(mockLLM, mockKnowledge);
    const result = await service.sendMessage(
      'tenant-123',
      'agent-456',
      'When is Cardiology open?',
      [],
      sampleV3Config,
    );

    expect(result.response).toBe('Cardiology OPD is available Monday to Friday.');
    expect(result.knowledgeUsed).toEqual(mockResults);

    // Check system prompt includes knowledge section
    const chatCalls = (mockLLM.chat as any).mock.calls;
    const lastCallMessages = chatCalls[chatCalls.length - 1][0];
    const systemMsg = lastCallMessages.find((m: any) => m.role === 'system');

    expect(systemMsg.content).toContain('=== RELEVANT KNOWLEDGE CONTEXT ===');
    expect(systemMsg.content).toContain('Cardiology OPD operates Mon-Fri 10am-2pm with Dr. Sharma in Room 204.');
  });
});
