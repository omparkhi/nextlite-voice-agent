import { vi } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-32chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only-32chars';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/nextlite_voice_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.RESEND_API_KEY = 're_test_api_key_12345';
process.env.EMAIL_FROM = 'test@nextlite.ai';
process.env.LOG_LEVEL = 'error';
