import { EmailService } from './types';
import { ResendAdapter } from './resendAdapter';
import { env } from '../../config/env';
import { createChildLogger } from '../../lib/logger';

const logger = createChildLogger({ module: 'email-service' });

export function getEmailService(): EmailService {
  const apiKey = process.env.RESEND_API_KEY || env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || env.EMAIL_FROM || 'onboarding@resend.dev';
  return new ResendAdapter(apiKey, from);
}

export type { EmailService };
