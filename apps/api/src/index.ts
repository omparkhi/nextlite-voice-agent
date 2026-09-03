import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { correlationIdMiddleware } from './middleware/correlationId';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import agentRoutes from './routes/agents';
import knowledgeRoutes from './routes/knowledge';
import testConversationRoutes from './routes/test-conversation';
import configAssistantRoutes from './routes/config-assistant';
import clientRoutes from './routes/client';
import internalRoutes from './routes/internal';
import voiceRoutes from './voice/routes';
import { setupVoiceWebSocket } from './voice/server';
import { logger } from './lib/logger';

const app = express();

// Bypass ngrok browser interposer page for API and WebSocket calls
app.use((_req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Correlation ID
app.use(correlationIdMiddleware);

// Request logging
app.use(requestLogger);

// Health check (before auth middleware)
app.use('/api', healthRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', agentRoutes);
app.use('/api/admin', knowledgeRoutes);
app.use('/api/admin', testConversationRoutes);
app.use('/api/admin', configAssistantRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/telephony', voiceRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.info(`🚀 NextLite Voice API running on port ${PORT}`);
  logger.info(`📊 Environment: ${env.NODE_ENV}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

// Setup voice WebSocket server
setupVoiceWebSocket(server);

export default app;

