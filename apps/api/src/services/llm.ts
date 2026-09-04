export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMService {
  chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number; responseFormat?: string }): Promise<string>;
  chatStream?(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): AsyncIterable<string>;
  chatWithJsonOutput(messages: LLMMessage[], schema: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class SarvamLLMAdapter implements LLMService {
  private apiKey: string;
  private model = 'sarvam-105b-conversations';
  private endpoint = 'https://api.sarvam.ai/v1/chat/completions';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private sanitizeOutput(text: string): string {
    if (!text) return '';
    return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
  }

  async chat(messages: LLMMessage[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        reasoning_effort: null,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Sarvam LLM failed: ${response.status} ${error}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const rawContent = data.choices?.[0]?.message?.content ?? '';
    return this.sanitizeOutput(rawContent);
  }

  async *chatStream(
    messages: LLMMessage[],
    options: { temperature?: number; maxTokens?: number } = {},
  ): AsyncIterable<string> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.apiKey,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 256,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        const fallback = await this.chat(messages, options);
        yield fallback;
        return;
      }

      const reader = (response.body as any).getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) yield content;
            } catch {
              // Ignore partial SSE lines
            }
          }
        }
      }
    } catch {
      const fallback = await this.chat(messages, options);
      yield fallback;
    }
  }

  async chatWithJsonOutput(messages: LLMMessage[], schema: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
        reasoning_effort: null,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'config_proposal',
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Sarvam LLM JSON output failed: ${response.status} ${error}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    return JSON.parse(data.choices[0].message.content);
  }
}

export function createLLMService(): LLMService {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY required');
  return new SarvamLLMAdapter(apiKey);
}
