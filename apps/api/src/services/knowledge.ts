import { db } from '../db';
import { knowledgeSources, knowledgeChunks } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createHash } from 'crypto';
import type { StorageService } from './storage';
import type { EmbeddingService } from './embedding';
import { chunkText, normalizeText } from './chunking';

export interface KnowledgeService {
  uploadDocument(tenantId: string, agentId: string, fileName: string, fileContent: Buffer, fileType: string): Promise<string>;
  listSources(tenantId: string, agentId: string): Promise<any[]>;
  getSource(tenantId: string, agentId: string, sourceId: string): Promise<any>;
  deleteSource(tenantId: string, agentId: string, sourceId: string): Promise<void>;
  retrieveRelevant(tenantId: string, agentId: string, query: string, topK?: number): Promise<{ content: string; score: number; sourceId: string }[]>;
}

export class KnowledgeServiceImpl implements KnowledgeService {
  private storage: StorageService;
  private embedding: EmbeddingService;

  constructor(storage: StorageService, embedding: EmbeddingService) {
    this.storage = storage;
    this.embedding = embedding;
  }

  async uploadDocument(tenantId: string, agentId: string, fileName: string, fileContent: Buffer, fileType: string): Promise<string> {
    const contentHash = createHash('sha256').update(fileContent).digest('hex');

    const existing = await db.select()
      .from(knowledgeSources)
      .where(and(
        eq(knowledgeSources.tenantId, tenantId),
        eq(knowledgeSources.agentId, agentId),
        eq(knowledgeSources.contentHash, contentHash),
      ))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    const sourceId = crypto.randomUUID();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `knowledge/${tenantId}/${agentId}/${sourceId}/${safeFileName}`;

    await this.storage.upload(objectKey, fileContent, fileType === 'md' ? 'text/markdown' : 'text/plain');

    const text = fileContent.toString('utf-8');
    const normalized = normalizeText(text);
    const chunks = chunkText(normalized);

    const embeddings = await this.embedding.embedBatch(
      chunks.map(c => c.content),
      'passage',
    );

    await db.insert(knowledgeSources).values({
      id: sourceId,
      agentId,
      tenantId,
      fileName,
      filePath: objectKey,
      fileType,
      chunkCount: chunks.length,
      contentHash,
      status: 'READY',
    });

    for (let i = 0; i < chunks.length; i++) {
      await db.insert(knowledgeChunks).values({
        sourceId,
        agentId,
        tenantId,
        content: chunks[i].content,
        embedding: embeddings[i],
        chunkIndex: chunks[i].chunkIndex,
        tokenCount: chunks[i].tokenCount,
        metadata: { fileName },
      });
    }

    return sourceId;
  }

  async listSources(tenantId: string, agentId: string): Promise<any[]> {
    return db.select()
      .from(knowledgeSources)
      .where(and(
        eq(knowledgeSources.tenantId, tenantId),
        eq(knowledgeSources.agentId, agentId),
      ))
      .orderBy(desc(knowledgeSources.createdAt));
  }

  async getSource(tenantId: string, agentId: string, sourceId: string): Promise<any> {
    const results = await db.select()
      .from(knowledgeSources)
      .where(and(
        eq(knowledgeSources.tenantId, tenantId),
        eq(knowledgeSources.agentId, agentId),
        eq(knowledgeSources.id, sourceId),
      ))
      .limit(1);
    return results[0] || null;
  }

  async deleteSource(tenantId: string, agentId: string, sourceId: string): Promise<void> {
    const source = await this.getSource(tenantId, agentId, sourceId);
    if (!source) throw new Error('Source not found');

    await this.storage.delete(source.filePath);

    await db.delete(knowledgeChunks)
      .where(and(
        eq(knowledgeChunks.sourceId, sourceId),
        eq(knowledgeChunks.tenantId, tenantId),
      ));

    await db.delete(knowledgeSources)
      .where(and(
        eq(knowledgeSources.id, sourceId),
        eq(knowledgeSources.tenantId, tenantId),
      ));
  }

  async retrieveRelevant(tenantId: string, agentId: string, query: string, topK = 5): Promise<{ content: string; score: number; sourceId: string }[]> {
    const queryEmbedding = await this.embedding.embed(query, 'query');

    const chunks = await db.select()
      .from(knowledgeChunks)
      .where(and(
        eq(knowledgeChunks.tenantId, tenantId),
        eq(knowledgeChunks.agentId, agentId),
      ));

    const scored = chunks.map(chunk => {
      const chunkEmbedding = chunk.embedding as number[];
      const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
      return {
        content: chunk.content,
        score,
        sourceId: chunk.sourceId,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function createKnowledgeService(storage: StorageService, embedding: EmbeddingService): KnowledgeService {
  return new KnowledgeServiceImpl(storage, embedding);
}
