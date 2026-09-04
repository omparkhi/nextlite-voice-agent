import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SarvamLLMAdapter } from '../services/llm';

describe('SarvamLLMAdapter (Chat Test)', () => {
  let adapter: SarvamLLMAdapter;
  const originalFetch = global.fetch;

  beforeEach(() => {
    adapter = new SarvamLLMAdapter('mock-api-key');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetchResponse(content: string) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content,
            },
          },
        ],
      }),
    } as any);
  }

  it('uses sarvam-105b-conversations as the default model', async () => {
    mockFetchResponse('Hello from assistant');

    await adapter.chat([{ role: 'user', content: 'Hi' }]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.model).toBe('sarvam-105b-conversations');
  });

  it('1. Normal response: returned unchanged except normal trimming', async () => {
    const normalResponse = '  Dr. Rohan Sharma is available Monday to Friday from 10:00 AM to 2:00 PM.  ';
    mockFetchResponse(normalResponse);

    const result = await adapter.chat([{ role: 'user', content: 'When is Dr. Rohan Sharma available?' }]);

    expect(result).toBe('Dr. Rohan Sharma is available Monday to Friday from 10:00 AM to 2:00 PM.');
  });

  it('2. Response containing <tool_call>search_files...</tool_call> followed by normal text: tool-call removed, normal text preserved', async () => {
    const responseWithToolCall =
      '<tool_call>search_files\n' +
      '<arg_key>pattern</arg_key>\n' +
      '<arg_value>cardiology.*OPD.*timings|cardiology.*consultation.*fee</arg_value>\n' +
      '<arg_key>path</arg_key>\n' +
      '<arg_value>/home/user</arg_value>\n' +
      '<arg_key>output_mode</arg_key>\n' +
      '<arg_value>content</arg_value>\n' +
      '</tool_call>\n\n' +
      'Dr. Rohan Sharma is available Monday to Friday from 10:00 AM to 2:00 PM. The consultation fee is ₹800.';

    mockFetchResponse(responseWithToolCall);

    const result = await adapter.chat([{ role: 'user', content: 'What are cardiology timings?' }]);

    expect(result).not.toContain('<tool_call>');
    expect(result).not.toContain('search_files');
    expect(result).not.toContain('/home/user');
    expect(result).toBe('Dr. Rohan Sharma is available Monday to Friday from 10:00 AM to 2:00 PM. The consultation fee is ₹800.');
  });

  it('3. Multiline tool-call block: entire block removed', async () => {
    const multilineToolCall =
      '<tool_call>\n' +
      'function: query_knowledge_base\n' +
      'args: {\n' +
      '  "query": "cardiology"\n' +
      '}\n' +
      '</tool_call>\n\n' +
      'Cardiology OPD timings are 10:00 AM to 2:00 PM.';

    mockFetchResponse(multilineToolCall);

    const result = await adapter.chat([{ role: 'user', content: 'timings' }]);

    expect(result).toBe('Cardiology OPD timings are 10:00 AM to 2:00 PM.');
  });

  it('4. Response with no tool-call: unchanged', async () => {
    const directResponse = 'The consultation fee for Cardiology is ₹800 for a first visit and ₹400 for a follow-up.';
    mockFetchResponse(directResponse);

    const result = await adapter.chat([{ role: 'user', content: 'How much is cardiology?' }]);

    expect(result).toBe(directResponse);
  });

  it('5. Multiple tool-call blocks: all complete blocks removed', async () => {
    const multipleToolCalls =
      '<tool_call>search_files</tool_call>\n' +
      'First part of answer. ' +
      '<tool_call>lookup_doctor\n<id>123</id>\n</tool_call>' +
      'Second part of answer.';

    mockFetchResponse(multipleToolCalls);

    const result = await adapter.chat([{ role: 'user', content: 'query' }]);

    expect(result).not.toContain('<tool_call>');
    expect(result).toBe('First part of answer. Second part of answer.');
  });
});
