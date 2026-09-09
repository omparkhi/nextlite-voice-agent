/**
 * MODULE G — CALL LIFECYCLE PERSISTENCE & METADATA DETECTION
 * 
 * Provides deterministic helpers for:
 * 1. Call direction detection (WEB_TEST vs OUTBOUND vs INBOUND)
 * 2. Caller phone number extraction from room/identity/SIP attributes
 * 3. Plain text transcript formatting from debug turns
 */

export type CallDirection = 'INBOUND' | 'OUTBOUND' | 'WEB_TEST';

export interface DetectedCallContext {
  direction: CallDirection;
  callerNumber: string | null;
}

/**
 * Detects call direction and caller phone number based on room name, participant identity, and SIP attributes.
 * 
 * Rules:
 * 1. WEB_TEST:
 *    - roomName starts with 'test-' OR participant identity starts with 'tester-'
 *    - callerNumber is strictly null (no fabricated phone numbers)
 * 2. OUTBOUND:
 *    - roomName starts with 'phone-test-' OR participant identity starts with 'sip-' from outbound SIP flow
 *    - callerNumber extracted from participant identity (e.g. sip-+919876543210-1234) or SIP attributes if valid E.164
 * 3. INBOUND:
 *    - Standard SIP inbound participant/room
 *    - callerNumber extracted from participant attributes ('sip.phoneNumber' or 'sip.callerId' or 'sip.trunkPhoneNumber') if valid
 */
export function detectCallContext(
  roomName?: string | null | undefined,
  participantIdentity?: string | null | undefined,
  participantAttributes?: Record<string, string> | null | undefined,
): DetectedCallContext {
  const cleanRoom = (roomName || '').trim();
  const cleanIdentity = (participantIdentity || '').trim();

  // 1. WEB_TEST Detection
  if (cleanRoom.startsWith('test-') || cleanIdentity.startsWith('tester-')) {
    return {
      direction: 'WEB_TEST',
      callerNumber: null,
    };
  }

  // 2. OUTBOUND Detection
  if (cleanRoom.startsWith('phone-test-')) {
    let phone: string | null = null;
    if (participantAttributes?.['sip.phoneNumber']) {
      phone = participantAttributes['sip.phoneNumber'].trim();
    } else if (cleanIdentity.startsWith('sip-')) {
      // Identity format from createOutboundPhoneCall: sip-<cleanPhone>-<timestamp>
      const match = cleanIdentity.match(/^sip-([0-9+]+)-/);
      if (match && match[1]) {
        phone = match[1].startsWith('+') ? match[1] : `+${match[1]}`;
      }
    }
    return {
      direction: 'OUTBOUND',
      callerNumber: phone || null,
    };
  }

  // 3. INBOUND / Other SIP Detection
  let inboundPhone: string | null = null;
  if (participantAttributes) {
    const raw =
      participantAttributes['sip.phoneNumber'] ||
      participantAttributes['sip.callerId'] ||
      participantAttributes['sip.trunkPhoneNumber'] ||
      participantAttributes['caller_id'] ||
      participantAttributes['phone_number'];
    if (raw && typeof raw === 'string' && raw.trim().length > 0) {
      inboundPhone = raw.trim();
    }
  }

  return {
    direction: 'INBOUND',
    callerNumber: inboundPhone,
  };
}

/**
 * Formats transcript text from debug turns into a readable plain-text representation.
 */
export function formatPlainTranscript(
  turns: Array<{ user?: { transcript: string } | undefined; agent?: { response: string } | undefined }>,
): string {
  const lines: string[] = [];
  for (const turn of turns) {
    if (turn.user?.transcript && turn.user.transcript.trim().length > 0) {
      lines.push(`User: ${turn.user.transcript.trim()}`);
    }
    if (turn.agent?.response && turn.agent.response.trim().length > 0) {
      lines.push(`Assistant: ${turn.agent.response.trim()}`);
    }
  }
  return lines.join('\n');
}
