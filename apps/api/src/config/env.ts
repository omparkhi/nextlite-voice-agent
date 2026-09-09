import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().default('onboarding@resend.dev'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  EMBEDDING_PROVIDER: z.enum(['nvidia', 'gemini']).default('nvidia'),
  NVIDIA_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['b2']).default('b2'),
  B2_ENDPOINT: z.string().optional(),
  B2_REGION: z.string().optional(),
  B2_KEY_ID: z.string().optional(),
  B2_APPLICATION_KEY: z.string().optional(),
  B2_BUCKET_NAME: z.string().optional(),

  SARVAM_API_KEY: z.string().optional(),

  // LiveKit Agent Worker internal shared secret (accepts WORKER_API_SECRET or LIVEKIT_WORKER_SECRET)
  WORKER_API_SECRET: z.string().optional(),
  LIVEKIT_WORKER_SECRET: z.string().optional(),

  // LiveKit Server configuration
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_AGENT_NAME: z.string().default('my-agent'),
  LIVEKIT_SIP_DOMAIN: z.string().optional(),
  LIVEKIT_SIP_TRUNK_ID: z.string().optional(),

  // Telephony provider
  TELEPHONY_PROVIDER: z.enum(['exotel', 'plivo']).default('exotel'),

  // Exotel credentials
  EXOTEL_ACCOUNT_SID: z.string().optional(),
  EXOTEL_API_KEY: z.string().optional(),
  EXOTEL_API_TOKEN: z.string().optional(),
  EXOTEL_CALLER_ID: z.string().optional(),
  EXOTEL_BASE_URL: z.string().default('https://api.in.exotel.com'),

  // Plivo credentials (for SIP/Zentrunk and phone numbers)
  PLIVO_AUTH_ID: z.string().optional(),
  PLIVO_AUTH_TOKEN: z.string().optional(),
  PLIVO_CALLER_ID: z.string().optional(),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }

  const data = result.data;
  const workerSecret =
    data.WORKER_API_SECRET ||
    data.LIVEKIT_WORKER_SECRET ||
    process.env.WORKER_API_SECRET ||
    process.env.LIVEKIT_WORKER_SECRET ||
    'dev-livekit-worker-secret-v3';

  data.WORKER_API_SECRET = workerSecret;
  data.LIVEKIT_WORKER_SECRET = workerSecret;

  return data as typeof data & { WORKER_API_SECRET: string; LIVEKIT_WORKER_SECRET: string };
}

export const env = validateEnv();
export type Env = ReturnType<typeof validateEnv>;
