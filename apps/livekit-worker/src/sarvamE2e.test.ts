import { Agent, initializeLogger, voice } from '@livekit/agents';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import dotenv from 'dotenv';
import { describe, it, expect } from 'vitest';
import { SarvamLLM } from './sarvamLlm.ts';

dotenv.config({ path: '.env.local' });
initializeLogger({ pretty: true, level: 'warn' });

describe('Sarvam LLM Real Pipeline Measurement', () => {
  it('measures end to end turn latency with sarvam-105b-conversations', { timeout: 30000 }, async () => {
    const agent = Agent.create({
      instructions: 'You are a helpful voice assistant. Reply in one short sentence.',
      llm: new SarvamLLM({
        model: 'sarvam-105b-conversations',
        temperature: 0.3,
      }),
    });

    const session = new voice.AgentSession({
      tts: new sarvam.TTS({
        model: 'bulbul:v3',
        targetLanguageCode: 'en-IN',
        speaker: 'priya',
      }),
    });

    await session.start({ agent });

    const t0 = Date.now();
    const result = await session.run({
      userInput: 'Hello, what are your dental clinic opening hours?',
    }).wait();

    const elapsed = Date.now() - t0;
    console.log(`[E2E MEASUREMENT] Full turn completion: ${elapsed}ms`);

    for (const ev of result.events) {
      console.log('EVENT:', JSON.stringify(ev, null, 2));
    }

    expect(result.events.length).toBeGreaterThan(0);
    await session.close();
  });
});
