import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { RuntimeToolDefinition } from '@nextlite/shared';
import type { ToolRuntimeContext, ToolFactory, NativeLiveKitTool } from './toolRegistry.ts';

export const createCallbackLeadArgsSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(1, 'Customer name is required')
    .max(255, 'Customer name exceeds 255 characters')
    .describe('Full name of the customer requesting a callback or follow-up'),
  customerPhone: z
    .string()
    .trim()
    .max(50, 'Customer phone exceeds 50 characters')
    .optional()
    .describe(
      'Contact phone number for the callback. Omit or leave empty if the caller requests using their current/incoming phone number',
    ),
  customerEmail: z
    .string()
    .trim()
    .email('Invalid email address')
    .max(255)
    .optional()
    .or(z.literal(''))
    .describe('Optional email address of the customer'),
  interestCategory: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe(
      'Specific service, product, property, course, inquiry type, or subject the customer wants to discuss',
    ),
  notes: z
    .string()
    .trim()
    .max(2000, 'Notes exceed 2000 characters')
    .optional()
    .describe('Summary notes of the request, preferred callback time window, or key customer questions'),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional structured metadata attributes associated with the lead'),
});

export type CreateCallbackLeadArgs = z.infer<typeof createCallbackLeadArgsSchema>;

export interface LeadToolSuccessResult {
  success: true;
  leadId: string;
  message: string;
}

export interface LeadToolFailureResult {
  success: false;
  error: string;
  message: string;
}

export type LeadToolResult = LeadToolSuccessResult | LeadToolFailureResult;

export interface CreateCallbackLeadToolOptions {
  apiUrl?: string | undefined;
  workerSecret?: string | undefined;
  timeoutMs?: number | undefined;
  fetchFn?: typeof fetch | undefined;
}

/**
 * Creates the native LiveKit `create_callback_lead` function tool.
 * 
 * Security & Boundary Rules:
 * - `deploymentId` and `callSessionId` are injected exclusively from trusted `runtimeContext`.
 * - The LLM can never provide or override tenantId, agentId, or deploymentId.
 * - If `customerPhone` is omitted in the tool call, falls back to trusted `runtimeContext.callerPhone`.
 * - Structured success (`success: true`) or failure (`success: false`) is returned to prevent hallucinations.
 */
