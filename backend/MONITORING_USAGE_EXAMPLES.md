# Error Logging and Monitoring Usage Examples

## Quick Start

### 1. Basic Logging

```typescript
import { logger } from './utils/logger';

// Simple logging
logger.info('User logged in successfully');
logger.warn('Cache miss for key: user_123');
logger.error('Failed to process payment', error);

// With context
const context = logger.extractRequestContext(req);
logger.info('Processing order', context, { orderId: '12345' });
```

### 2. Error Tracking

```typescript
import { errorMonitoringService } from './services/ErrorMonitoringService';

// Track error (automatically done by ErrorHandler)
try {
  await processPayment(order);
} catch (error) {
  errorMonitoringService.trackError(error, req, {
    orderId: order.id,
    amount: order.total
  });
  throw error;
}
```

### 3. Monitoring Health

```typescript
import { errorMonitoringService } from './services/ErrorMonitoringService';

// Check health status
const health = errorMonitoringService.getHealthStatus();
if (!health.healthy) {
  console.log(`Service unhealthy: ${health.message}`);
}

// Get statistics
const stats = errorMonitoringService.getStats();
console.log(`Error rate: ${stats.errorRate} errors/min`);
console.log(`Total errors: ${stats.totalErrors}`);
```

## Complete Examples

### Example 1: API Route with Full Error Handling

```typescript
import { Router } from 'express';
import { asyncHandler, NotFoundError, ValidationError } from '../utils/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

router.get('/orders/:id', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const context = logger.extractRequestContext(req);
  
  // Log request
  logger.info(`Fetching order ${req.params.id}`, context);
  
  // Validate input
  if (!req.params.id.match(/^[0-9]+$/)) {
    throw new ValidationError('Invalid order ID format');
  }
  
  // Fetch order
  const order = await orderService.getOrder(req.params.id);
  
  if (!order) {
    throw new NotFoundError(`Order ${req.params.id} not found`);
  }
  
  // Log success
  const executionTime = Date.now() - startTime;
  logger.info(`Order fetched successfully`, context, {
    orderId: order.id,
    executionTime
  });
  
  res.json(order);
}));

export default router;
```

### Example 2: Service with Circuit Breaker and Monitoring

```typescript
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';
import { errorMonitoringService } from '../services/ErrorMonitoringService';
import { ExternalServiceError } from '../utils/errorHandler';

class PaymentService {
  private circuitBreaker: CircuitBreaker;
  
  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 300000
    });
  }
  
  async processPayment(order: Order): Promise<PaymentResult> {
    try {
      // Use circuit breaker for external API call
      const result = await this.circuitBreaker.execute(
        () => this.callPaymentGateway(order),
        () => this.getFallbackPayment(order)
      );
      
      logger.info('Payment processed successfully', undefined, {
        orderId: order.id,
        amount: order.total
      });
      
      return result;
    } catch (error) {
      // Log and track error
      logger.error('Payment processing failed', error, undefined, {
        orderId: order.id,
        amount: order.total
      });
      
      errorMonitoringService.trackError(error, undefined, {
        service: 'payment',
        orderId: order.id
      });
      
      throw new ExternalServiceError('Payment gateway unavailable');
    }
  }
  
  private async callPaymentGateway(order: Order): Promise<PaymentResult> {
    // External API call
    const response = await fetch('https://payment-gateway.com/api/charge', {
      method: 'POST',
      body: JSON.stringify(order)
    });
    
    if (!response.ok) {
      throw new Error(`Payment gateway error: ${response.status}`);
    }
    
    return response.json();
  }
  
  private getFallbackPayment(order: Order): PaymentResult {
    logger.warn('Using fallback payment method', undefined, {
      orderId: order.id
    });
    
    return {
      status: 'pending',
      message: 'Payment queued for processing'
    };
  }
}
```

