export interface ChunkingConfig {
  chunkSize: number;
  overlap: number;
}

export interface TextChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

const DEFAULT_CONFIG: ChunkingConfig = {
  chunkSize: 500,
  overlap: 50,
};

export function chunkText(text: string, config: Partial<ChunkingConfig> = {}): TextChunk[] {
  const { chunkSize, overlap } = { ...DEFAULT_CONFIG, ...config };
  const chunks: TextChunk[] = [];
  const words = text.split(/\s+/);
  let start = 0;
  let chunkIndex = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunkWords = words.slice(start, end);
    const content = chunkWords.join(' ');

    chunks.push({
      content,
      chunkIndex,
      tokenCount: estimateTokenCount(content),
    });

    chunkIndex++;
    start += chunkSize - overlap;

    if (start >= words.length) break;
    if (chunkSize <= overlap) break;
  }

  return chunks;
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
