import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tenants, agents } from '../db/schema.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createChildLogger } from '../lib/logger.js';
import { createTelephonyService } from './telephony.js';
import { liveTranscriptStore } from './transcriptStore.js';

const logger = createChildLogger({ module: 'outbound-call-routes' });
const router = Router();
const callStatusMap = new Map<string, string>();
const callProviderMap = new Map<string, 'exotel' | 'plivo'>();

/**
 * Validate Indian mobile phone number.
 * Accepts formats: +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX
 * Rejects: non-numeric, too short, too long, invalid patterns
 */
function validateIndianMobileNumber(phone: string): { valid: boolean; normalized?: string; error?: string } {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');

  if (cleaned.startsWith('+91')) {
    const number = cleaned.slice(3);
    if (number.length !== 10 || !/^[6-9]\d{9}$/.test(number)) {
      return { valid: false, error: 'Invalid Indian mobile number after +91 prefix' };
    }
    return { valid: true, normalized: `0${number}` };
  }

  if (cleaned.startsWith('91') && cleaned.length === 12) {
    const number = cleaned.slice(2);
    if (!/^[6-9]\d{9}$/.test(number)) {
      return { valid: false, error: 'Invalid Indian mobile number after 91 prefix' };
    }
    return { valid: true, normalized: `0${number}` };
  }

  if (cleaned.startsWith('0') && cleaned.length === 11) {
    const number = cleaned.slice(1);
    if (!/^[6-9]\d{9}$/.test(number)) {
      return { valid: false, error: 'Invalid Indian mobile number after 0 prefix' };
    }
    return { valid: true, normalized: `0${number}` };
  }

  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: `0${cleaned}` };
  }

  return { valid: false, error: 'Invalid Indian mobile number format. Expected 10 digits starting with 6-9' };
}

const outboundCallSchema = z.object({
  phoneNumber: z.string().min(1).max(20).refine(
    (val) => validateIndianMobileNumber(val).valid,
    (val) => ({ message: validateIndianMobileNumber(val).error ?? 'Invalid phone number' })
  ),
  provider: z.enum(['exotel', 'plivo']).optional(),
  record: z.boolean().optional().default(false),
  timeLimit: z.number().min(30).max(14400).optional(),
});

async function verifyClient(clientId: string): Promise<boolean> {
  const client = await db.query.tenants.findFirst({ where: eq(tenants.id, clientId) });
  return !!client;
}

async function verifyAgent(agentId: string, tenantId: string): Promise<boolean> {
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
  });
  return !!agent;
}

/**
 * ALL /passthrough
 * PUBLIC endpoint for Exotel Passthrough XML.
 * Exotel calls this URL via HTTP POST when the phone call connects.
 */
