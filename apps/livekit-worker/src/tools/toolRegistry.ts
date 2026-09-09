import { llm } from '@livekit/agents';
import { type RuntimeAgentConfig, type RuntimeToolDefinition, normalizeToolId } from '@nextlite/shared';
import { createKnowledgeTool } from '../knowledgeTool.ts';
import { callbackLeadToolFactory } from './leadTool.ts';
import { bookAppointmentToolFactory } from './appointmentTool.ts';

export interface ToolRuntimeContext {
  deploymentId: string;
  callSessionId?: string | undefined;
  callerPhone?: string | undefined;
  tenantId?: string | undefined;
  agentId?: string | undefined;
  apiUrl?: string | undefined;
  workerSecret?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- LiveKit FunctionTool requires any to allow arbitrary parameter schemas
export type NativeLiveKitTool = llm.FunctionTool<any, any, any>;

export interface ToolFactory {
  toolId: string;
  create(
    context: ToolRuntimeContext,
    toolConfig?: RuntimeToolDefinition,
    runtimeConfig?: RuntimeAgentConfig,
  ): NativeLiveKitTool;
}

/**
 * Validates tool name for LLM compatibility.
 * Must be a valid identifier: 1-64 chars, starts with letter/underscore, contains alphanumeric/underscores.
 */
export function isValidToolName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed);
}

/**
 * Built-in tool factory for knowledge base retrieval (query_knowledge_base).
 */
export const knowledgeToolFactory: ToolFactory = {
  toolId: 'query_knowledge_base',
  create(
    context: ToolRuntimeContext,
    toolConfig?: RuntimeToolDefinition,
    runtimeConfig?: RuntimeAgentConfig,
  ): NativeLiveKitTool {
    if (!context.deploymentId || context.deploymentId.trim() === '') {
      throw new Error('[ToolRegistry] deploymentId is required to instantiate query_knowledge_base tool');
    }

    const topK = runtimeConfig?.knowledge?.retrievalConfig?.topK;
    const baseTool = createKnowledgeTool(context.deploymentId, {
      topK,
      apiUrl: context.apiUrl,
      workerSecret: context.workerSecret,
      fetchFn: context.fetchFn,
    });

    // Custom LLM-facing tool description override if provided in configuration
    if (toolConfig?.description && toolConfig.description.trim()) {
      baseTool.description = toolConfig.description.trim();
    }

    return baseTool;
  },
};

/**
 * NextLite Voice Tool Registry
 * 
 * Central registry and factory for resolving configured runtime tools into native LiveKit llm.tool instances.
 * 
 * Architecture:
 * RuntimeAgentConfig.tools -> ToolRegistry -> ToolFactory -> LiveKit llm.tool() -> Agent.create()
 */
export class ToolRegistry {
  private factories: Map<string, ToolFactory> = new Map();

  constructor() {
    // Register standard built-in factories
    this.register(knowledgeToolFactory);
    this.register(callbackLeadToolFactory);
    this.register(bookAppointmentToolFactory);
  }

  /**
   * Register a tool factory with the registry.
   */
  register(factory: ToolFactory): this {
    if (!factory || !factory.toolId) {
      throw new Error('[ToolRegistry] Cannot register tool factory without a valid toolId');
    }
    this.factories.set(factory.toolId, factory);
    return this;
  }

  /**
   * Retrieve a tool factory by stable toolId.
   */
  get(toolId: string): ToolFactory | undefined {
    return this.factories.get(toolId);
  }

  /**
   * Check if a factory is registered for the toolId.
   */
  has(toolId: string): boolean {
    return this.factories.has(toolId);
  }

