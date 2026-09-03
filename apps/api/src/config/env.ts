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

  // Telephony provider
  TELEPHONY_PROVIDER: z.enum(['exotel', 'plivo']).default('exotel'),

  // Exotel credentials
  EXOTEL_ACCOUNT_SID: z.string().optional(),
  EXOTEL_API_KEY: z.string().optional(),
  EXOTEL_API_TOKEN: z.string().optional(),
  EXOTEL_CALLER_ID: z.string().optional(),
  EXOTEL_BASE_URL: z.string().default('https://api.in.exotel.com'),

  // Plivo credentials
  PLIVO_AUTH_ID: z.string().optional(),
  PLIVO_AUTH_TOKEN: z.string().optional(),
  PLIVO_CALLER_ID: z.string().optional(),
  PLIVO_BASE_URL: z.string().optional(),
  PLIVO_STREAM_HOST: z.string().optional(),

  // Engine migration flag (legacy = V1 VoiceRuntime, livekit = V2 LiveKit engine)
  VOICE_ENGINE: z.enum(['legacy', 'livekit']).default('legacy'),
  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().default('secretsecretsecretsecretsecretsecret'),
  LIVEKIT_SIP_DOMAIN: z.string().optional(),
  LIVEKIT_SIP_TRUNK_ID: z.string().optional(),
  WORKER_API_SECRET: z.string().default('nextlite_internal_worker_secret_2026'),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
