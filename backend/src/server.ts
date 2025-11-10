import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import apiRoutes from './routes';
import WebSocketService from './services/WebSocketService';
import redisClient from './config/redis';
import {
  securityHeaders,
  requestLogger as securityRequestLogger,
  errorHandler,
  validateOrigin,
  preventParameterPollution,
  getCsrfToken
} from './middleware/security';
import { generalLimiter } from './middleware/rateLimiter';
import { initializeErrorHandling, applyErrorHandlingMiddleware } from './config/initializeErrorHandling';
import { requestLogging } from './middleware/requestLogger';
import { logger } from './utils/logger';
import { errorMonitoringService } from './services/ErrorMonitoringService';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;

// Trust proxy (important for rate limiting and IP detection behind reverse proxies)
app.set('trust proxy', 1);

// Security middleware - applied first
app.use(helmet({
  contentSecurityPolicy: false, // We set our own CSP
  crossOriginEmbedderPolicy: false
}));

app.use(securityHeaders);
app.use(validateOrigin);
app.use(preventParameterPollution);

// CORS configuration
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}));

// Request logging with ID generation and structured logging
app.use(requestLogging());
app.use(securityRequestLogger);

// Rate limiting
app.use(generalLimiter);

// Body parsing middleware with size limits
app.use(express.json({ limit: '4mb' })); // Vercel limit
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

// Initialize error handling infrastructure (must be early in middleware chain)
// This will be called in initializeServices() to ensure async setup

// Health check endpoint with error monitoring
app.get('/health', (req, res) => {
  const health = errorMonitoringService.getHealthStatus();
  const statusCode = health.healthy ? 200 : 503;
  
  res.status(statusCode).json({ 
    status: health.healthy ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'Fintech Portfolio API',
    environment: process.env.NODE_ENV || 'development',
    errorRate: health.errorRate,
    message: health.message
  });
});

// CSRF token endpoint
app.get('/api/csrf-token', getCsrfToken);

// API routes
app.use('/api', apiRoutes);

// Apply error handling middleware (404 and global error handler)
// This must be after all routes
applyErrorHandlingMiddleware(app);

// Initialize WebSocket service
let webSocketService: WebSocketService;

// Initialize services
async function initializeServices() {
  try {
    // Initialize error handling infrastructure (Redis, middleware, etc.)
    await initializeErrorHandling(app);

    // Initialize WebSocket service
    webSocketService = new WebSocketService(server);

    logger.info('All services initialized successfully', undefined, {
      services: ['error-handling', 'websocket', 'monitoring']
    });
  } catch (error) {
    logger.error('Failed to initialize services', error);
    // In production we should fail-fast, but allow dev to continue without Redis
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      logger.warn('Continuing without all services in non-production environment');
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  if (webSocketService) {
    webSocketService.shutdown();
  }
  
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  
  if (webSocketService) {
    webSocketService.shutdown();
  }
  
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, async () => {
  logger.info('Server started', undefined, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    websocketEndpoint: `ws://localhost:${PORT}/ws/market`
  });
  
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Fintech Portfolio API ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}/ws/market`);
  
  // Initialize services after server starts
  await initializeServices();
});