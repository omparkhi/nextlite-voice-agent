// apps/api/src/index.ts – cleaned V2 API control plane
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import agentRoutes from './routes/agents.js';
import knowledgeRoutes from './routes/knowledge.js';
import testConversationRoutes from './routes/test-conversation.js';
import configAssistantRoutes from './routes/config-assistant.js';
import clientRoutes from './routes/client.js';
import voiceRoutes from './voice/routes.js';
import { internalRuntimeRouter } from './routes/internal-runtime.js';
import { logger } from './lib/logger.js';

const app = express();

// Bypass ngrok browser interposer page for API calls
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

// Correlation ID & logging
app.use(correlationIdMiddleware);
app.use(requestLogger);

// Health check (public)
app.use('/api', healthRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', agentRoutes);
app.use('/api/admin', knowledgeRoutes);
app.use('/api/admin', testConversationRoutes);
app.use('/api/admin', configAssistantRoutes);
app.use('/api/admin', clientRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/telephony', voiceRoutes);
app.use('/api/internal/runtime', internalRuntimeRouter);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start HTTP server
const PORT = env.PORT;
const server = app.listen(PORT, () => {
  logger.info(`🚀 NextLite Voice API running on port ${PORT}`);
  logger.info(`📊 Environment: ${env.NODE_ENV}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

export default app;
