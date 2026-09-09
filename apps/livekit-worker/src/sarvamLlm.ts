import { type APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';
import https from 'node:https';
import { StringDecoder } from 'node:string_decoder';

export interface SarvamLLMOptions {
  apiKey?: string | undefined;
  model?: string | undefined;
  temperature?: number | undefined;
}

export class SarvamLLM extends llm.LLM {
  #apiKey: string;
  #model: string;
  #temperature?: number | undefined;
  opts: { model: string; modelOptions?: { temperature?: number } };

  constructor(options?: SarvamLLMOptions) {
    super();
    this.#apiKey = options?.apiKey ?? process.env.SARVAM_API_KEY ?? '';
    this.#model = options?.model ?? 'sarvam-105b-conversations';
    this.#temperature = options?.temperature;
    this.opts = {
      model: this.#model,
      ...(typeof this.#temperature === 'number'
        ? { modelOptions: { temperature: this.#temperature } }
        : {}),
    };
  }

  override label(): string {
    return 'sarvam.LLM';
  }

  override get model(): string {
    return this.#model;
  }

  override get provider(): string {
    return 'sarvam';
  }

  chat({
    chatCtx,
    toolCtx,
    connOptions,
  }: {
    chatCtx: llm.ChatContext;
    toolCtx?: llm.ToolContextLike | undefined;
    connOptions?: APIConnectOptions | undefined;
  }): llm.LLMStream {
    return new SarvamLLMStream(this, {
      chatCtx,
      ...(toolCtx !== undefined ? { toolCtx } : {}),
      connOptions: connOptions ?? DEFAULT_API_CONNECT_OPTIONS,
      apiKey: this.#apiKey,
      model: this.#model,
      ...(this.#temperature !== undefined ? { temperature: this.#temperature } : {}),
    });
  }
}

export class SarvamLLMStream extends llm.LLMStream {
  #apiKey: string;
  #model: string;
  #temperature?: number | undefined;
  #chatContext: llm.ChatContext;
  #toolContext?: llm.ToolContext | undefined;

  constructor(
    llmInstance: SarvamLLM,
    options: {
      chatCtx: llm.ChatContext;
      toolCtx?: llm.ToolContextLike | undefined;
      connOptions: APIConnectOptions;
      apiKey: string;
      model: string;
      temperature?: number | undefined;
    },
  ) {
    super(llmInstance, {
      chatCtx: options.chatCtx,
      ...(options.toolCtx !== undefined ? { toolCtx: options.toolCtx } : {}),
      connOptions: options.connOptions,
    });
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#temperature = options.temperature;
    this.#chatContext = options.chatCtx;
    this.#toolContext = options.toolCtx !== undefined ? llm.toToolContext(options.toolCtx) : undefined;
  }

  protected async run(): Promise<void> {
    const messages: Array<Record<string, unknown>> = [];

    for (let i = 0; i < this.#chatContext.items.length; i++) {
      const item = this.#chatContext.items[i]!;

      if (item.type === 'message') {
        const text = item.rawTextContent ?? item.textContent ?? '';
        const role = item.role === 'developer' ? 'system' : item.role;

        // Check if this assistant message is followed immediately by function_calls in context
        const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];
        while (i + 1 < this.#chatContext.items.length && this.#chatContext.items[i + 1]!.type === 'function_call') {
          const nextFc = this.#chatContext.items[i + 1] as llm.FunctionCall;
          toolCalls.push({
            id: nextFc.callId,
            type: 'function',
            function: {
              name: nextFc.name,
              arguments: nextFc.args,
            },
          });
          i++;
        }

        if (toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: text || null,
            tool_calls: toolCalls,
          });
        } else if (text) {
          messages.push({
            role,
            content: text,
          });
        }
      } else if (item.type === 'function_call') {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: item.callId,
              type: 'function',
              function: {
                name: item.name,
                arguments: item.args,
              },
            },
          ],
        });
      } else if (item.type === 'function_call_output') {
        messages.push({
          role: 'tool',
          tool_call_id: item.callId,
          content: item.output,
        });
      }
    }

    const toolMap = this.#toolContext?.functionTools;
    const functionTools = toolMap ? Object.values(toolMap) : [];
    const tools = functionTools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: llm.toJsonSchema(t.parameters, true),
      },
    }));

    const requestData: Record<string, unknown> = {
      model: this.#model,
      messages,
      temperature: this.#temperature ?? 0.3,
      stream: true,
    };

    if (tools.length > 0) {
      requestData.tools = tools;
      requestData.tool_choice = 'auto';
    }

    const payload = JSON.stringify(requestData);

    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        'https://api.sarvam.ai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': this.#apiKey,
            'Authorization': `Bearer ${this.#apiKey}`,
          },
          signal: this.abortController.signal,
          timeout: this._connOptions.timeoutMs,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            let errorBody = '';
            res.on('data', (c) => (errorBody += c));
            res.on('end', () => {
              reject(new Error(`Sarvam LLM API error (${res.statusCode}): ${errorBody.slice(0, 300)}`));
            });
            return;
          }

          const decoder = new StringDecoder('utf8');
          let buffer = '';
          const accumulatedToolCalls: Record<number, { callId: string; name: string; args: string }> = {};
          let lastChunkId = 'sarvam-chunk';
          let toolCallsEmitted = false;
          let pendingLeadingWhitespace = '';
          let hasSeenNonWhitespaceText = false;

          const emitAccumulatedToolCalls = () => {
            if (toolCallsEmitted) return;
            pendingLeadingWhitespace = '';
            const toolCallList: llm.FunctionCall[] = [];
            for (const [idx, tc] of Object.entries(accumulatedToolCalls)) {
              if (tc.name) {
                toolCallList.push(
                  llm.FunctionCall.create({
                    callId: tc.callId || `call_${idx}_${Date.now()}`,
                    name: tc.name,
                    args: tc.args || '{}',
                  }),
                );
              }
            }
            if (toolCallList.length > 0) {
              toolCallsEmitted = true;
              this.queue.put({
                id: lastChunkId,
                delta: {
                  role: 'assistant',
                  toolCalls: toolCallList,
                },
              });
            }
          };

          const processLine = (line: string): boolean => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) return false;
            if (trimmed === 'data: [DONE]') {
              if (
                pendingLeadingWhitespace &&
                !toolCallsEmitted &&
                Object.keys(accumulatedToolCalls).length === 0
              ) {
                this.queue.put({
                  id: lastChunkId,
                  delta: {
                    role: 'assistant',
                    content: pendingLeadingWhitespace,
                  },
                });
                pendingLeadingWhitespace = '';
              }
              emitAccumulatedToolCalls();
              return true;
            }

            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const chunkId = (parsed.id as string) || 'sarvam-chunk';
                lastChunkId = chunkId;
                const choice = parsed.choices?.[0];
                const delta = choice?.delta;
                const content = delta?.content;

                const toolCallsDelta = delta?.tool_calls;
                if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
                  // Tool call detected: discard any leading whitespace so we don't speak an empty segment
                  pendingLeadingWhitespace = '';
                }

                if (typeof content === 'string' && content.length > 0) {
                  // If tool calls are already being accumulated or emitted, do not emit whitespace
                  if (toolCallsEmitted || Object.keys(accumulatedToolCalls).length > 0) {
                    if (content.trim().length > 0) {
                      this.queue.put({
                        id: chunkId,
                        delta: {
                          role: 'assistant',
                          content,
                        },
                      });
                    }
                  } else if (hasSeenNonWhitespaceText) {
                    this.queue.put({
                      id: chunkId,
                      delta: {
                        role: 'assistant',
                        content,
                      },
                    });
                  } else {
                    if (content.trim().length === 0) {
                      pendingLeadingWhitespace += content;
                    } else {
                      hasSeenNonWhitespaceText = true;
                      const fullText = pendingLeadingWhitespace + content;
                      pendingLeadingWhitespace = '';
                      this.queue.put({
                        id: chunkId,
                        delta: {
                          role: 'assistant',
                          content: fullText,
                        },
                      });
                    }
                  }
                }

                if (Array.isArray(toolCallsDelta)) {
                  for (const tc of toolCallsDelta) {
                    const idx = typeof tc.index === 'number' ? tc.index : 0;
                    if (!accumulatedToolCalls[idx]) {
                      accumulatedToolCalls[idx] = {
                        callId: tc.id || '',
                        name: tc.function?.name || '',
                        args: '',
                      };
                    }
                    if (tc.id) {
                      accumulatedToolCalls[idx].callId = tc.id;
                    }
                    if (tc.function?.name) {
                      if (!accumulatedToolCalls[idx].name) {
                        accumulatedToolCalls[idx].name = tc.function.name;
                      } else if (tc.function.name !== accumulatedToolCalls[idx].name) {
                        if (tc.function.name.startsWith(accumulatedToolCalls[idx].name)) {
                          accumulatedToolCalls[idx].name = tc.function.name;
                        } else if (!accumulatedToolCalls[idx].name.endsWith(tc.function.name)) {
                          accumulatedToolCalls[idx].name += tc.function.name;
                        }
                      }
                    }
                    if (tc.function?.arguments) {
                      accumulatedToolCalls[idx].args += tc.function.arguments;
                    }
                  }
                }

                if (parsed.usage) {
                  this.queue.put({
                    id: chunkId,
                    usage: {
                      promptTokens: parsed.usage.prompt_tokens || 0,
                      completionTokens: parsed.usage.completion_tokens || 0,
                      promptCachedTokens: 0,
                      totalTokens: parsed.usage.total_tokens || 0,
                    },
                  });
                }
              } catch {
                // ignore JSON parse errors on incomplete chunk splits
              }
            }
            return false;
          };

          res.on('data', (chunk: Buffer) => {
            buffer += decoder.write(chunk);
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const isDone = processLine(line);
              if (isDone) {
                resolve();
                return;
              }
            }
          });

          res.on('end', () => {
            buffer += decoder.end();
            if (buffer.trim()) {
              processLine(buffer);
            }
            emitAccumulatedToolCalls();
            resolve();
          });
        },
      );

      req.on('timeout', () => {
        req.destroy(new Error(`Sarvam LLM request timed out after ${this._connOptions.timeoutMs}ms`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(payload);
      req.end();
    });
  }
}