### Example 3: Middleware with Request Logging

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function customMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const context = logger.extractRequestContext(req);
  
  // Log middleware entry
  logger.debug('Entering custom middleware', context);
  
  // Perform middleware logic
  try {
    // ... middleware logic ...
    
    // Log middleware exit
    const executionTime = Date.now() - startTime;
    logger.debug('Exiting custom middleware', context, { executionTime });
    
    next();
  } catch (error) {
    // Log middleware error
    logger.error('Middleware error', error, context);
    next(error);
  }
}
```

### Example 4: Background Job with Monitoring

```typescript
import { logger } from '../utils/logger';
import { errorMonitoringService } from '../services/ErrorMonitoringService';

class DataSyncJob {
  async run(): Promise<void> {
    const jobId = `sync_${Date.now()}`;
    const startTime = Date.now();
    
    logger.info('Starting data sync job', undefined, { jobId });
    
    try {
      // Perform sync
      const result = await this.syncData();
      
      const executionTime = Date.now() - startTime;
      logger.info('Data sync completed', undefined, {
        jobId,
        recordsSynced: result.count,
        executionTime
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error('Data sync failed', error, undefined, {
        jobId,
        executionTime
      });
      
      errorMonitoringService.trackError(error, undefined, {
        job: 'data-sync',
        jobId
      });
      
      throw error;
    }
  }
  
  private async syncData(): Promise<{ count: number }> {
    // Sync logic
    return { count: 100 };
  }
}
```

### Example 5: Monitoring Dashboard Integration

```typescript
import express from 'express';
import { errorMonitoringService } from '../services/ErrorMonitoringService';
import { logger } from '../utils/logger';

const app = express();

// Custom monitoring endpoint
app.get('/admin/monitoring', async (req, res) => {
  const stats = errorMonitoringService.getStats();
  const recentErrors = errorMonitoringService.getRecentErrors(300000); // Last 5 minutes
  const health = errorMonitoringService.getHealthStatus();
  
  res.json({
    health: {
      status: health.healthy ? 'healthy' : 'unhealthy',
      errorRate: health.errorRate,
      message: health.message
    },
    statistics: {
      totalErrors: stats.totalErrors,
      errorRate: stats.errorRate,
      lastErrorTime: stats.lastErrorTime,
      topErrorTypes: Array.from(stats.errorsByType.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      topErrorEndpoints: Array.from(stats.errorsByEndpoint.entries())
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    },
    recentErrors: recentErrors.slice(0, 10).map(error => ({
      timestamp: error.timestamp,
      type: error.errorType,
      code: error.errorCode,
      endpoint: error.endpoint,
      statusCode: error.statusCode
    }))
  });
});

// Periodic health check
setInterval(() => {
  const health = errorMonitoringService.getHealthStatus();
  
  if (!health.healthy) {
    logger.fatal('Service health check failed', undefined, undefined, {
      errorRate: health.errorRate,
      message: health.message
    });
    
    // Take action: restart, scale, alert, etc.
  }
}, 60000); // Every minute
```

### Example 6: Custom Alert Handler

```typescript
import { errorMonitoringService } from '../services/ErrorMonitoringService';
import { logger } from '../utils/logger';

// Custom alert handler
class AlertManager {
  private lastAlertTime: Date | null = null;
  private alertCooldown = 300000; // 5 minutes
  
  async checkAndAlert(): Promise<void> {
    const health = errorMonitoringService.getHealthStatus();
    
    if (!health.healthy && this.shouldSendAlert()) {
      await this.sendAlert(health);
      this.lastAlertTime = new Date();
    }
  }
  
  private shouldSendAlert(): boolean {
    if (!this.lastAlertTime) return true;
    
    const timeSinceLastAlert = Date.now() - this.lastAlertTime.getTime();
    return timeSinceLastAlert > this.alertCooldown;
  }
  
  private async sendAlert(health: any): Promise<void> {
    const stats = errorMonitoringService.getStats();
    
    // Send to Slack
    await this.sendSlackAlert({
      text: `🚨 High Error Rate Alert`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Error Rate:* ${health.errorRate.toFixed(2)} errors/min\n*Status:* ${health.message}`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Total Errors:*\n${stats.totalErrors}`
            },
            {
              type: 'mrkdwn',
              text: `*Last Error:*\n${stats.lastErrorTime?.toISOString() || 'N/A'}`
            }
          ]
        }
      ]
    });
    
