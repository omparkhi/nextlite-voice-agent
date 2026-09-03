import { cli, defineAgent, JobContext, WorkerOptions } from '@livekit/agents';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { LiveKitAgentSession } from './agent.js';

console.log('🚀 Starting NextLite LiveKit Agent Worker v2...');
console.log(`🔗 LiveKit Server URL: ${config.LIVEKIT_URL}`);
console.log(`🔗 Control Plane URL: ${config.CONTROL_PLANE_URL}`);

export default defineAgent({
  entry: async (ctx: JobContext) => {
    console.log(`[VOICE_DEBUG] Worker registered & job received for room: ${ctx.room.name}`);
    await ctx.connect();
    console.log(`[VOICE_DEBUG] Room connected: ${ctx.room.name}`);

    let tenantId: string | undefined;
    let agentId = '';
    let sessionId: string = ctx.room.name || '';

    if (ctx.room.metadata) {
      try {
        const meta = JSON.parse(ctx.room.metadata);
        if (meta.tenantId) tenantId = meta.tenantId;
        if (meta.agentId) agentId = meta.agentId;
        if (meta.sessionId) sessionId = meta.sessionId;
        console.log(`[VOICE_DEBUG] Room metadata parsed: tenantId=${tenantId}, agentId=${agentId}, sessionId=${sessionId}`);
      } catch {
        console.warn('[VOICE_DEBUG] Could not parse room metadata JSON');
      }
    }

    const session = new LiveKitAgentSession(ctx.room, sessionId, agentId, tenantId);
    console.log('[VOICE_DEBUG] Agent session started');
    await session.start();
  },
});

if (process.env.NODE_ENV !== 'test') {
  if (process.argv.length < 3 || (!process.argv.includes('dev') && !process.argv.includes('start') && !process.argv.includes('connect'))) {
    process.argv.push('dev');
  }

  cli.runApp(
    new WorkerOptions({
      agent: fileURLToPath(import.meta.url),
      wsURL: config.LIVEKIT_URL,
      apiKey: config.LIVEKIT_API_KEY,
      apiSecret: config.LIVEKIT_API_SECRET,
      initializeProcessTimeout: 30000,
    })
  );
}
