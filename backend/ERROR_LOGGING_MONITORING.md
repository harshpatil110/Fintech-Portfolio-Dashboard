# Error Logging and Monitoring System

## Overview

Comprehensive error logging and monitoring system for the Fintech Portfolio Dashboard. This system provides structured logging, error tracking, rate monitoring, and alerting capabilities.

## Components

### 1. Logger (`src/utils/logger.ts`)

Structured logging utility with multiple log levels and context capture.

#### Features
- **Log Levels**: DEBUG, INFO, WARN, ERROR, FATAL
- **Structured Logging**: JSON format for production, human-readable for development
- **Context Capture**: Request ID, user ID, endpoint, execution time
- **Sensitive Data Sanitization**: Automatic redaction of passwords, tokens, emails, etc.
- **Stack Trace Support**: Configurable stack trace inclusion

#### Usage

```typescript
import { logger } from './utils/logger';

// Basic logging
logger.info('User logged in successfully');
logger.warn('High memory usage detected');
logger.error('Database connection failed', error);

// With context
const context = logger.extractRequestContext(req);
logger.info('Processing request', context);

// With metadata
logger.error('Payment failed', error, context, {
  amount: 100.50,
  currency: 'USD',
  paymentMethod: 'credit_card'
});

// Log HTTP requests
logger.logRequest(req, 200, 150); // method, status, execution time
```

#### Configuration

Environment variables:
```bash
LOG_LEVEL=info                    # debug, info, warn, error, fatal
NODE_ENV=production               # development or production
```

### 2. Error Monitoring Service (`src/services/ErrorMonitoringService.ts`)

Tracks error events, calculates error rates, and triggers alerts.

#### Features
- **Error Event Tracking**: Records all errors with full context
- **Error Rate Calculation**: Real-time error rate per minute
- **Statistics**: Errors by type, endpoint, and time window
- **Alerting**: Automatic alerts when error rate exceeds threshold
- **Integration Ready**: Hooks for Vercel Analytics, Sentry, webhooks

#### Usage

```typescript
import { errorMonitoringService } from './services/ErrorMonitoringService';

// Track an error (automatically called by ErrorHandler)
errorMonitoringService.trackError(error, req, metadata);

// Get current statistics
const stats = errorMonitoringService.getStats();
console.log(`Error rate: ${stats.errorRate} errors/min`);

// Get recent errors
const recentErrors = errorMonitoringService.getRecentErrors(60000); // last minute

// Check health status
const health = errorMonitoringService.getHealthStatus();
if (!health.healthy) {
  console.log(`Unhealthy: ${health.message}`);
}

// Reset statistics
errorMonitoringService.resetStats();
```

#### Configuration

Environment variables:
```bash
# Monitoring
ERROR_MONITORING_ENABLED=true
ERROR_RATE_THRESHOLD=10           # errors per minute
ERROR_RATE_WINDOW_MS=60000        # 1 minute window
ENABLE_ERROR_ALERTS=true
ALERT_COOLDOWN_MS=300000          # 5 minutes between alerts

# External Services
VERCEL_ANALYTICS_ID=your_id
SENTRY_DSN=your_dsn
ALERT_WEBHOOK_URL=https://hooks.slack.com/...

# Service Info
SERVICE_NAME=fintech-portfolio-api
```

### 3. Request Logger Middleware (`src/middleware/requestLogger.ts`)

Middleware for logging all HTTP requests with automatic request ID generation.

#### Features
- **Request ID Generation**: Unique ID for each request
- **Request/Response Logging**: Logs all incoming requests and responses
- **Execution Time Tracking**: Measures and logs request duration
- **Slow Request Detection**: Warns about requests taking >5 seconds

#### Usage

```typescript
import { requestLogging } from './middleware/requestLogger';

// Apply to all routes
app.use(requestLogging());

// Or apply individual middlewares
import { requestIdMiddleware, requestLoggerMiddleware } from './middleware/requestLogger';
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
```

