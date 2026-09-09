import { llm } from '@livekit/agents';
import { z } from 'zod';
import { retrieveKnowledge, type RetrieveKnowledgeOptions } from './runtimeConfigClient.ts';

export const knowledgeQuerySchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, 'Query must not be empty')
    .max(2000, 'Query exceeds maximum allowed length of 2000 characters')
    .describe('The natural language search query to search the knowledge base for authoritative business information'),
});

export type KnowledgeQueryArgs = z.infer<typeof knowledgeQuerySchema>;

export interface KnowledgeToolResultItem {
  content: string;
  relevanceScore?: number | undefined;
}

export interface KnowledgeToolResult {
  results: KnowledgeToolResultItem[];
  message?: string | undefined;
  error?: string | undefined;
}

export interface CreateKnowledgeToolOptions extends RetrieveKnowledgeOptions {
  maxResults?: number;
}

/**
 * Creates the `query_knowledge_base` native function tool for Sarvam-105B.
 * 
 * Security & Isolation:
 * - `deploymentId` is locked to the trusted worker session context.
 * - The model only supplies `{ query: string }`.
 * - The model CANNOT provide or override `tenantId`, `agentId`, `deploymentId`, or database identifiers.
 */
export function createKnowledgeTool(
  deploymentId: string,
  options?: CreateKnowledgeToolOptions,
) {
  if (!deploymentId || typeof deploymentId !== 'string' || deploymentId.trim() === '') {
    throw new Error('deploymentId is required to initialize knowledge tool');
  }

  const trustedDeploymentId = deploymentId.trim();

  return llm.tool({
    name: 'query_knowledge_base',
    description:
      'Retrieve authoritative business, organizational, and domain-specific knowledge from the configured knowledge base. ' +
      'Use this tool when the answer depends on specific business facts, operating hours, services, staff/resource information, procedures, pricing, or policies.',
    parameters: knowledgeQuerySchema,
    execute: async (args: KnowledgeQueryArgs): Promise<KnowledgeToolResult> => {
      // Validate arguments strictly with Zod
      const parsed = knowledgeQuerySchema.safeParse(args);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => i.message).join('; ');
        return {
          results: [],
          error: `Invalid query arguments: ${errorMsg}`,
        };
      }

      try {
        const response = await retrieveKnowledge(trustedDeploymentId, parsed.data.query, {
          apiUrl: options?.apiUrl,
          workerSecret: options?.workerSecret,
          timeoutMs: options?.timeoutMs ?? 3000,
          fetchFn: options?.fetchFn,
          topK: options?.topK ?? options?.maxResults ?? 5,
        });

        if (!response.results || response.results.length === 0) {
          return {
            results: [],
            message: 'No relevant information found in the knowledge base for this query.',
          };
        }

        // Return concise, clean content without internal IDs, database internals, or secrets
        const sanitizedResults: KnowledgeToolResultItem[] = response.results.map((item) => ({
          content: item.content,
          relevanceScore: typeof item.score === 'number' ? Math.round(item.score * 100) / 100 : undefined,
        }));

        return {
          results: sanitizedResults,
        };
      } catch (error: any) {
        // Safe fallback on retrieval API failure or timeout - do not crash voice agent
        const safeErrorMessage =
          error?.name === 'AbortError' || error?.errorCode === 'SERVICE_UNAVAILABLE'
            ? 'Knowledge retrieval request timed out or service is temporarily unavailable.'
            : 'Knowledge base retrieval is temporarily unavailable.';

        return {
          results: [],
          error: safeErrorMessage,
        };
      }
    },
  });
}