  /**
   * Resolves configured runtime tools into native LiveKit llm.tool instances.
   * 
   * Resolution Rules:
   * 1. If runtimeConfig is omitted, returns [].
   * 2. Iterates through configured runtimeConfig.tools.tools when tools.enabled !== false:
   *    - Filters out disabled tools (enabled !== true).
   *    - Validates LLM-facing tool name.
   *    - Deduplicates exposed tool names.
   *    - Resolves factory by stable toolId (falling back to name).
   *    - If factory is unknown: logs clear configuration error/warning, skips tool (NO arbitrary execution).
   *    - If factory is found: instantiates native LiveKit tool with trusted runtimeContext.
   * 3. Backward-compatibility / knowledge fallback:
   *    - If runtimeConfig.knowledge.enabled === true and query_knowledge_base was not explicitly configured or disabled,
   *      resolves query_knowledge_base if deploymentId exists.
   */
  resolveTools(
    runtimeConfig?: RuntimeAgentConfig,
    context?: ToolRuntimeContext | string,
  ): NativeLiveKitTool[] {
    const resolvedContext: ToolRuntimeContext =
      typeof context === 'string'
        ? { deploymentId: context }
        : context || { deploymentId: runtimeConfig?.deployment?.deploymentId || '' };

    if (!runtimeConfig) {
      return [];
    }

    const resolvedTools: NativeLiveKitTool[] = [];
    const seenToolNames = new Set<string>();
    let queryKnowledgeBaseConfigured = false;

    const toolsConfig = runtimeConfig.tools;

    // Process explicit tools list if present and tools are enabled
    if (toolsConfig && toolsConfig.enabled !== false && Array.isArray(toolsConfig.tools)) {
      for (const toolDef of toolsConfig.tools) {
        // Filter out disabled individual tools
        if (!toolDef || toolDef.enabled === false) {
          continue;
        }

        const rawToolId = toolDef.toolId || toolDef.name;
        // Normalize tool ID through canonical shared utility
        const canonicalToolId = normalizeToolId(rawToolId) || rawToolId;

        if (canonicalToolId === 'query_knowledge_base') {
          queryKnowledgeBaseConfigured = true;
        }

        // Resolve factory by canonical tool ID
        const factory = this.get(canonicalToolId);
        if (!factory) {
          console.warn(
            `[ToolRegistry] Unknown toolId '${rawToolId}' (canonical: '${canonicalToolId}'). No factory registered for this tool. Skipping without arbitrary execution.`,
          );
          continue;
        }

        // The LLM-facing function name must be a valid identifier.
        // Use custom valid identifier if provided; otherwise use canonical factory toolId.
        const candidateName = isValidToolName(toolDef.name) ? toolDef.name : factory.toolId;
        const llmName = isValidToolName(candidateName) ? candidateName : factory.toolId;

        // Deduplication: prevent duplicate exposed names to LLM
        if (seenToolNames.has(llmName)) {
          console.warn(`[ToolRegistry] Duplicate tool name '${llmName}' detected. Skipping duplicate.`);
          continue;
        }

        try {
          const tool = factory.create(resolvedContext, toolDef, runtimeConfig);
          // Ensure tool name is a valid identifier
          tool.name = llmName;
          // Apply custom description if provided
          if (toolDef.description && toolDef.description.trim()) {
            tool.description = toolDef.description.trim();
          }

          // Wrap tool.execute with monotonic timing instrumentation
          const originalExecute = tool.execute.bind(tool);
          (tool as any).execute = async (...args: any[]) => {
            const t0 = performance.now();
            console.log(
              `[AudioTiming] tool_started tool=${llmName} callSessionId=${resolvedContext.callSessionId || 'none'} deploymentId=${resolvedContext.deploymentId || 'none'}`,
            );
            try {
              const res = await (originalExecute as any)(...args);
              const durationMs = Math.round(performance.now() - t0);
              console.log(
                `[AudioTiming] tool_completed tool=${llmName} callSessionId=${resolvedContext.callSessionId || 'none'} durationMs=${durationMs}`,
              );
              return res;
            } catch (err) {
              const durationMs = Math.round(performance.now() - t0);
              console.log(
                `[AudioTiming] tool_completed tool=${llmName} callSessionId=${resolvedContext.callSessionId || 'none'} durationMs=${durationMs} error=true`,
              );
              throw err;
            }
          };

          resolvedTools.push(tool);
          seenToolNames.add(llmName);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[ToolRegistry] Failed to instantiate tool '${canonicalToolId}':`, errMsg);
        }
      }
    }

    // Check if query_knowledge_base is explicitly disabled in tools.tools
    const isExplicitlyDisabledInTools =
      toolsConfig &&
      Array.isArray(toolsConfig.tools) &&
      toolsConfig.tools.some(
        (t) => (t.toolId === 'query_knowledge_base' || t.name === 'query_knowledge_base') && t.enabled === false,
      );

    // Fallback: If knowledge is enabled top-level and not already configured in tools.tools
    if (
      !queryKnowledgeBaseConfigured &&
      !isExplicitlyDisabledInTools &&
      runtimeConfig.knowledge?.enabled &&
      resolvedContext.deploymentId &&
      !seenToolNames.has('query_knowledge_base')
    ) {
      const knowledgeFactory = this.get('query_knowledge_base');
      if (knowledgeFactory) {
        try {
          const tool = knowledgeFactory.create(resolvedContext, undefined, runtimeConfig);
          const originalExecute = tool.execute.bind(tool);
          (tool as any).execute = async (...args: any[]) => {
            const t0 = performance.now();
            console.log(
              `[AudioTiming] tool_started tool=query_knowledge_base callSessionId=${resolvedContext.callSessionId || 'none'} deploymentId=${resolvedContext.deploymentId || 'none'}`,
            );
            try {
              const res = await (originalExecute as any)(...args);
              const durationMs = Math.round(performance.now() - t0);
              console.log(
                `[AudioTiming] tool_completed tool=query_knowledge_base callSessionId=${resolvedContext.callSessionId || 'none'} durationMs=${durationMs}`,
              );
              return res;
            } catch (err) {
              const durationMs = Math.round(performance.now() - t0);
              console.log(
                `[AudioTiming] tool_completed tool=query_knowledge_base callSessionId=${resolvedContext.callSessionId || 'none'} durationMs=${durationMs} error=true`,
              );
              throw err;
            }
          };
          resolvedTools.push(tool);
          seenToolNames.add('query_knowledge_base');
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error('[ToolRegistry] Failed to instantiate default knowledge tool:', errMsg);
        }
      }
    }

    return resolvedTools;
  }
}

export const toolRegistry = new ToolRegistry();