router.all('/passthrough', (req: Request, res: Response) => {
  const tenantId = (req.query['tenant-id'] ?? req.query['tenantId'] ?? req.body['tenant-id']) as string ?? '';
  const agentId = (req.query['agent-id'] ?? req.query['agentId'] ?? req.body['agent-id']) as string ?? '';

  const streamHost = process.env.EXOTEL_STREAM_HOST ?? process.env.HOST ?? 'localhost';
  const streamPort = process.env.PORT ?? '3001';
  const isPublicDomain = streamHost.includes('.') && !streamHost.startsWith('127.') && !streamHost.startsWith('192.');
  const protocol = isPublicDomain || process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
  const portStr = isPublicDomain ? '' : `:${streamPort}`;
  const streamUrl = `${protocol}://${streamHost}${portStr}/api/telephony/stream?tenant-id=${tenantId}&agent-id=${agentId}`;

  const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${streamUrl}"></Stream>
    </Connect>
</Response>`;

  logger.info({ streamUrl }, 'Exotel passthrough XML requested');
  res.set('Content-Type', 'text/xml');
  res.send(xmlResponse);
});

/**
 * GET & POST /api/telephony/plivo/answer
 * Serves Plivo XML for both inbound calls to Plivo number & outbound API calls.
 */
const plivoAnswerHandler = (req: Request, res: Response) => {
  const tenantId = (req.query['tenant-id'] || req.body['tenant-id'] || req.body.tenantId || '') as string;
  const agentId = (req.query['agent-id'] || req.body['agent-id'] || req.body.agentId || '') as string;

  const streamHost = process.env.PLIVO_STREAM_HOST ?? process.env.EXOTEL_STREAM_HOST ?? process.env.HOST ?? 'localhost';
  const streamPort = process.env.PORT ?? '3001';
  const isPublicDomain = streamHost.includes('.') && !streamHost.startsWith('127.') && !streamHost.startsWith('192.');
  const protocol = isPublicDomain || process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
  const httpProtocol = isPublicDomain || process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const portStr = isPublicDomain ? '' : `:${streamPort}`;

  const rawWssUrl = `${protocol}://${streamHost}${portStr}/api/telephony/plivo/stream?tenant-id=${tenantId}&agent-id=${agentId}`;
  const wssUrl = rawWssUrl.replace(/&/g, '&amp;');

  const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=8000">${wssUrl}</Stream>
</Response>`;

  res.set('Content-Type', 'text/xml');
  res.send(xmlResponse);
};

router.get('/plivo/answer', plivoAnswerHandler);
router.post('/plivo/answer', plivoAnswerHandler);

/**
 * POST /api/telephony/plivo/status
 * Plivo stream lifecycle and call status callback endpoint.
 */
router.post('/plivo/status', (req: Request, res: Response) => {
  try {
    const { CallUUID, CallStatus, Event } = req.body;
    const sid = CallUUID || req.body.call_uuid || req.body.streamId;
    const status = (CallStatus || Event || 'in-progress').toLowerCase();

    if (sid) {
      callStatusMap.set(sid, status);
    }
    logger.info({ sid, status, event: Event }, 'Plivo call/stream status callback received');
    res.sendStatus(200);
  } catch {
    res.sendStatus(200);
  }
});

/**
 * POST /api/telephony/plivo/recording
 * Plivo recording callback endpoint.
 */
router.post('/plivo/recording', (req: Request, res: Response) => {
  try {
    const { recording_id, recording_url, recording_duration_ms, call_uuid } = req.body;
    logger.info({ recording_id, recording_url, recording_duration_ms, call_uuid }, 'Plivo call recording callback received');
    res.sendStatus(200);
  } catch {
    res.sendStatus(200);
  }
});

/**
 * POST /clients/:clientId/agents/:agentId/calls/outbound
 * Initiate an outbound phone call for an agent.
 */
router.post(
  '/clients/:clientId/agents/:agentId/calls/outbound',
  authenticateToken,
  requireRole('ADMIN'),
  validate(outboundCallSchema),
  async (req: Request, res: Response) => {
    try {
      const { clientId, agentId } = req.params;

      // Verify agent exists and belongs to client (with fallback for stale URL IDs)
      let [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.tenantId, clientId)))
        .limit(1);

      if (!agent) {
        const [fallback] = await db
          .select()
          .from(agents)
          .where(eq(agents.tenantId, clientId))
          .limit(1);
        if (fallback) {
          agent = fallback;
        }
      }

      if (!agent) {
        const [anyAgent] = await db.select().from(agents).limit(1);
        if (anyAgent) {
          agent = anyAgent;
        }
      }

      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      const requestedProvider = req.body.provider || process.env.TELEPHONY_PROVIDER || 'exotel';
      const telephonyService = createTelephonyService(requestedProvider);
      if (!telephonyService) {
        if (requestedProvider === 'plivo') {
          res.status(503).json({ error: 'Plivo is not configured. Please configure PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN.' });
        } else {
          res.status(503).json({ error: 'Telephony service is not configured (check EXOTEL_* environment variables)' });
        }
        return;
      }

      const { phoneNumber, record, timeLimit } = req.body;

      // Normalize phone number
      const validation = validateIndianMobileNumber(phoneNumber);
      const normalizedPhone = validation.normalized!;

      // Build WSS URL & Status Callback for Telephony Provider
      const streamHost = requestedProvider === 'plivo'
        ? (process.env.PLIVO_STREAM_HOST ?? process.env.EXOTEL_STREAM_HOST ?? process.env.HOST ?? 'localhost')
        : (process.env.EXOTEL_STREAM_HOST ?? process.env.HOST ?? 'localhost');
      const streamPort = process.env.PORT ?? '3001';
      const isPublicDomain = streamHost.includes('.') && !streamHost.startsWith('127.') && !streamHost.startsWith('192.');
      const protocol = isPublicDomain || process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
      const httpProtocol = isPublicDomain || process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const portStr = isPublicDomain ? '' : `:${streamPort}`;

      const streamUrl = requestedProvider === 'plivo'
        ? `${protocol}://${streamHost}${portStr}/api/telephony/plivo/stream?tenant-id=${clientId}&agent-id=${agentId}`
        : `${protocol}://${streamHost}${portStr}/api/telephony/stream?sample-rate=8000&tenant-id=${clientId}&agent-id=${agentId}`;

      const statusCallback = isPublicDomain
        ? `${httpProtocol}://${streamHost}/api/telephony/${requestedProvider === 'plivo' ? 'plivo/status' : 'calls/status'}`
        : undefined;

      const callerId = requestedProvider === 'plivo'
        ? (process.env.PLIVO_CALLER_ID || process.env.EXOTEL_CALLER_ID || '')
        : (process.env.EXOTEL_CALLER_ID || '');

      // Format destination number (Plivo requires +91... E.164, Exotel uses 0... format)
      const tenDigit = normalizedPhone.replace(/^0/, '');
      const destinationPhone = requestedProvider === 'plivo' ? `+91${tenDigit}` : normalizedPhone;

      logger.info({ requestedProvider, streamUrl, statusCallback, callerId, destinationPhone }, 'Initiating outbound call');

      const result = await telephonyService.makeOutboundCall({
        from: destinationPhone,
        callerId,
        streamUrl,
        statusCallback,
        record,
        timeLimit,
        customField: JSON.stringify({ tenantId: clientId, agentId }),
      });

      if (result.callSid) {
        callStatusMap.set(result.callSid, (result.status || 'ringing').toLowerCase());
        callProviderMap.set(result.callSid, requestedProvider as 'exotel' | 'plivo');
      }

      logger.info({
        callSid: result.callSid,
        clientId,
        agentId,
        phoneNumber: normalizedPhone,
      }, 'Outbound call initiated');

      res.json({
        callSid: result.callSid,
        status: result.status,
        phoneNumber: normalizedPhone,
      });
    } catch (error: any) {
      logger.error({
        errMessage: error?.message,
        errStack: error?.stack,
        clientId: req.params.clientId,
        agentId: req.params.agentId,
      }, 'Failed to initiate outbound call');
      res.status(500).json({ error: error?.message || 'Failed to initiate outbound call' });
    }
  }
);

