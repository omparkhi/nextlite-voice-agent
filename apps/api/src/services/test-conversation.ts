import type { LLMService, LLMMessage } from './llm';
import type { KnowledgeService } from './knowledge';
import type { AgentConfiguration } from './template';
import { promptCompiler } from './promptCompiler';

export interface TestMessage {
  role: 'user' | 'assistant';
  content: string;
  knowledgeUsed?: { content: string; score: number; sourceId: string }[];
}

export interface TestConversationService {
  sendMessage(tenantId: string, agentId: string, message: string, history: TestMessage[], config: AgentConfiguration): Promise<{ response: string; knowledgeUsed: { content: string; score: number; sourceId: string }[] }>;
}

export class TestConversationServiceImpl implements TestConversationService {
  private llm: LLMService;
  private knowledge: KnowledgeService;

  constructor(llm: LLMService, knowledge: KnowledgeService) {
    this.llm = llm;
    this.knowledge = knowledge;
  }

  async sendMessage(
    tenantId: string,
    agentId: string,
    message: string,
    history: TestMessage[],
    config: AgentConfiguration,
  ): Promise<{ response: string; knowledgeUsed: { content: string; score: number; sourceId: string }[] }> {
    const knowledgeResults = await this.knowledge.retrieveRelevant(tenantId, agentId, message, 5);
    const systemPrompt = promptCompiler.compileSystemPrompt(config, knowledgeResults);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ];

    const response = await this.llm.chat(messages, { temperature: 0.7 });

    return {
      response,
      knowledgeUsed: knowledgeResults,
    };
  }
}

export function createTestConversationService(llm: LLMService, knowledge: KnowledgeService): TestConversationService {
  return new TestConversationServiceImpl(llm, knowledge);
}
