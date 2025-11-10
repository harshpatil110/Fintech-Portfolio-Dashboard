import { Express } from 'express';
import { initializeRedis, checkRedisHealth } from './redis';
import { timeoutMiddleware } from '../middleware/timeoutHandler';
import { payloadValidationMiddleware, paginationMiddleware } from '../middleware/payloadValidator';
import ErrorHandler from '../utils/errorHandler';
import errorHandlingConfig from './errorHandling';

/**
 * Initialize error handling infrastructure
 */
export async function initializeErrorHandling(app: Express): Promise<void> {
  console.log('🔧 Initializing error handling infrastructure...');

  // 1. Initialize Redis connection
  try {
    if (process.env.SKIP_REDIS !== 'true') {
      await initializeRedis();
      const health = await checkRedisHealth();
      
      if (health.healthy) {
        console.log(`✅ Redis health check passed (latency: ${health.latency}ms)`);
      } else {
        console.warn(`⚠️  Redis health check failed: ${health.error}`);
      }
    } else {
      console.log('⏭️  Skipping Redis initialization (SKIP_REDIS=true)');
    }
  } catch (error: any) {
    console.error('❌ Redis initialization failed:', error.message);
    if (process.env.SKIP_REDIS !== 'true') {
      throw error;
    }
  }

  // 2. Apply global error handling middleware
  console.log('🛡️  Applying error handling middleware...');

  // Timeout tracking middleware
  app.use(timeoutMiddleware({
    maxExecutionTime: errorHandlingConfig.timeout.maxExecutionTime,
    warningThreshold: errorHandlingConfig.timeout.warningThreshold,
  }));
  console.log(`  ✓ Timeout handler (max: ${errorHandlingConfig.timeout.maxExecutionTime}ms)`);

  // Payload validation middleware
  app.use(payloadValidationMiddleware({
    maxRequestSize: errorHandlingConfig.payload.maxRequestSize,
    maxResponseSize: errorHandlingConfig.payload.maxResponseSize,
    maxArrayLength: errorHandlingConfig.payload.maxArrayLength,
  }));
  console.log(`  ✓ Payload validator (max request: ${formatBytes(errorHandlingConfig.payload.maxRequestSize)})`);

  // Pagination middleware
  app.use(paginationMiddleware());
  console.log(`  ✓ Pagination support (max items: ${errorHandlingConfig.payload.maxArrayLength})`);

  // 3. Add request ID tracking
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] as string || generateRequestId();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });
  console.log('  ✓ Request ID tracking');

  // 4. Log configuration
  console.log('\n📋 Error Handling Configuration:');
  console.log(`  • Timeout: ${errorHandlingConfig.timeout.maxExecutionTime}ms (warning: ${errorHandlingConfig.timeout.warningThreshold}ms)`);
  console.log(`  • External API Timeout: ${errorHandlingConfig.timeout.externalApiTimeout}ms`);
  console.log(`  • Endpoint-specific timeouts enabled (portfolio: 8s, market: 6s, watchlist: 7s, auth: 5s)`);
  console.log(`  • Max Request Size: ${formatBytes(errorHandlingConfig.payload.maxRequestSize)}`);
  console.log(`  • Max Response Size: ${formatBytes(errorHandlingConfig.payload.maxResponseSize)}`);
  console.log(`  • Max Array Length: ${errorHandlingConfig.payload.maxArrayLength} items`);
  console.log(`  • Circuit Breaker Threshold: ${errorHandlingConfig.circuitBreaker.failureThreshold} failures`);
  console.log(`  • Circuit Breaker Reset: ${errorHandlingConfig.circuitBreaker.resetTimeout}ms`);
  console.log(`  • Retry Max Attempts: ${errorHandlingConfig.retry.maxAttempts}`);
  console.log(`  • Cache TTL (Market Data): ${errorHandlingConfig.cache.marketData.ttl}s`);
  console.log(`  • Cache TTL (Portfolio): ${errorHandlingConfig.cache.portfolio.ttl}s`);
  console.log(`  • Environment: ${process.env.NODE_ENV || 'development'}`);

  console.log('\n✅ Error handling infrastructure initialized successfully\n');
}

/**
 * Apply error handling middleware at the end of middleware chain
 */
export function applyErrorHandlingMiddleware(app: Express): void {
  // 404 handler - must be after all routes
  app.use((req, res, next) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.path}`,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id']
      }
    });
  });

  // Global error handler - must be last
  app.use(ErrorHandler.middleware());
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default initializeErrorHandling;
