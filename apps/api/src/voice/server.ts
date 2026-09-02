import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createChildLogger } from '../lib/logger.js';
import { getVoiceRuntime } from '../services/index.js';
import { ExotelTransport } from './providers/exotel/websocket.js';
import { BrowserTransport } from './providers/browser/websocket.js';
import type { VoiceSessionConfig } from './types.js';
import type { Server } from 'http';
import { verifyAccessToken } from '../lib/tokens.js';
import { db } from '../db/index.js';
import { agents, agentVersions, tenants } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import type { AgentConfiguration } from '../services/template.js';
import { liveTranscriptStore } from './transcriptStore.js';

const logger = createChildLogger({ module: 'voice-websocket' });
const router = Router();

// Store active voice sessions
const activeSessions = new Map<string, { sessionId: string; tenantId: string; agentId: string }>();

/**
 * Verify agent exists, resolve its tenant ID, and load its configuration.
 * Returns null if agent not found.
 */
async function verifyAgentAndResolveTenant(agentId?: string | null): Promise<{ agentId: string; tenantId: string; configuration: AgentConfiguration | null } | null> {
  let targetAgentId = agentId;
  if (!targetAgentId) {
    const firstAgent = await db.select().from(agents).limit(1);
    if (firstAgent.length === 0) return null;
    targetAgentId = firstAgent[0].id;
  }

  let agentResults = await db.select()
    .from(agents)
    .where(eq(agents.id, targetAgentId))
    .limit(1);

  if (agentResults.length === 0) {
    const firstAgent = await db.select().from(agents).limit(1);
    if (firstAgent.length === 0) return null;
    targetAgentId = firstAgent[0].id;
    agentResults = firstAgent;
  }

  const versionResults = await db.select()
    .from(agentVersions)
    .where(eq(agentVersions.agentId, targetAgentId))
    .orderBy(desc(agentVersions.versionNumber))
    .limit(1);

  const configuration = versionResults.length > 0
    ? (versionResults[0].configuration as AgentConfiguration)
    : null;

  return { agentId: targetAgentId, tenantId: agentResults[0].tenantId, configuration };
}

/**
 * Verify admin is authorized to access the tenant.
 * Admins can access any tenant.
 */
async function verifyAdminAccess(userId: string, role: string, tenantId: string): Promise<boolean> {
  if (role === 'ADMIN') return true;
  return false;
}

/**
 * Setup WebSocket servers for voice.
 * Creates two separate servers:
 * - /api/telephony/stream — for Exotel (no browser auth)
 * - /api/voice/stream — for browser Web Voice (requires admin auth)
 */
import { PlivoTransport, validatePlivoV3Signature } from './providers/plivo/index.js';

