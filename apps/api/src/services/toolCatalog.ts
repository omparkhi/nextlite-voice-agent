import { KNOWN_PLATFORM_TOOL_IDS, type KnownPlatformToolId } from './template';

export interface ToolCatalogParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
}

export interface ToolCatalogItem {
  toolId: KnownPlatformToolId;
  name: string;
  displayName: string;
  description: string;
  category: 'Knowledge' | 'Leads' | 'Scheduling' | 'Actions' | string;
  parameters: ToolCatalogParameter[];
  confirmationSupported: boolean;
}

/**
 * PLATFORM_TOOL_CATALOG
 * 
 * Authoritative Admin Discovery Catalog of platform tools.
 * Exposes safe, UI-facing metadata for platform capabilities.
 * 
 * Rules:
 * - Every catalog toolId must exist in KNOWN_PLATFORM_TOOL_IDS and have a registered factory in ToolRegistry.
 * - Never expose private internal URLs, execution callbacks, API secrets, or worker credentials.
 * - This catalog is strictly for discovery and configuration UI; agent_versions.configuration.tools.bindings
 *   remains the sole runtime authority.
 */
export const PLATFORM_TOOL_CATALOG: readonly ToolCatalogItem[] = [
  {
    toolId: 'query_knowledge_base',
    name: 'query_knowledge_base',
    displayName: 'Knowledge Base Retrieval',
    description: 'Search attached documents and FAQs to answer specific caller questions with accurate facts.',
    category: 'Knowledge',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Specific topic or question to look up in the knowledge base',
        required: true,
      },
    ],
    confirmationSupported: false,
  },
  {
    toolId: 'create_callback_lead',
    name: 'create_callback_lead',
    displayName: 'Callback & Lead Capture',
    description: 'Record a customer lead or callback request when the caller asks for follow-up or wants a team member to contact them.',
    category: 'Leads',
    parameters: [
      {
        name: 'customerName',
        type: 'string',
        description: 'Full name of the customer requesting callback',
        required: true,
      },
      {
        name: 'customerPhone',
        type: 'string',
        description: 'Contact phone number (defaults to incoming caller number if omitted)',
        required: false,
      },
      {
        name: 'customerEmail',
        type: 'string',
        description: 'Optional customer email address',
        required: false,
      },
      {
        name: 'interestCategory',
        type: 'string',
        description: 'Topic, product, course, or service of interest',
        required: false,
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Summary notes or preferred callback time window',
        required: false,
      },
    ],
    confirmationSupported: false,
  },
  {
    toolId: 'book_appointment',
    name: 'book_appointment',
    displayName: 'Appointment & Consultation Booking',
    description: 'Record a customer appointment, consultation, site visit, demo class, or service booking request.',
    category: 'Scheduling',
    parameters: [
      {
        name: 'customerName',
        type: 'string',
        description: 'Full name of the customer requesting booking',
        required: true,
      },
      {
        name: 'customerPhone',
        type: 'string',
        description: 'Contact phone number (defaults to incoming caller number if omitted)',
        required: false,
      },
      {
        name: 'title',
        type: 'string',
        description: 'Purpose or title of the booking',
        required: true,
      },
      {
        name: 'bookingDate',
        type: 'string',
        description: 'Requested date of appointment (YYYY-MM-DD)',
        required: true,
      },
      {
        name: 'bookingTime',
        type: 'string',
        description: 'Requested time of appointment (e.g. 10:00 AM, 15:30)',
        required: true,
      },
      {
        name: 'resourceName',
        type: 'string',
        description: 'Specific doctor, advisor, teacher, or staff member requested (optional)',
        required: false,
      },
      {
        name: 'notes',
        type: 'string',
        description: 'Additional notes or requirements',
        required: false,
      },
    ],
    confirmationSupported: false,
  },
] as const;

/**
 * Invariant check: ensure catalog tool IDs perfectly align with registered platform tool IDs.
 */
export function validateCatalogAlignment(): void {
  const catalogToolIds = new Set(PLATFORM_TOOL_CATALOG.map((t) => t.toolId));
  for (const id of KNOWN_PLATFORM_TOOL_IDS) {
    if (!catalogToolIds.has(id)) {
      throw new Error(`[ToolCatalog] Missing catalog definition for registered platform tool ID: ${id}`);
    }
  }
}

// Run alignment check at startup/module load
validateCatalogAlignment();

/**
 * Returns a cloned array of safe platform tool catalog items.
 */
export function getPlatformToolCatalog(): ToolCatalogItem[] {
  return PLATFORM_TOOL_CATALOG.map((item) => ({
    ...item,
    parameters: item.parameters.map((p) => ({ ...p })),
  }));
}