    // Log alert
    logger.fatal('Alert sent for high error rate', undefined, undefined, {
      errorRate: health.errorRate,
      totalErrors: stats.totalErrors
    });
  }
  
  private async sendSlackAlert(payload: any): Promise<void> {
    if (!process.env.ALERT_WEBHOOK_URL) return;
    
    try {
      await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      logger.error('Failed to send Slack alert', error);
    }
  }
}

// Run periodic checks
const alertManager = new AlertManager();
setInterval(() => alertManager.checkAndAlert(), 60000); // Every minute
```

### Example 7: Testing Error Logging

```typescript
import { logger } from '../utils/logger';
import { errorMonitoringService } from '../services/ErrorMonitoringService';

describe('Error Logging', () => {
  beforeEach(() => {
    errorMonitoringService.resetStats();
  });
  
  it('should track errors', () => {
    const error = new Error('Test error');
    const mockReq = {
      method: 'GET',
      path: '/test',
      headers: {}
    } as any;
    
    errorMonitoringService.trackError(error, mockReq);
    
    const stats = errorMonitoringService.getStats();
    expect(stats.totalErrors).toBe(1);
  });
  
  it('should calculate error rate', () => {
    const mockReq = { method: 'GET', path: '/test', headers: {} } as any;
    
    // Generate multiple errors
    for (let i = 0; i < 15; i++) {
      errorMonitoringService.trackError(new Error('Test'), mockReq);
    }
    
    const stats = errorMonitoringService.getStats();
    expect(stats.errorRate).toBeGreaterThan(0);
  });
  
  it('should trigger alert on high error rate', async () => {
    const mockReq = { method: 'GET', path: '/test', headers: {} } as any;
    
    // Generate errors to exceed threshold
    for (let i = 0; i < 20; i++) {
      errorMonitoringService.trackError(new Error('Test'), mockReq);
    }
    
    const health = errorMonitoringService.getHealthStatus();
    expect(health.healthy).toBe(false);
  });
});
```

## Environment Configuration

```bash
# .env file

# Logging
LOG_LEVEL=info                      # debug, info, warn, error, fatal
ERROR_LOGGING_ENABLED=true

# Monitoring
ERROR_MONITORING_ENABLED=true
ERROR_RATE_THRESHOLD=10             # errors per minute
ERROR_RATE_WINDOW_MS=60000          # 1 minute
ENABLE_ERROR_ALERTS=true
ALERT_COOLDOWN_MS=300000            # 5 minutes

# External Services
VERCEL_ANALYTICS_ID=your_id
SENTRY_DSN=your_dsn
ALERT_WEBHOOK_URL=https://hooks.slack.com/...

# Service Info
SERVICE_NAME=fintech-portfolio-api
NODE_ENV=production
```

## API Endpoints

### Health Check
```bash
curl http://localhost:3001/api/monitoring/health
```

### Get Statistics
```bash
curl http://localhost:3001/api/monitoring/stats
```

### Get Recent Errors
```bash
curl http://localhost:3001/api/monitoring/errors/recent?window=300000
```

### Reset Statistics
```bash
curl -X POST http://localhost:3001/api/monitoring/stats/reset
```

## Best Practices

1. **Always include context**: Use `logger.extractRequestContext(req)` for request-related logs
2. **Use appropriate log levels**: DEBUG for diagnostics, INFO for normal operations, WARN for issues, ERROR for failures
3. **Include metadata**: Add relevant data to help with debugging
4. **Monitor error rates**: Set up periodic health checks
5. **Configure alerts**: Set appropriate thresholds for your application
6. **Sanitize sensitive data**: Automatic sanitization is enabled by default
7. **Use request IDs**: Automatically added by `requestIdMiddleware`
8. **Track execution time**: Log slow operations for performance monitoring
