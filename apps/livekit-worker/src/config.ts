import dotenv from 'dotenv';
dotenv.config();

export const config = {
  LIVEKIT_URL: process.env.LIVEKIT_URL || 'ws://localhost:7880',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || 'devkey',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || 'secretsecretsecretsecretsecretsecret',
  CONTROL_PLANE_URL: process.env.CONTROL_PLANE_URL || 'http://localhost:3001',
  WORKER_API_SECRET: process.env.WORKER_API_SECRET || 'nextlite_internal_worker_secret_2026',
  SARVAM_API_KEY: process.env.SARVAM_API_KEY || '',
};
