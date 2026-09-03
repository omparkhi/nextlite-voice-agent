import { config } from '../config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LiveKitLLMProvider {
  async chat(messages: ChatMessage[], temperature: number = 0.7, signal?: AbortSignal): Promise<string> {
    // Delegate to Sarvam / OpenAI / LLM API endpoint configured in environment
    const sarvamApiKey = config.SARVAM_API_KEY;
    if (sarvamApiKey) {
      try {
        const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': sarvamApiKey,
          },
          body: JSON.stringify({
            model: 'sarvam-2b',
            messages,
            temperature,
            max_tokens: 300,
          }),
          signal,
        });

        if (response.ok) {
          const data = await response.json() as { choices?: { message: { content: string } }[] };
          if (data.choices && data.choices[0]?.message?.content) {
            return data.choices[0].message.content.trim();
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw err;
        }
        console.warn('Sarvam LLM call error, using fallback:', err.message);
      }
    }

    // Default polite conversational fallback response
    return 'नमस्ते! मैं आपकी किस प्रकार सहायता कर सकती हूँ?';
  }
}