export function setupVoiceWebSocket(server: Server): void {
  // Dynamic import to avoid TypeScript module resolution issues with ws
  import('ws').then(({ WebSocketServer }) => {
    // --- Telephony & Web Voice WebSocket Servers ---
    const exotelWss = new WebSocketServer({ noServer: true });
    const plivoWss = new WebSocketServer({ noServer: true });
    const browserWss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      if (pathname === '/api/telephony/stream') {
        exotelWss.handleUpgrade(request, socket, head, (ws) => {
          exotelWss.emit('connection', ws, request);
        });
      } else if (pathname === '/api/telephony/plivo/stream') {
        // Plivo V3 Security Signature Validation on Upgrade
        const authToken = process.env.PLIVO_AUTH_TOKEN;
        if (authToken) {
          const nonce = request.headers['x-plivo-signature-v3-nonce'] as string | undefined;
          const signature = request.headers['x-plivo-signature-v3'] as string | undefined;
          const fullUrl = `https://${request.headers.host || 'localhost'}${request.url}`;

          const isValid = validatePlivoV3Signature(fullUrl, nonce, signature, authToken);
          if (!isValid && process.env.NODE_ENV === 'production') {
            logger.warn({ fullUrl, nonce, signature }, 'Plivo V3 WebSocket signature validation failed');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }
        }

        plivoWss.handleUpgrade(request, socket, head, (ws) => {
          plivoWss.emit('connection', ws, request);
        });
      } else if (pathname === '/api/voice/stream') {
        browserWss.handleUpgrade(request, socket, head, (ws) => {
          browserWss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    exotelWss.on('connection', (ws: any, req: any) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
      const sampleRate = parseInt(url.searchParams.get('sample-rate') ?? '8000', 10);
      const tenantIdParam = url.searchParams.get('tenant-id') ?? url.searchParams.get('tenantId') ?? url.searchParams.get('tenant_id');
      const agentIdParam = url.searchParams.get('agent-id') ?? url.searchParams.get('agentId') ?? url.searchParams.get('agent_id');

      const sessionId = randomUUID();
      logger.info({ sessionId, reqUrl: req.url, tenantIdParam, agentIdParam, sampleRate }, 'New Exotel WebSocket connection');

      // Load agent configuration for language/voice settings
      verifyAgentAndResolveTenant(agentIdParam).then(async (agentInfo) => {
        if (!agentInfo) {
          logger.warn({ agentIdParam }, 'Agent not found for Exotel connection');
          ws.close(1008, 'Agent not found');
          return;
        }

        const resolvedAgentId = agentInfo.agentId;
        const resolvedTenantId = tenantIdParam ?? agentInfo.tenantId;
        const agentLanguage = agentInfo.configuration?.language?.primary ?? 'hi-IN';
        const agentVoice = agentInfo.configuration?.voice?.voiceId ?? 'neha';

        // Create voice session
        const runtime = getVoiceRuntime();
        const sessionConfig: VoiceSessionConfig = {
          sessionId,
          tenantId: resolvedTenantId,
          agentId: resolvedAgentId,
          transport: 'real_call',
          inputFormat: { codec: 'pcm_s16le', sampleRate: sampleRate as 8000 | 16000 | 24000, channels: 1 },
          outputFormat: { codec: 'pcm_s16le', sampleRate: sampleRate as 8000 | 16000 | 24000, channels: 1 },
        };

        try {
          const session = await runtime.startSession(sessionConfig);
          liveTranscriptStore.startSession(sessionId, { agentId: resolvedAgentId });

          // Create Exotel transport
          const transport = new ExotelTransport(ws, session, { sampleRate });

          // Store session mapping
          activeSessions.set(sessionId, { sessionId, tenantId: resolvedTenantId, agentId: resolvedAgentId });

          // Wire up the full voice pipeline (STT -> Runtime -> TTS)
          // Use agent config for language and voice
          const { stt, tts } = await runtime.wireVoicePipeline(session, transport, {
            languageCode: agentLanguage,
            sampleRate: sampleRate as 8000 | 16000,
            encoding: 'linear16',
          }, {
            languageCode: agentLanguage,
            voiceId: agentVoice,
            sampleRate: 16000, // Sarvam TTS outputs 16kHz PCM
          });

          transport.setTTSOutputFormat({ codec: 'pcm_s16le', sampleRate: 16000, channels: 1 });

          logger.info({ sessionId, stt: stt.name, tts: tts.name, language: agentLanguage, voice: agentVoice }, 'Voice pipeline wired');

          // DIAGNOSTIC MODE: Send test audio to verify Exotel → caller playback
          // Set EXOTEL_DIAGNOSTIC=true to test without STT→LLM→TTS
          if (process.env.EXOTEL_DIAGNOSTIC === 'true') {
            logger.info({ sessionId }, 'DIAGNOSTIC MODE: Sending test audio');
            // Generate a 1-second 440Hz sine wave tone (PCM16 8kHz)
            const duration = 1; // seconds
            const frequency = 440; // Hz
            const sampleCount = 8000 * duration;
            const testAudio = Buffer.alloc(sampleCount * 2); // 16-bit = 2 bytes per sample
            for (let i = 0; i < sampleCount; i++) {
              const sample = Math.sin(2 * Math.PI * frequency * i / 8000) * 0.5 * 32767;
              testAudio.writeInt16LE(Math.round(sample), i * 2);
            }
            // Send test audio after a short delay
            setTimeout(() => {
              transport.send({
                type: 'text',
                transcript: '[DIAGNOSTIC TEST TONE]',
                audio: testAudio,
                isPartial: false,
                timestamp: Date.now(),
              }).catch((err) => logger.warn({ error: err }, 'Failed to send diagnostic test audio'));
            }, 1000);
          } else {
            // Normal mode: Synthesize and send initial agent greeting from config
            const greetingText = agentInfo.configuration?.identity?.greeting || 'नमस्ते! बताइए, मैं आपकी क्या मदद करूँ?';
            liveTranscriptStore.addGreeting(sessionId, greetingText);
            tts.synthesize(greetingText).then((initialAudio) => {
              if (initialAudio && initialAudio.length > 0) {
                transport.send({
                  type: 'text',
                  transcript: greetingText,
                  audio: initialAudio,
                  isPartial: false,
                  timestamp: Date.now(),
                }).catch((err) => logger.warn({ error: err }, 'Failed to send greeting audio'));
              }
            }).catch((err) => logger.warn({ error: err }, 'Failed to synthesize greeting'));
          }

          // Log STT/TTS errors but DON'T close the WebSocket
          // Provider errors shouldn't kill the call — only the call ending should
          stt.onError((error) => {
            logger.error({ sessionId, error }, 'STT error (not closing WebSocket)');
          });

          tts.onError((error) => {
            logger.error({ sessionId, error }, 'TTS error (not closing WebSocket)');
          });

          transport.onClose(() => {
            logger.info({ sessionId }, 'Transport closed');
            activeSessions.delete(sessionId);
            liveTranscriptStore.endSession(sessionId, 'transport_closed');

            // End the session
            session.end('transport_closed').catch((err: Error) => {
              logger.error({ sessionId, error: err }, 'Error ending session');
            });
          });

          // Handle session end
          session.on('end', () => {
            activeSessions.delete(sessionId);
            try {
              ws.close(1000, 'Session ended');
            } catch {
              // Ignore close errors
            }
          });

          logger.info({ sessionId }, 'Voice session initialized');
        } catch (error) {
          logger.error({ sessionId, error }, 'Failed to start voice session');
          ws.close(1011, 'Internal server error');
        }
      }).catch((error) => {
        logger.error({ sessionId, error }, 'Failed to load agent config');
        ws.close(1011, 'Internal server error');
      });
    });

    logger.info('Exotel WebSocket server initialized on /api/telephony/stream');

    // --- Plivo Telephony WebSocket ---
    plivoWss.on('connection', (ws: any, req: any) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
      const tenantIdParam = url.searchParams.get('tenant-id') ?? url.searchParams.get('tenantId');
      const agentIdParam = url.searchParams.get('agent-id') ?? url.searchParams.get('agentId');

      const sessionId = randomUUID();
      logger.info({ sessionId, reqUrl: req.url, tenantIdParam, agentIdParam }, 'New Plivo WebSocket connection');

      verifyAgentAndResolveTenant(agentIdParam).then(async (agentInfo) => {
        if (!agentInfo) {
          logger.warn({ agentIdParam }, 'Agent not found for Plivo connection');
          ws.close(1008, 'Agent not found');
          return;
        }

        const resolvedAgentId = agentInfo.agentId;
        const resolvedTenantId = tenantIdParam ?? agentInfo.tenantId;
        const agentLanguage = agentInfo.configuration?.language?.primary ?? 'hi-IN';
        const agentVoice = agentInfo.configuration?.voice?.voiceId ?? 'neha';

        const runtime = getVoiceRuntime();
        const sessionConfig: VoiceSessionConfig = {
          sessionId,
          tenantId: resolvedTenantId,
          agentId: resolvedAgentId,
          transport: 'real_call',
          inputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
          outputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
        };

        try {
          const session = await runtime.startSession(sessionConfig);
          liveTranscriptStore.startSession(sessionId, { agentId: resolvedAgentId });

          const transport = new PlivoTransport(ws, session);

          activeSessions.set(sessionId, { sessionId, tenantId: resolvedTenantId, agentId: resolvedAgentId });

          const { tts } = await runtime.wireVoicePipeline(session, transport, {
            languageCode: agentLanguage,
            sampleRate: 16000,
            encoding: 'linear16',
          }, {
            languageCode: agentLanguage,
            voiceId: agentVoice,
            sampleRate: 16000,
          });

          // Wire barge-in / interruption: session 'interrupted' -> transport.clearAudio()
          session.on('interrupted', () => {
            logger.info({ sessionId }, 'VoiceSession interrupted — sending clearAudio to Plivo stream');
            transport.clearAudio();
          });

          const greetingText = agentInfo.configuration?.identity?.greeting || 'नमस्ते! बताइए, मैं आपकी क्या मदद करूँ?';
          liveTranscriptStore.addGreeting(sessionId, greetingText);
          tts.synthesize(greetingText).then((initialAudio) => {
            if (initialAudio && initialAudio.length > 0) {
              transport.send({
                type: 'speech',
                transcript: greetingText,
                audio: initialAudio,
                isPartial: false,
                timestamp: Date.now(),
              }).catch((err) => logger.warn({ error: err }, 'Failed to send Plivo greeting audio'));
            }
          }).catch((err) => logger.warn({ error: err }, 'Failed to synthesize Plivo greeting'));

          session.on('end', () => {
            activeSessions.delete(sessionId);
            try {
              ws.close(1000, 'Session ended');
            } catch {
              // Ignore close errors
            }
          });

          logger.info({ sessionId }, 'Plivo voice session initialized');
        } catch (error) {
          logger.error({ sessionId, error }, 'Failed to start Plivo voice session');
          ws.close(1011, 'Internal server error');
        }
      }).catch((error) => {
        logger.error({ sessionId, error }, 'Failed to load agent config for Plivo');
        ws.close(1011, 'Internal server error');
      });
    });

    logger.info('Plivo WebSocket server initialized on /api/telephony/plivo/stream');

    // --- Browser Web Voice WebSocket ---
    browserWss.on('connection', async (ws: any, req: any) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const agentId = url.searchParams.get('agent-id');

      // Step 1: Validate required parameters
      if (!token || !agentId) {
        logger.warn('Browser WebSocket missing token or agent-id');
        ws.close(1008, 'Missing required parameters');
        return;
      }

      // Step 2: Verify JWT token
      let userId: string;
      let role: string;
      try {
        const payload = verifyAccessToken(token);
        userId = payload.userId;
        role = payload.role;
      } catch {
        logger.warn('Invalid or expired token');
        ws.close(1008, 'Invalid or expired token');
        return;
      }

      // Step 3: Verify ADMIN role
      if (role !== 'ADMIN') {
        logger.warn({ userId, role }, 'Non-admin user attempted voice connection');
        ws.close(1003, 'Admin role required');
        return;
      }

      // Step 4: Resolve agent and its tenant
      const agentInfo = await verifyAgentAndResolveTenant(agentId);
      if (!agentInfo) {
        logger.warn({ agentId }, 'Agent not found');
        ws.close(1008, 'Agent not found');
        return;
      }

      // Step 5: Verify admin access to tenant
      const hasAccess = await verifyAdminAccess(userId, role, agentInfo.tenantId);
      if (!hasAccess) {
        logger.warn({ userId, tenantId: agentInfo.tenantId }, 'Unauthorized tenant access');
        ws.close(1003, 'Unauthorized');
        return;
      }

      const tenantId = agentInfo.tenantId;
      const sessionId = randomUUID();
      const sampleRate = 16000; // Browser uses 16kHz

      // Extract language from agent configuration
      const agentLanguage = agentInfo.configuration?.language?.primary ?? 'hi-IN';
      const agentVoice = agentInfo.configuration?.voice?.voiceId ?? 'meera';

      logger.info({ sessionId, userId, tenantId, agentId, language: agentLanguage, voice: agentVoice }, 'New Browser WebSocket connection');

      // Step 6: Create voice session with derived tenant context
      const runtime = getVoiceRuntime();
      const sessionConfig: VoiceSessionConfig = {
        sessionId,
        tenantId,
        agentId,
        transport: 'web_voice',
        inputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
        outputFormat: { codec: 'pcm_s16le', sampleRate: 16000, channels: 1 },
      };

      try {
        const session = await runtime.startSession(sessionConfig);
        liveTranscriptStore.startSession(sessionId, { agentId });

        // Step 7: Create Browser transport
        const transport = new BrowserTransport(ws, session, { sampleRate });

        // Store session mapping
        activeSessions.set(sessionId, { sessionId, tenantId, agentId });

        // Step 8: Wire up the full voice pipeline (STT -> Runtime -> TTS)
        try {
          const { stt, tts } = await runtime.wireVoicePipeline(session, transport, {
            languageCode: agentLanguage,
            sampleRate: 16000,
            encoding: 'linear16',
          }, {
            languageCode: agentLanguage,
            voiceId: agentVoice,
            sampleRate: 16000,
          });

          logger.info({ sessionId, stt: stt.name, tts: tts.name }, 'Browser voice pipeline wired');

          // Send initial state
          transport.sendState('listening');
        } catch (error) {
          logger.error({ sessionId, error }, 'Failed to wire browser voice pipeline');
          ws.close(1011, 'Failed to initialize voice pipeline');
          return;
        }

        transport.onClose(() => {
          logger.info({ sessionId }, 'Browser transport closed');
          activeSessions.delete(sessionId);

          // End the session
          session.end('transport_closed').catch((err: Error) => {
            logger.error({ sessionId, error: err }, 'Error ending session');
          });
        });

        // Handle session end
        session.on('end', () => {
          activeSessions.delete(sessionId);
          try {
            ws.close(1000, 'Session ended');
          } catch {
            // Ignore close errors
          }
        });

        logger.info({ sessionId }, 'Browser voice session initialized');
      } catch (error) {
        logger.error({ sessionId, error }, 'Failed to start browser voice session');
        ws.close(1011, 'Internal server error');
      }
    });

    logger.info('Browser WebSocket server initialized on /api/voice/stream');
  }).catch(error => {
    logger.error({ error }, 'Failed to load WebSocket library');
  });
}

/**
 * Get all active voice sessions.
 */
export function getActiveSessions(): Map<string, { sessionId: string; tenantId: string; agentId: string }> {
  return activeSessions;
}

export default router;