export function createCallbackLeadTool(
  context: ToolRuntimeContext,
  options?: CreateCallbackLeadToolOptions,
): NativeLiveKitTool {
  if (!context.deploymentId || context.deploymentId.trim() === '') {
    throw new Error('[LeadTool] deploymentId is required in runtime context to initialize create_callback_lead tool');
  }

  const trustedDeploymentId = context.deploymentId.trim();
  const trustedCallSessionId = context.callSessionId?.trim();
  const trustedCallerPhone = context.callerPhone?.trim();

  const baseUrl = (options?.apiUrl || context.apiUrl || process.env.NEXTLITE_API_URL || 'http://localhost:3001').replace(
    /\/+$/,
    '',
  );
  const workerSecret =
    options?.workerSecret || context.workerSecret || process.env.LIVEKIT_WORKER_SECRET || 'dev-livekit-worker-secret-v3';
  const timeoutMs = options?.timeoutMs || 4000;
  const customFetch = options?.fetchFn || context.fetchFn || globalThis.fetch;

  return llm.tool({
    name: 'create_callback_lead',
    description:
      'Record a customer lead or callback request when the caller explicitly asks for follow-up, requests a callback, or clearly wants a team member to contact them about a product or service.',
    parameters: createCallbackLeadArgsSchema,
    execute: async (args: CreateCallbackLeadArgs): Promise<LeadToolResult> => {
      // 1. Validate parameters with Zod schema
      const parsed = createCallbackLeadArgsSchema.safeParse(args);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        return {
          success: false,
          error: 'INVALID_ARGUMENTS',
          message: `Invalid callback request details: ${errorMsg}`,
        };
      }

      const { customerName, customerPhone, customerEmail, interestCategory, notes, metadata } = parsed.data;

      // 2. Caller phone fallback: use explicit customerPhone if provided, otherwise fallback to trusted callerPhone
      let effectivePhone: string | undefined;
      if (customerPhone && customerPhone.trim().length > 0) {
        effectivePhone = customerPhone.trim();
      } else if (trustedCallerPhone && trustedCallerPhone.length > 0) {
        effectivePhone = trustedCallerPhone;
      }

      if (!effectivePhone) {
        return {
          success: false,
          error: 'INVALID_ARGUMENTS',
          message:
            'Customer phone number is required to record a callback request. Please ask the caller for their contact phone number.',
        };
      }

      // 3. Prepare payload for internal control-plane endpoint
      const requestPayload: Record<string, unknown> = {
        deploymentId: trustedDeploymentId,
        customerName: customerName.trim(),
        customerPhone: effectivePhone,
      };

      if (trustedCallSessionId) {
        requestPayload.callSessionId = trustedCallSessionId;
      }
      if (customerEmail && customerEmail.trim().length > 0) {
        requestPayload.customerEmail = customerEmail.trim();
      }
      if (interestCategory && interestCategory.trim().length > 0) {
        requestPayload.interestCategory = interestCategory.trim();
      }
      if (notes && notes.trim().length > 0) {
        requestPayload.notes = notes.trim();
      }
      if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
        requestPayload.metadata = metadata;
      }

      // 4. Send authenticated request to POST /api/internal/leads
      const url = `${baseUrl}/api/internal/leads`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await customFetch(url, {
          method: 'POST',
          headers: {
            'x-worker-secret': workerSecret,
            'Authorization': `Bearer ${workerSecret}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorData: { error?: string; message?: string; code?: string } | null = null;
          try {
            errorData = (await response.json()) as { error?: string; message?: string; code?: string };
          } catch {
            errorData = null;
          }

          const status = response.status;
          const errorCode =
            errorData?.code ||
            (status === 401
              ? 'UNAUTHORIZED'
              : status === 404
                ? 'DEPLOYMENT_NOT_FOUND'
                : status === 409
                  ? 'DEPLOYMENT_INACTIVE'
                  : 'LEAD_CREATION_FAILED');

          console.warn(`[LeadTool] API returned status ${status} for lead creation:`, errorData?.error || errorData?.message);

          return {
            success: false,
            error: errorCode,
            message: 'Unable to record the callback request at this time. Please try again later.',
          };
        }

        const responseData = (await response.json()) as { id?: string };
        const leadId = responseData?.id || 'lead-created';

        return {
          success: true,
          leadId,
          message: 'Callback request recorded successfully. Our team will contact the customer.',
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        const isAbort = (err as Error)?.name === 'AbortError';
        const errorCode = isAbort ? 'SERVICE_UNAVAILABLE' : 'CONNECTION_ERROR';
        console.warn(`[LeadTool] Failed to connect to leads API:`, (err as Error)?.message || err);

        return {
          success: false,
          error: errorCode,
          message: 'Unable to record the callback request due to a temporary network issue. Please try again later.',
        };
      }
    },
  });
}

/**
 * Built-in tool factory for `create_callback_lead`.
 */
export const callbackLeadToolFactory: ToolFactory = {
  toolId: 'create_callback_lead',
  create(
    context: ToolRuntimeContext,
    toolConfig?: RuntimeToolDefinition,
  ): NativeLiveKitTool {
    const baseTool = createCallbackLeadTool(context, {
      apiUrl: context.apiUrl,
      workerSecret: context.workerSecret,
      fetchFn: context.fetchFn,
    });

    if (toolConfig?.description && toolConfig.description.trim()) {
      baseTool.description = toolConfig.description.trim();
    }

    return baseTool;
  },
};
