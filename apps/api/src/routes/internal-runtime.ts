import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { agents, agentVersions, callSessions } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { promptCompiler } from '../services/promptCompiler.js';
import { VariableInterpolator } from '../services/variableInterpolator.js';
import { logger } from '../lib/logger.js';
import { RuntimeAgentConfig, V2SessionEndRequest } from '@nextlite/shared';

export const internalRuntimeRouter = Router();

/**
 * Middleware: Verify internal worker secret header
 */
function verifyWorkerSecret(req: Request, res: Response, next: () => void) {
  const secret = req.headers['x-worker-secret'];
  if (!secret || secret !== env.WORKER_API_SECRET) {
    logger.warn({ ip: req.ip, path: req.path }, 'Unauthorized worker access attempt');
    res.status(401).json({ error: 'Unauthorized worker credential' });
    return;
  }
  next();
}

internalRuntimeRouter.use(verifyWorkerSecret);

/**
 * POST /api/internal/runtime/agents/:agentId/session
 * Returns compiled RuntimeAgentConfig for an active session.
 */
internalRuntimeRouter.post('/agents/:agentId/session', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { sessionId, tenantId, callerInfo } = req.body || {};

    if (!agentId || !sessionId) {
      res.status(400).json({ error: 'agentId and sessionId are required' });
      return;
    }

    // 1. Resolve agent
    const agentRecords = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    const agent = agentRecords[0];
    if (!agent) {
      res.status(404).json({ error: `Agent ${agentId} not found` });
      return;
    }

    const resolvedTenantId = tenantId || agent.tenantId;

    // 2. Resolve configuration using agentService
    const { agentService } = await import('../services/agent.js');
    const configuration = (await agentService.getCurrentConfig(agentId, resolvedTenantId)) || {};

    const versionRecords = await db.select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(agentVersions.versionNumber))
      .limit(1);

    const agentVersionId = versionRecords[0]?.id || 'draft-version';

    // 3. Prepare variables & interpolate
    const callerContext = {
      customerPhone: callerInfo?.phoneNumber || '',
      channel: callerInfo?.channel || 'livekit_webrtc',
      ...req.body.variables,
    };

    const interpolatedConfig = (typeof configuration === 'string' ? JSON.parse(configuration) : configuration) as any;
    const interpolatedGreeting = VariableInterpolator.interpolate(interpolatedConfig.identity?.greeting || '', [], callerContext).interpolatedText;
    if (interpolatedGreeting && interpolatedConfig.identity) {
      interpolatedConfig.identity.greeting = interpolatedGreeting;
    }

    // 4. Run canonical PromptCompiler
    const compiledPrompt = promptCompiler.compileAgentPrompt({
      configuration: interpolatedConfig,
      runtimeContext: callerContext,
    });

    // 5. Build RuntimeAgentConfig contract
    const runtimeConfig: RuntimeAgentConfig = {
      sessionId,
      tenantId: resolvedTenantId,
      agentId,
      agentVersionId,
      compiledSystemPrompt: compiledPrompt,
      voice: {
        provider: interpolatedConfig.voice?.provider || 'sarvam',
        voiceId: interpolatedConfig.voice?.voiceId || 'shubh',
        gender: interpolatedConfig.voice?.gender || 'male',
        speakingSpeed: interpolatedConfig.voice?.speakingSpeed || 1.0,
      },
      language: {
        primary: interpolatedConfig.language?.primary || 'hi-IN',
        supportedLanguages: interpolatedConfig.language?.supported || ['hi-IN', 'en-IN'],
        languageSwitchEnabled: interpolatedConfig.language?.languageSwitchEnabled ?? true,
      },
      runtimeSettings: {
        modelTemperature: interpolatedConfig.runtimeSettings?.modelTemperature ?? 0.7,
        allowCallerInterruptions: interpolatedConfig.runtimeSettings?.allowCallerInterruptions ?? true,
        nudges: {
          enabled: interpolatedConfig.runtimeSettings?.nudges?.enabled ?? true,
          delaySeconds: interpolatedConfig.runtimeSettings?.nudges?.delaySeconds ?? 7,
          messages: interpolatedConfig.runtimeSettings?.nudges?.messages || ['क्या आप मुझे सुन पा रहे हैं?'],
        },
        maxCallLengthSeconds: interpolatedConfig.runtimeSettings?.maxCallLengthSeconds ?? 300,
      },
      variables: callerContext,
      callerInfo,
    };

    logger.info({ sessionId, tenantId: resolvedTenantId, agentId, agentVersionId }, 'Served RuntimeAgentConfig to worker');
    res.json(runtimeConfig);
  } catch (error: any) {
    logger.error({ error: error.message, agentId: req.params.agentId }, 'Failed to serve RuntimeAgentConfig');
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/internal/runtime/sessions/:sessionId/end
 * Logs completed/canceled session details into call_sessions table.
 */
internalRuntimeRouter.post('/sessions/:sessionId/end', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const body: V2SessionEndRequest = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    // Persist or update session log in DB
    const existingSessions = await db.select().from(callSessions).where(eq(callSessions.sessionId, sessionId)).limit(1);

    if (existingSessions.length > 0) {
      await db.update(callSessions)
        .set({
          status: body.status === 'completed' ? 'completed' : 'failed',
          durationSeconds: body.durationSeconds || 0,
          endedAt: new Date(),
        })
        .where(eq(callSessions.sessionId, sessionId));
    } else {
      await db.insert(callSessions).values({
        tenantId: body.tenantId,
        agentId: body.agentId,
        sessionId,
        status: body.status === 'completed' ? 'completed' : 'failed',
        durationSeconds: body.durationSeconds || 0,
        endedAt: new Date(),
      });
    }

    logger.info({ sessionId, status: body.status, duration: body.durationSeconds }, 'Logged V2 LiveKit session completion');
    res.json({ success: true, sessionId });
  } catch (error: any) {
    logger.error({ error: error.message, sessionId: req.params.sessionId }, 'Failed to persist V2 session completion');
    res.status(500).json({ error: error.message || 'Failed to log session' });
  }
});
