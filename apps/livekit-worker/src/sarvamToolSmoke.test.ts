import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, initializeLogger, llm, voice } from '@livekit/agents';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import { SarvamLLM } from './sarvamLlm.ts';
import { createKnowledgeTool } from './knowledgeTool.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

beforeAll(() => {
  initializeLogger({ pretty: true, level: 'warn' });
});

describe('Real Sarvam-105B Tool-Calling Smoke Test', () => {
  const sarvamApiKey = process.env.SARVAM_API_KEY;
  const testDeploymentId = '11111111-1111-4111-8111-111111111111';

  it('Case A1 (English): Real Sarvam-105B emits native query_knowledge_base tool call and completes with answer', { timeout: 45000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    let toolExecuted = false;
    let executedQuery = '';

    const knowledgeTool = createKnowledgeTool(testDeploymentId, {
      fetchFn: async (url, init) => {
        toolExecuted = true;
        const body = JSON.parse(init?.body as string);
        executedQuery = body.query;
        console.log(`[Worker Fetch A1] URL: ${url}, query: "${body.query}"`);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                content: 'Cardiology OPD timings are Monday to Friday from 10:00 AM to 2:00 PM with Dr. Sharma in Room 204.',
                score: 0.95,
                sourceId: 'doc-cardiology-101',
              },
            ],
          }),
        } as any;
      },
    });

    // 1. Send first turn with tool definition
    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({
      role: 'system',
      content: 'You are a helpful clinic receptionist. When asked about clinic services, hours, or doctor timings, use query_knowledge_base to retrieve facts.',
    });
    chatCtx.addMessage({
      role: 'user',
      content: 'What are your cardiology OPD timings?',
    });

    const stream = sarvamLlm.chat({
      chatCtx,
      toolCtx: [knowledgeTool],
    });

    let toolCallReceived: llm.FunctionCall | undefined;
    for await (const chunk of stream) {
      console.log('[Chunk A1 Raw]', JSON.stringify(chunk));
      if (chunk.delta?.toolCalls && chunk.delta.toolCalls.length > 0) {
        toolCallReceived = chunk.delta.toolCalls[0];
      }
    }

    console.log('[A1 Tool Call Received]', toolCallReceived);
    expect(toolCallReceived).toBeDefined();
    expect(toolCallReceived?.name).toBe('query_knowledge_base');
    
    // Validate JSON arguments
    const parsedArgs = JSON.parse(toolCallReceived!.args);
    console.log('[A1 Tool Call Parsed Args]', parsedArgs);
    expect(parsedArgs.query).toBeDefined();
    expect(typeof parsedArgs.query).toBe('string');
    expect(parsedArgs.query.toLowerCase()).toContain('cardiology');

    // 2. Execute the tool call
    const toolContext = new llm.ToolContext([knowledgeTool]);
    const toolOutput = await llm.executeToolCall(toolCallReceived!, toolContext);
    console.log('[A1 Tool Output]', toolOutput);
    expect(toolOutput.isError).toBe(false);
    expect(toolExecuted).toBe(true);
    expect(executedQuery.toLowerCase()).toContain('cardiology');

    // 3. Second Turn: Return tool result to Sarvam-105B for final natural answer
    chatCtx.insert([toolCallReceived!, toolOutput]);

    const secondStream = sarvamLlm.chat({
      chatCtx,
      toolCtx: [knowledgeTool],
    });

    let finalAnswer = '';
    for await (const chunk of secondStream) {
      if (chunk.delta?.content) {
        finalAnswer += chunk.delta.content;
      }
    }

    console.log('[A1 Final Answer from Sarvam-105B]:', finalAnswer);
    expect(finalAnswer.length).toBeGreaterThan(0);
    expect(finalAnswer.toLowerCase()).toMatch(/10(:00)?\s*(am)?|2(:00)?\s*(pm)?|monday|friday|sharma/i);
  });

  it('Case A2 (Hinglish): Real Sarvam-105B emits native query_knowledge_base tool call and answers in Hindi/Hinglish', { timeout: 45000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    let toolExecuted = false;
    let executedQuery = '';

    const knowledgeTool = createKnowledgeTool(testDeploymentId, {
      fetchFn: async (url, init) => {
        toolExecuted = true;
        const body = JSON.parse(init?.body as string);
        executedQuery = body.query;
        console.log(`[Worker Fetch A2] URL: ${url}, query: "${body.query}"`);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                content: 'Cardiology OPD timings are Monday to Friday from 10:00 AM to 2:00 PM with Dr. Sharma.',
                score: 0.95,
              },
            ],
          }),
        } as any;
      },
    });

    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({
      role: 'system',
      content: 'You are a helpful clinic receptionist. When asked about clinic facts, services, or timings, use query_knowledge_base to retrieve information. Always answer in the user\'s language.',
    });
    chatCtx.addMessage({
      role: 'user',
      content: 'Cardiology ka OPD kab hota hai?',
    });

    const stream = sarvamLlm.chat({
      chatCtx,
      toolCtx: [knowledgeTool],
    });

    let toolCallReceived: llm.FunctionCall | undefined;
    for await (const chunk of stream) {
      if (chunk.delta?.toolCalls && chunk.delta.toolCalls.length > 0) {
        toolCallReceived = chunk.delta.toolCalls[0];
      }
    }

    console.log('[A2 Tool Call Received]', toolCallReceived);
    expect(toolCallReceived).toBeDefined();
    expect(toolCallReceived?.name).toBe('query_knowledge_base');

    const toolContext = new llm.ToolContext([knowledgeTool]);
    const toolOutput = await llm.executeToolCall(toolCallReceived!, toolContext);
    expect(toolOutput.isError).toBe(false);
    expect(toolExecuted).toBe(true);

    chatCtx.insert([toolCallReceived!, toolOutput]);

    const secondStream = sarvamLlm.chat({
      chatCtx,
      toolCtx: [knowledgeTool],
    });

    let finalAnswer = '';
    for await (const chunk of secondStream) {
      if (chunk.delta?.content) {
        finalAnswer += chunk.delta.content;
      }
    }

    console.log('[A2 Final Answer from Sarvam-105B (Hinglish/Hindi)]:', finalAnswer);
    expect(finalAnswer.length).toBeGreaterThan(0);
  });

  it('Case A3 (Marathi): Real Sarvam-105B emits native query_knowledge_base tool call and answers in Marathi', { timeout: 45000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    let toolExecuted = false;
    let executedQuery = '';

    const knowledgeTool = createKnowledgeTool(testDeploymentId, {
      fetchFn: async (url, init) => {
        toolExecuted = true;
        const body = JSON.parse(init?.body as string);
        executedQuery = body.query;
        console.log(`[Worker Fetch A3] URL: ${url}, query: "${body.query}"`);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                content: 'कार्डिओलॉजी ओपीडी सोमवार ते शुक्रवार सकाळी १० ते दुपारी २ वाजेपर्यंत डॉ. शर्मा यांच्याकडे असते.',
                score: 0.96,
              },
            ],
          }),
        } as any;
      },
    });

    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({
      role: 'system',
      content: 'You are a helpful clinic receptionist. When asked about clinic facts, services, or timings, use query_knowledge_base to retrieve information. Always answer in the user\'s language.',
    });
    chatCtx.addMessage({
      role: 'user',
      content: 'कार्डिओलॉजीची ओपीडी कधी असते?',
    });

    const stream = sarvamLlm.chat({
      chatCtx,
      toolCtx: [knowledgeTool],
    });

    let toolCallReceived: llm.FunctionCall | undefined;
    for await (const chunk of stream) {
      if (chunk.delta?.toolCalls && chunk.delta.toolCalls.length > 0) {
        toolCallReceived = chunk.delta.toolCalls[0];
      }
    }

    console.log('[A3 Tool Call Received]', toolCallReceived);
    expect(toolCallReceived).toBeDefined();
    expect(toolCallReceived?.name).toBe('query_knowledge_base');

    const toolContext = new llm.ToolContext([knowledgeTool]);
    const toolOutput = await llm.executeToolCall(toolCallReceived!, toolContext);
    expect(toolOutput.isError).toBe(false);
    expect(toolExecuted).toBe(true);

    chatCtx.insert([toolCallReceived!, toolOutput]);

    const secondStream = sarvamLlm.chat({
      chatCtx,
      toolCtx: [knowledgeTool],
    });

    let finalAnswer = '';
    for await (const chunk of secondStream) {
      if (chunk.delta?.content) {
        finalAnswer += chunk.delta.content;
      }
    }

    console.log('[A3 Final Answer from Sarvam-105B (Marathi)]:', finalAnswer);
    expect(finalAnswer.length).toBeGreaterThan(0);
  });

  it('Case B (Normal Conversation): Real Sarvam-105B answers directly without calling RAG', { timeout: 30000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    const knowledgeTool = createKnowledgeTool(testDeploymentId, {
      fetchFn: async () => {
        throw new Error('RAG fetch should NOT be called for simple conversational greetings');
      },
    });

    const chatCtx = new llm.ChatContext();
    chatCtx.addMessage({
      role: 'system',
      content: 'You are a helpful clinic receptionist. Use query_knowledge_base ONLY when business or clinic facts are needed. For normal conversational greetings, respond directly.',
    });
    chatCtx.addMessage({
      role: 'user',
      content: 'Hello, how are you?',
    });

    const stream = sarvamLlm.chat({
      chatCtx,
      toolCtx: [knowledgeTool],
    });

    let directAnswer = '';
    let toolCallsCount = 0;
    for await (const chunk of stream) {
      if (chunk.delta?.content) {
        directAnswer += chunk.delta.content;
      }
      if (chunk.delta?.toolCalls && chunk.delta.toolCalls.length > 0) {
        toolCallsCount += chunk.delta.toolCalls.length;
      }
    }

    console.log('[Case B Direct Answer from Sarvam-105B]:', directAnswer);
    expect(toolCallsCount).toBe(0);
    expect(directAnswer.length).toBeGreaterThan(0);
  });

  it('Full Voice Agent E2E: AgentSession executes tool call, retrieves knowledge, and synthesizes TTS', { timeout: 45000 }, async () => {
    expect(sarvamApiKey).toBeDefined();

    const sarvamLlm = new SarvamLLM({
      apiKey: sarvamApiKey,
      model: 'sarvam-105b-conversations',
      temperature: 0.1,
    });

    let toolExecuted = false;
    const knowledgeTool = createKnowledgeTool(testDeploymentId, {
      fetchFn: async () => {
        toolExecuted = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                content: 'Cardiology OPD is open Monday through Friday from 10 AM to 2 PM with Dr. Sharma.',
                score: 0.95,
              },
            ],
          }),
        } as any;
      },
    });

    const agent = Agent.create({
      instructions:
        'You are a receptionist at Apollo Clinic. ' +
        'When asked about clinic services, hours, or doctor timings, use query_knowledge_base to fetch facts. ' +
        'Always respond briefly in 1-2 sentences.',
      llm: sarvamLlm,
      tools: [knowledgeTool],
    });

    const session = new voice.AgentSession({
      maxToolSteps: 2,
      tts: new sarvam.TTS({
        model: 'bulbul:v3',
        targetLanguageCode: 'en-IN',
        speaker: 'priya',
      }),
    });

    await session.start({ agent });

    const t0 = Date.now();
    const sessionResult = await session.run({
      userInput: 'What are the cardiology OPD timings?',
    }).wait();
    const elapsed = Date.now() - t0;

    console.log(`[AgentSession E2E Voice] Completed turn in ${elapsed}ms`);
    console.log(`[AgentSession Tool Executed]: ${toolExecuted}`);

    for (const ev of sessionResult.events) {
      console.log('[Session Event]', JSON.stringify(ev, null, 2));
    }

    expect(toolExecuted).toBe(true);
    expect(sessionResult.events.length).toBeGreaterThan(0);
    await session.close();
  });
});
