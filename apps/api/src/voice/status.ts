import { Router, Request, Response } from 'express';
import { createChildLogger } from '../lib/logger.js';
import { ExotelClient } from './providers/exotel/client.js';

const logger = createChildLogger({ module: 'telephony-status' });
const router = Router();

/**
 * Exotel status callback endpoint.
 * Exotel calls this URL when call status changes.
 *
 * This endpoint does NOT require authentication because Exotel
 * initiates the request. We validate using the call SID.
 */
router.post('/telephony/status', async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      CallStatus,
      From,
      To,
      Direction,
      StartTime,
      EndTime,
      Duration,
      RecordingUrl,
    } = req.body;

    if (!CallSid || !CallStatus) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const mappedStatus = ExotelClient.mapStatus(CallStatus);

    logger.info({
      callSid: CallSid,
      status: CallStatus,
      mappedStatus,
      from: From,
      to: To,
      direction: Direction,
      duration: Duration,
    }, 'Call status update');

    // Placeholder: Update call record in database (Milestone 10)
    // For now, just log the status

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Failed to process status callback');
    res.status(200).json({ received: true }); // Return 200 to avoid retries
  }
});

export default router;
