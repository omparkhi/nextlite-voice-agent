import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { RuntimeToolDefinition } from '@nextlite/shared';
import type { ToolRuntimeContext, ToolFactory, NativeLiveKitTool } from './toolRegistry.ts';

export const createBookAppointmentArgsSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(1, 'Customer name is required')
    .max(255, 'Customer name exceeds 255 characters')
    .describe('Full name of the customer requesting the appointment or consultation'),
  customerPhone: z
    .string()
    .trim()
    .max(50, 'Customer phone exceeds 50 characters')
    .optional()
    .describe(
      'Contact phone number for the appointment. Omit or leave empty if the caller requests using their current/incoming phone number',
    ),
  title: z
    .string()
    .trim()
    .min(1, 'Appointment title/purpose is required')
    .max(255, 'Title exceeds 255 characters')
    .describe('Purpose or title of the booking (e.g. Doctor Consultation, Site Visit, Demo Class, Loan Consultation)'),
  resourceName: z
    .string()
    .trim()
    .max(255, 'Resource name exceeds 255 characters')
    .optional()
    .describe('Specific staff member, doctor, teacher, advisor, property unit, or resource requested (if any)'),
  bookingDate: z
    .string()
    .trim()
    .min(1, 'Booking date is required')
    .max(50, 'Booking date exceeds 50 characters')
    .describe('Requested date of the appointment in YYYY-MM-DD format or caller-specified date'),
  bookingTime: z
    .string()
    .trim()
    .min(1, 'Booking time is required')
    .max(50, 'Booking time exceeds 50 characters')
    .describe('Requested time of the appointment (e.g. 15:00, 3:00 PM, 11:30 AM)'),
  notes: z
    .string()
    .trim()
    .max(2000, 'Notes exceed 2000 characters')
    .optional()
    .describe('Any additional notes, symptoms, preferences, or questions mentioned by the caller'),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional structured metadata attributes associated with the booking request'),
});

export type CreateBookAppointmentArgs = z.infer<typeof createBookAppointmentArgsSchema>;

export interface AppointmentToolSuccessResult {
  success: true;
  appointmentId: string;
  appointmentNumber: string;
  status: 'REQUESTED';
  message: string;
}

export interface AppointmentToolFailureResult {
  success: false;
  error: string;
  message: string;
}

export type AppointmentToolResult = AppointmentToolSuccessResult | AppointmentToolFailureResult;

export interface CreateBookAppointmentToolOptions {
  apiUrl?: string | undefined;
  workerSecret?: string | undefined;
  timeoutMs?: number | undefined;
  fetchFn?: typeof fetch | undefined;
}

/**
 * Creates the native LiveKit `book_appointment` function tool.
 * 
 * Booking Semantics & Anti-Hallucination:
 * - Always creates records with `status = 'REQUESTED'`.
 * - Operating hours do NOT indicate slot availability.
 * - Explicitly informs caller that the request is recorded and awaiting verification/confirmation.
 * - Does NOT claim confirmed booking, slot reservation, or calendar locking.
 * 
 * Security & Boundary Rules:
 * - `deploymentId` and `callSessionId` are injected exclusively from trusted `runtimeContext`.
 * - The LLM can never provide or override tenantId, agentId, or deploymentId.
 * - If `customerPhone` is omitted in the tool call, falls back to trusted `runtimeContext.callerPhone`.
 * - Structured success (`success: true`) or failure (`success: false`) is returned to prevent hallucinations.
 */
export function createBookAppointmentTool(
  context: ToolRuntimeContext,
  options?: CreateBookAppointmentToolOptions,
): NativeLiveKitTool {
  if (!context.deploymentId || context.deploymentId.trim() === '') {
    throw new Error('[AppointmentTool] deploymentId is required in runtime context to initialize book_appointment tool');
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
    name: 'book_appointment',
    description:
      'Record an appointment, consultation, site visit, demo session, or meeting request when the caller provides requested date, time, and customer details. You MUST call this tool when the user wants to submit or book an appointment. Note: Records an unconfirmed request (REQUESTED status); team verifies availability.',
    parameters: createBookAppointmentArgsSchema,
    execute: async (args: CreateBookAppointmentArgs): Promise<AppointmentToolResult> => {
      // 1. Validate parameters with Zod schema
      const parsed = createBookAppointmentArgsSchema.safeParse(args);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        return {
          success: false,
          error: 'INVALID_ARGUMENTS',
          message: `Invalid appointment request details: ${errorMsg}`,
        };
      }

      const { customerName, customerPhone, title, resourceName, bookingDate, bookingTime, notes, metadata } =
        parsed.data;

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
            'Customer phone number is required to record an appointment request. Please ask the caller for their contact phone number.',
        };
      }

      // 3. Prepare payload for internal control-plane endpoint
      const requestPayload: Record<string, unknown> = {
        deploymentId: trustedDeploymentId,
        customerName: customerName.trim(),
        customerPhone: effectivePhone,
        title: title.trim(),
        bookingDate: bookingDate.trim(),
        bookingTime: bookingTime.trim(),
        status: 'REQUESTED',
      };

      if (trustedCallSessionId) {
        requestPayload.callSessionId = trustedCallSessionId;
      }
      if (resourceName && resourceName.trim().length > 0) {
        requestPayload.resourceName = resourceName.trim();
      }
      if (notes && notes.trim().length > 0) {
        requestPayload.notes = notes.trim();
      }
      if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
        requestPayload.metadata = metadata;
      }

      // 4. Send authenticated request to POST /api/internal/appointments
      const url = `${baseUrl}/api/internal/appointments`;
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
                  : 'APPOINTMENT_REQUEST_FAILED');

          console.warn(
            `[AppointmentTool] API returned status ${status} for appointment creation:`,
            errorData?.error || errorData?.message,
          );

          return {
            success: false,
            error: errorCode,
            message: 'Unable to record the appointment request at this time. Please try again later.',
          };
        }

        const responseData = (await response.json()) as { id?: string; appointmentNumber?: string; status?: string };
        const appointmentId = responseData?.id || 'appointment-created';
        const appointmentNumber = responseData?.appointmentNumber || 'A-001';

        return {
          success: true,
          appointmentId,
          appointmentNumber,
          status: 'REQUESTED',
          message: `Your appointment request has been recorded with appointment number ${appointmentNumber}. The team will verify availability and confirm it.`,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        const isAbort = (err as Error)?.name === 'AbortError';
        const errorCode = isAbort ? 'SERVICE_UNAVAILABLE' : 'CONNECTION_ERROR';
        console.warn(`[AppointmentTool] Failed to connect to appointments API:`, (err as Error)?.message || err);

        return {
          success: false,
          error: errorCode,
          message: 'Unable to record the appointment request due to a temporary network issue. Please try again later.',
        };
      }
    },
  });
}

/**
 * Built-in tool factory for `book_appointment`.
 */
export const bookAppointmentToolFactory: ToolFactory = {
  toolId: 'book_appointment',
  create(
    context: ToolRuntimeContext,
    toolConfig?: RuntimeToolDefinition,
  ): NativeLiveKitTool {
    const baseTool = createBookAppointmentTool(context, {
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