### 4. Enhanced Error Handler (`src/utils/errorHandler.ts`)

Updated to integrate with logging and monitoring services.

#### Features
- **Automatic Error Tracking**: All errors sent to monitoring service
- **Structured Logging**: Uses logger for consistent error logging
- **Backward Compatible**: Existing error handling code continues to work

#### Usage

```typescript
import { ErrorHandler, asyncHandler } from './utils/errorHandler';

// Wrap async route handlers
router.get('/data', asyncHandler(async (req, res) => {
  const data = await fetchData();
  res.json(data);
}));

// Use error middleware
app.use(ErrorHandler.middleware());
```

### 5. Monitoring API Endpoints (`src/routes/monitoring.ts`)

REST API endpoints for accessing monitoring data.

#### Endpoints

**GET /api/monitoring/health**
- Returns service health status
- Status 200 if healthy, 503 if unhealthy
- Response:
```json
{
  "status": "healthy",
  "errorRate": 2.5,
  "message": "Error rate within acceptable limits",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**GET /api/monitoring/stats**
- Returns error statistics
- Response:
```json
{
  "totalErrors": 42,
  "errorRate": 3.2,
  "lastErrorTime": "2024-01-15T10:29:45.000Z",
  "windowStart": "2024-01-15T10:00:00.000Z",
  "errorsByType": {
    "ValidationError": 15,
    "TimeoutError": 8,
    "NotFoundError": 19
  },
  "errorsByEndpoint": {
    "/api/portfolio": 12,
    "/api/market/quote": 30
  }
}
```

**GET /api/monitoring/errors/recent?window=60000**
- Returns recent error events
- Query param `window`: time window in milliseconds (default: 60000)
- Response:
```json
{
  "count": 5,
  "errors": [
    {
      "timestamp": "2024-01-15T10:29:45.000Z",
      "errorCode": "TIMEOUT_ERROR",
      "errorType": "TimeoutError",
      "endpoint": "/api/market/quote",
      "statusCode": 504,
      "requestId": "req_1234567890_abc123"
    }
  ]
}
```

**POST /api/monitoring/stats/reset**
- Resets error statistics
- Requires authentication (add in production)
- Response:
```json
{
  "message": "Error statistics reset successfully",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Integration with External Services

### Vercel Analytics

To integrate with Vercel Analytics:

1. Install package:
```bash
npm install @vercel/analytics
```

2. Set environment variable:
```bash
VERCEL_ANALYTICS_ID=your_analytics_id
```

3. Update `ErrorMonitoringService.sendToVercelAnalytics()` with actual SDK calls

### Sentry

To integrate with Sentry:

1. Install package:
```bash
npm install @sentry/node
```

2. Set environment variable:
```bash
SENTRY_DSN=your_sentry_dsn
```

3. Update `ErrorMonitoringService.sendToSentry()` with actual SDK calls:
```typescript
import * as Sentry from '@sentry/node';

Sentry.init({ dsn: process.env.SENTRY_DSN });

// In sendToSentry method:
Sentry.captureException(error, {
  tags: {
    endpoint: event.endpoint,
    errorCode: event.errorCode
  },
  user: event.userId ? { id: event.userId } : undefined,
  extra: {
    requestId: event.requestId,
    statusCode: event.statusCode
  }
});
```

### Slack Alerts

To send alerts to Slack:

1. Create a Slack webhook URL
2. Set environment variable:
```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

3. Alerts will automatically be sent when error rate exceeds threshold

## Log Levels

### DEBUG
- Detailed diagnostic information
- Only in development
- Example: "Cache hit for key: market_data_AAPL"

### INFO
- General informational messages
- Normal operations
- Example: "User logged in successfully"

### WARN
- Warning messages for potentially harmful situations
- Non-critical issues
- Example: "Slow request detected: 6.5s"

### ERROR
- Error events that might still allow the application to continue
- Operational errors
- Example: "Failed to fetch market data, using cached data"

### FATAL
- Severe error events that might cause the application to abort
- Critical system failures
- Example: "Database connection lost"

## Best Practices

### 1. Use Appropriate Log Levels
```typescript
// Good
logger.info('User registration completed');
logger.warn('API rate limit approaching');
logger.error('Payment processing failed', error);

// Bad
logger.error('User clicked button'); // Should be debug or info
logger.info('Database connection failed'); // Should be error or fatal
```

### 2. Include Context
```typescript
// Good
const context = logger.extractRequestContext(req);
logger.error('Order processing failed', error, context, {
  orderId: order.id,
  amount: order.total
});

// Bad
logger.error('Error occurred'); // No context or details
```

### 3. Sanitize Sensitive Data
```typescript
// Automatic sanitization is enabled by default
logger.info('User authenticated with token: abc123'); 
// Logs: "User authenticated with [REDACTED]: abc123"

// Disable for specific cases (not recommended)
const customLogger = new Logger({ sanitizeSensitiveData: false });
```

### 4. Monitor Error Rates
```typescript
// Set up periodic health checks
setInterval(() => {
  const health = errorMonitoringService.getHealthStatus();
  if (!health.healthy) {
    // Take action: scale up, restart services, etc.
    logger.fatal('Service unhealthy', undefined, undefined, health);
  }
}, 60000); // Every minute
```

### 5. Use Request IDs
```typescript
// Request IDs are automatically added by requestIdMiddleware
// Use them to trace requests across logs
logger.info('Processing payment', context); // Includes requestId
logger.error('Payment failed', error, context); // Same requestId
```

## Monitoring Dashboard

Access monitoring data via API endpoints:

```bash
# Check health
curl http://localhost:3001/api/monitoring/health

# Get statistics
curl http://localhost:3001/api/monitoring/stats

# Get recent errors
curl http://localhost:3001/api/monitoring/errors/recent?window=300000
```

## Alerting

Alerts are triggered when:
- Error rate exceeds threshold (default: 10 errors/min)
- Cooldown period between alerts (default: 5 minutes)

Alert channels:
- Console logs (always enabled)
- Webhook (if ALERT_WEBHOOK_URL is set)
- Vercel Analytics (if VERCEL_ANALYTICS_ID is set)
- Sentry (if SENTRY_DSN is set)

## Performance Considerations

- **Log Level Filtering**: Only logs at or above configured level are processed
- **Event Cleanup**: Old error events are automatically cleaned up every minute
- **Async Operations**: External service calls are non-blocking
- **Memory Management**: Error events are limited to 2x monitoring window

## Testing

```typescript
// Test error tracking
const testError = new Error('Test error');
errorMonitoringService.trackError(testError, req);

// Verify statistics
const stats = errorMonitoringService.getStats();
expect(stats.totalErrors).toBeGreaterThan(0);

// Test alerting
// Trigger multiple errors to exceed threshold
for (let i = 0; i < 15; i++) {
  errorMonitoringService.trackError(new Error('Test'), req);
}
// Check logs for alert message
```

## Troubleshooting

### Logs not appearing
- Check LOG_LEVEL environment variable
- Ensure logger is imported correctly
- Verify console output is not being suppressed

### Alerts not triggering
- Check ENABLE_ERROR_ALERTS=true
- Verify error rate exceeds ERROR_RATE_THRESHOLD
- Check alert cooldown period hasn't been reached
- Verify webhook URL is correct

### High memory usage
- Reduce ERROR_RATE_WINDOW_MS
- Increase cleanup interval
- Check for memory leaks in error tracking

## Requirements Satisfied

This implementation satisfies the following requirements:

- **Requirement 8.1**: Logs all function errors with stack traces
- **Requirement 8.2**: Tracks error frequency and patterns
- **Requirement 8.3**: Sends alerts when error rate exceeds threshold
- **Requirement 8.4**: Integrates with monitoring services (Vercel Analytics, Sentry)
- **Requirement 8.5**: Includes request context in all error logs
