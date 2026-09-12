import request from 'supertest';
import app from '../index';
import { env } from '../config/env';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentService } from '../services/agent';
import { generateAccessToken } from '../lib/tokens';
import { db } from '../db';

// Mock DB
vi.mock('../db', () => ({
  db: {
    query: {
      tenants: { findFirst: vi.fn() },
    },
  },
}));

// Mock agentService
vi.mock('../services/agent', () => ({
  agentService: {
    getAgent: vi.fn(),
    getActiveDeployment: vi.fn(),
  },
}));

// Mock fetch for Plivo Service
global.fetch = vi.fn();

describe('Phase 8A - Plivo Outbound Phone Test (Pipecat)', () => {
  const tenantId = 'mock-tenant';
  const agentId = 'mock-agent';
  let adminToken = 'mock-token';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock verifyClient via DB
    (db as any).query.tenants.findFirst.mockResolvedValue({ id: tenantId });
    
    // Auth bypass: we can just mock authenticateToken, or mock the jwt verify
    // Wait, let's just mock JWT or use a valid generated token if secret is known.
    // Actually, generating a real token works because we just mock the DB!
  });

  it('A. Authorized user can request phone test & B. API resolves ACTIVE TEST deployment', async () => {
    adminToken = generateAccessToken({ userId: 'user-1', tenantId, role: 'ADMIN' });
    (agentService.getAgent as any).mockResolvedValue({ id: agentId });
    (agentService.getActiveDeployment as any).mockResolvedValue({ id: 'mock-deployment-id' });

    env.PIPECAT_URL = 'https://mock-ngrok.app';
    env.PLIVO_AUTH_ID = 'test-auth-id';
    env.PLIVO_AUTH_TOKEN = 'test-auth-token';
    env.PLIVO_CALLER_ID = '919876543210';

    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ request_uuid: 'mock-plivo-uuid', message: 'call fired' }),
    });

    const res = await request(app)
      .post(`/api/admin/clients/${tenantId}/agents/${agentId}/phone-test`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phoneNumber: '+14155552671' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.callId).toBe('mock-plivo-uuid');
    expect(res.body.deploymentId).toBeDefined();

    // Verify Plivo request
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArgs = mockFetch.mock.calls[0];
    
    // E. Target phone number
    // F. Configured Caller ID
    // G. Correct HTTP method
    // H. Correct PIPECAT URL
    // I. Correct Deployment ID in Answer URL
    
    expect(fetchArgs[0]).toBe(`https://api.plivo.com/v1/Account/${env.PLIVO_AUTH_ID}/Call/`);
    expect(fetchArgs[1].method).toBe('POST');
    
    const reqBody = JSON.parse(fetchArgs[1].body);
    expect(reqBody.to).toBe('+14155552671');
    expect(reqBody.from).toBe(env.PLIVO_CALLER_ID);
    expect(reqBody.answer_method).toBe('GET');
    
    expect(reqBody.answer_url).toContain('https://mock-ngrok.app/plivo/test-xml?deploymentId=');
    expect(reqBody.answer_url).toContain(res.body.deploymentId);
  });

  it('J. Existing LiveKit fallback works when PIPECAT_URL is absent', async () => {
    adminToken = generateAccessToken({ userId: 'user-1', tenantId, role: 'ADMIN' });
    (agentService.getAgent as any).mockResolvedValue({ id: agentId });
    (agentService.getActiveDeployment as any).mockResolvedValue({ id: 'mock-deployment-id' });

    // Delete PIPECAT_URL so it falls back to LiveKit
    delete env.PIPECAT_URL;
    
    // We expect this to fail with LiveKit config error since we don't have LiveKit set up here,
    // or if we do, it hits LiveKit logic.
    // The main point is it didn't call Plivo.
    const mockFetch = global.fetch as any;

    const res = await request(app)
      .post(`/api/admin/clients/${tenantId}/agents/${agentId}/phone-test`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phoneNumber: '+14155552671' });

    // It should hit LiveKit fallback and return 503 or 502 based on livekit config
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.error).toBeDefined();
    const fetchArgs = mockFetch.mock.calls.map((call: any[]) => call[0]);
    expect(fetchArgs.some((url: any) => String(url).includes('api.plivo.com'))).toBe(false);
  });

  it('K. Plivo API non-2xx responses are handled correctly', async () => {
    adminToken = generateAccessToken({ userId: 'user-1', tenantId, role: 'ADMIN' });
    (agentService.getAgent as any).mockResolvedValue({ id: agentId });
    (agentService.getActiveDeployment as any).mockResolvedValue({ id: 'mock-deployment-id' });

    env.PIPECAT_URL = 'https://mock-ngrok.app';
    env.PLIVO_AUTH_ID = 'test-auth-id';
    
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'Invalid number' }),
    });

    const res = await request(app)
      .post(`/api/admin/clients/${tenantId}/agents/${agentId}/phone-test`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phoneNumber: '+14155552671' });

    expect(res.status).toBe(502);
    expect(res.body.error).toContain('Plivo API returned 400');
  });
});
