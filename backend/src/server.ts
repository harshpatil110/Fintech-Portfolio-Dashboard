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
  requestLogger,
  errorHandler,
  validateOrigin,
  preventParameterPollution,
  getCsrfToken
} from './middleware/security';
import { generalLimiter } from './middleware/rateLimiter';

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

// Request logging
app.use(requestLogger);

// Rate limiting
app.use(generalLimiter);

// Body parsing middleware with size limits
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb for security
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Fintech Portfolio API',
    environment: process.env.NODE_ENV || 'development'
  });
});

// CSRF token endpoint
app.get('/api/csrf-token', getCsrfToken);

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested route does not exist',
      path: req.originalUrl,
      timestamp: new Date()
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize WebSocket service
let webSocketService: WebSocketService;

// Initialize services
async function initializeServices() {
  try {
    // Conditionally connect to Redis (set SKIP_REDIS=true to skip in dev)
    if (process.env.SKIP_REDIS === 'true') {
      console.log('⚠️ SKIP_REDIS=true — skipping Redis connection');
    } else {
      // Connect to Redis
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }
    }

    // Initialize WebSocket service
    webSocketService = new WebSocketService(server);

    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    // In production we should fail-fast, but allow dev to continue without Redis
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('Continuing without all services in non-production environment');
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  
  if (webSocketService) {
    webSocketService.shutdown();
  }
  
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  
  if (webSocketService) {
    webSocketService.shutdown();
  }
  
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Fintech Portfolio API ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}/ws/market`);
  
  // Initialize services after server starts
  await initializeServices();
});