/**
 * GET /calls/:callSid/status
 * Get status of an active call. (Admin authentication required)
 */
router.get(
  '/calls/:callSid/status',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');

      const { callSid } = req.params;
      let status = callStatusMap.get(callSid);

      const provider = callProviderMap.get(callSid) || 'exotel';
      const telephonyService = createTelephonyService(provider);
      if (telephonyService && (!status || ['ringing', 'queued', 'in-progress', 'active'].includes(status))) {
        const details = await telephonyService.getCall(callSid).catch(() => null);
        if (details && details.status) {
          status = details.status.toLowerCase();
          callStatusMap.set(callSid, status);
        }
      }

      // If status is still unknown or call hung up, return completed so polling stops
      res.json({ callSid, status: status || 'completed' });
    } catch {
      res.json({ callSid: req.params.callSid, status: 'completed' });
    }
  }
);

/**
 * POST /calls/:callSid/hangup
 * Hang up an active call. (Admin authentication required)
 */
router.post(
  '/calls/:callSid/hangup',
  authenticateToken,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { callSid } = req.params;
      callStatusMap.set(callSid, 'completed');

      const telephonyService = createTelephonyService();
      if (telephonyService) {
        await telephonyService.hangupCall(callSid).catch(() => {});
      }
      res.json({ message: 'Call hung up successfully' });
    } catch {
      callStatusMap.set(req.params.callSid, 'completed');
      res.json({ message: 'Call hung up' });
    }
  }
);

/**
 * POST /calls/:callId/status
 * Exotel status callback endpoint. (PUBLIC — no JWT auth)
 */
router.post(
  '/calls/:callId/status',
  async (req: Request, res: Response) => {
    try {
      const { CallSid, CallStatus, From, To, Direction, StartTime, EndTime, Duration } = req.body;

      logger.info({
        callSid: CallSid,
        status: CallStatus,
        from: From,
        to: To,
        direction: Direction,
        duration: Duration,
      }, 'Call status callback received');

      res.sendStatus(200);
    } catch (error) {
      logger.error({ error }, 'Failed to process status callback');
      res.sendStatus(200); // Always return 200 to Exotel
    }
  }
);

/**
 * GET /transcript/latest
 * Get live transcript of the latest/active call session
 */
router.get('/transcript/latest', (_req: Request, res: Response) => {
  const session = liveTranscriptStore.getLatestTranscript();
  if (!session) {
    res.json({ status: 'none', message: 'No active or recent call transcript found.' });
    return;
  }
  res.json({ callStatus: session.status, sessionId: session.sessionId, startTime: session.startTime, items: session.items });
});

/**
 * GET /transcript/:sessionId
 * Get live transcript of a specific call session
 */
router.get('/transcript/:sessionId', (req: Request, res: Response) => {
  const session = liveTranscriptStore.getTranscript(req.params.sessionId);
  if (!session) {
    res.status(404).json({ status: 'not_found', message: 'Session transcript not found.' });
    return;
  }
  res.json({ callStatus: session.status, sessionId: session.sessionId, startTime: session.startTime, items: session.items });
});

export default router;
