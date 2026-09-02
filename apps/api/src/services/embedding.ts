export interface EmbeddingService {
  embed(text: string, inputType: 'query' | 'passage'): Promise<number[]>;
  embedBatch(texts: string[], inputType: 'query' | 'passage'): Promise<number[][]>;
  getDimensions(): number;
  getModel(): string;
}

export class NvidiaEmbeddingAdapter implements EmbeddingService {
  private apiKey: string;
  private model = 'nvidia/nemotron-3-embed-1b';
  private dimensions = 2048;
  private endpoint = 'https://integrate.api.nvidia.com/v1/embeddings';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embed(text: string, inputType: 'query' | 'passage'): Promise<number[]> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: text,
          model: this.model,
          input_type: inputType,
          encoding_format: 'float',
          truncate: 'END',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.warn(`NVIDIA embedding warning (${response.status}): ${error}`);
        return this.fallbackEmbed(text);
      }

      const data = await response.json() as { data: { embedding: number[] }[] };
      if (data && data.data && data.data[0] && data.data[0].embedding) {
        return data.data[0].embedding;
      }
      return this.fallbackEmbed(text);
    } catch (err: any) {
      console.warn(`NVIDIA embedding error: ${err.message}`);
      return this.fallbackEmbed(text);
    }
  }

  async embedBatch(texts: string[], inputType: 'query' | 'passage'): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text, inputType));
    }
    return results;
  }

  private fallbackEmbed(text: string): number[] {
    const vector = new Array(this.dimensions).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
      const idx = Math.abs(hash) % this.dimensions;
      vector[idx] += 0.1;
    }
    return vector;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}

export class GeminiEmbeddingAdapter implements EmbeddingService {
  private apiKey: string;
  private model = 'gemini-embedding-001';
  private dimensions = 2048;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embed(text: string, inputType: 'query' | 'passage'): Promise<number[]> {
    const taskType = inputType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: this.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini embedding failed: ${response.status} ${error}`);
    }

    const data = await response.json() as { embedding: { values: number[] } };
    return data.embedding.values;
  }

  async embedBatch(texts: string[], inputType: 'query' | 'passage'): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text, inputType));
    }
    return results;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}

export function createEmbeddingService(): EmbeddingService {
  const provider = process.env.EMBEDDING_PROVIDER || 'nvidia';

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY required for gemini embedding provider');
    return new GeminiEmbeddingAdapter(apiKey);
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY required for nvidia embedding provider');
  return new NvidiaEmbeddingAdapter(apiKey);
}
