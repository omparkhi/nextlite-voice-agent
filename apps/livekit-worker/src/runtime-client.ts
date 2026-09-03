import { config } from './config.js';
import { RuntimeAgentConfig, V2SessionEndRequest } from '@nextlite/shared';

export class ControlPlaneRuntimeClient {
  private baseUrl: string;
  private workerSecret: string;

  constructor() {
    this.baseUrl = config.CONTROL_PLANE_URL.replace(/\/$/, '');
    this.workerSecret = config.WORKER_API_SECRET;
  }

  async getRuntimeConfig(agentId: string, sessionId: string, tenantId?: string, callerInfo?: any): Promise<RuntimeAgentConfig> {
    const url = `${this.baseUrl}/api/internal/runtime/agents/${agentId}/session`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': this.workerSecret,
      },
      body: JSON.stringify({
        sessionId,
        tenantId,
        callerInfo,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch RuntimeAgentConfig (${response.status}): ${errorText}`);
    }

    return await response.json() as RuntimeAgentConfig;
  }

  async endSession(endData: V2SessionEndRequest): Promise<void> {
    const url = `${this.baseUrl}/api/internal/runtime/sessions/${endData.sessionId}/end`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': this.workerSecret,
      },
      body: JSON.stringify(endData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Failed to log session end (${response.status}): ${errorText}`);
    }
  }
}

export const runtimeClient = new ControlPlaneRuntimeClient();
