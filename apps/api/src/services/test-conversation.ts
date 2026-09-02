import type { LLMService, LLMMessage } from './llm';
import type { KnowledgeService } from './knowledge';
import type { AgentConfiguration } from './template';

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

    const systemPrompt = this.buildSystemPrompt(config, knowledgeResults);

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

  private buildSystemPrompt(config: AgentConfiguration, knowledge: { content: string; score: number }[]): string {
    let prompt = '';

    if (config.identity?.name) {
      prompt += `You are ${config.identity.name}.\n\n`;
    }
    if (config.identity?.greeting) {
      prompt += `Greeting: ${config.identity.greeting}\n\n`;
    }
    if (config.role?.description) {
      prompt += `Role: ${config.role.description}\n\n`;
    }
    if (config.goal?.primaryObjective) {
      prompt += `Goal: ${config.goal.primaryObjective}\n\n`;
    }
    if (config.personality?.tone) {
      prompt += `Tone: ${config.personality.tone}\n`;
    }
    if (config.personality?.style) {
      prompt += `Style: ${config.personality.style}\n`;
    }
    if (config.personality?.formality) {
      prompt += `Formality: ${config.personality.formality}\n\n`;
    }
    if (config.businessInformation?.businessName) {
      prompt += `Business: ${config.businessInformation.businessName}\n`;
    }
    if (config.businessInformation?.description) {
      prompt += `Business Description: ${config.businessInformation.description}\n`;
    }
    if (config.businessInformation?.hours) {
      prompt += `Hours: ${config.businessInformation.hours}\n`;
    }
    if (config.businessInformation?.location) {
      prompt += `Location: ${config.businessInformation.location}\n\n`;
    }

    if (knowledge.length > 0) {
      prompt += 'Relevant knowledge:\n';
      knowledge.forEach((k, i) => {
        prompt += `${i + 1}. ${k.content}\n`;
      });
      prompt += '\n';
    }

    if (config.systemInstructions) {
      prompt += `Instructions:\n${config.systemInstructions}\n`;
    }

    prompt += '\nSafety rules:\n';
    prompt += '- Never give medical advice or health opinions\n';
    prompt += '- Never comment on a patient\'s age, appearance, or health\n';
    prompt += '- Never make assumptions about a patient\'s condition\n';
    prompt += '- Stay focused on the task (appointment booking, inquiries)\n';
    prompt += '- If you lack information, ask — do not invent\n';

    return prompt;
  }
}

export function createTestConversationService(llm: LLMService, knowledge: KnowledgeService): TestConversationService {
  return new TestConversationServiceImpl(llm, knowledge);
}
