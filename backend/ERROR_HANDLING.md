# Error Handling Infrastructure

This document describes the error handling infrastructure implemented for the Fintech Portfolio Dashboard to prevent and handle Vercel deployment errors.

## Overview

The error handling system provides comprehensive protection against common Vercel deployment issues:

- **Function Timeouts** (504 errors)
- **Payload Size Limits** (413 errors)
- **Function Invocation Failures** (500 errors)
- **Rate Limiting** (429 errors)
- **External API Failures** (502 errors)

## Components

### 1. Error Handler (`src/utils/errorHandler.ts`)

Provides standardized error handling and response formatting.

**Features:**
- Custom error classes (ValidationError, TimeoutError, PayloadTooLargeError, etc.)
- Automatic error message sanitization
- Request context logging
- Development vs production error details
- Async handler wrapper for route handlers

**Usage:**
```typescript
import { ErrorHandler, asyncHandler, NotFoundError } from './utils/errorHandler';

// Wrap async route handlers
app.get('/api/data', asyncHandler(async (req, res) => {
  const data = await fetchData();
  if (!data) {
    throw new NotFoundError('Data not found');
  }
  res.json(data);
}));

// Apply global error handler (in server.ts)
app.use(ErrorHandler.middleware());
```

### 2. Timeout Handler (`src/middleware/timeoutHandler.ts`)

Prevents function timeout errors by tracking execution time and enforcing limits.

**Features:**
- Configurable timeout limits (default: 8s for Vercel safety margin)
- Warning threshold for slow requests
- Automatic timeout tracking per request
- Response time headers
- Fallback support for timeout scenarios

**Configuration:**
```env
FUNCTION_TIMEOUT_MS=8000
FUNCTION_WARNING_THRESHOLD_MS=6000
```

**Usage:**
```typescript
import { TimeoutHandler, getTimeoutHandler } from './middleware/timeoutHandler';

// In route handler
const timeoutHandler = getTimeoutHandler(req);
const data = await timeoutHandler.wrapWithTimeout(
  () => fetchExternalData(),
  () => getCachedData() // Fallback
);
```

### 3. Payload Validator (`src/middleware/payloadValidator.ts`)

Validates and manages request/response payload sizes to prevent 413 errors.

**Features:**
- Request size validation (max 4MB)
- Response size estimation
- Automatic pagination support
- Compression detection
- Helper methods for pagination

**Configuration:**
```env
MAX_REQUEST_SIZE=4194304
MAX_RESPONSE_SIZE=4194304
MAX_ARRAY_LENGTH=100
```

**Usage:**
```typescript
import { getPayloadValidator } from './middleware/payloadValidator';

// Automatic pagination in routes
app.get('/api/portfolio', asyncHandler(async (req, res) => {
  const positions = await getPositions();
  
  // Use pagination helper
  (res as any).paginate(positions);
}));

// Manual pagination
const validator = getPayloadValidator(req);
const paginated = validator.paginateResponse(data, page, limit);
res.json(paginated);
```

### 4. Redis Configuration (`src/config/redis.ts`)

Enhanced Redis client with reconnection logic and health checks.

**Features:**
- Automatic reconnection with exponential backoff
- Connection health monitoring
- Graceful degradation when Redis unavailable
- Connection lifecycle management

**Configuration:**
```env
REDIS_URL=redis://localhost:6379
SKIP_REDIS=true  # For development without Redis
```

### 5. Error Handling Configuration (`src/config/errorHandling.ts`)

Centralized configuration for all error handling settings.

**Includes:**
- Timeout settings
- Payload limits
- Circuit breaker configuration
- Retry settings
- Rate limiting configuration
- Cache TTL settings

### 6. Initialization (`src/config/initializeErrorHandling.ts`)

Orchestrates the setup of all error handling infrastructure.

**Responsibilities:**
- Initialize Redis connection
- Apply timeout middleware
- Apply payload validation middleware
- Add request ID tracking
- Configure pagination support
- Log configuration details

## Environment Variables

Add these to your `.env` file:

```env
# Error Handling Configuration
FUNCTION_TIMEOUT_MS=8000
FUNCTION_WARNING_THRESHOLD_MS=6000
EXTERNAL_API_TIMEOUT_MS=5000
MAX_REQUEST_SIZE=4194304
MAX_RESPONSE_SIZE=4194304
MAX_ARRAY_LENGTH=100

# Circuit Breaker Configuration
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_MS=60000
CIRCUIT_BREAKER_MONITORING_PERIOD_MS=300000

# Cache Configuration
CACHE_TTL_MARKET_DATA=60
CACHE_TTL_PORTFOLIO=30
CACHE_STALE_WHILE_REVALIDATE=30

# Monitoring
ERROR_LOGGING_ENABLED=true
```

## Integration

The error handling infrastructure is automatically initialized in `server.ts`:

```typescript
import { initializeErrorHandling, applyErrorHandlingMiddleware } from './config/initializeErrorHandling';

// Initialize during server startup
async function initializeServices() {
  await initializeErrorHandling(app);
  // ... other services
}

// Apply error handlers after routes
applyErrorHandlingMiddleware(app);
```

## Error Response Format

All errors return a standardized format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_1234567890_abc123",
    "details": {
      // Only in development
      "stack": "Error stack trace...",
      "name": "ErrorName"
    }
  }
}
```

## Best Practices

1. **Always use asyncHandler** for async route handlers:
   ```typescript
   app.get('/api/data', asyncHandler(async (req, res) => {
     // Your code here
   }));
   ```

2. **Check timeouts for long operations**:
   ```typescript
   const timeoutHandler = getTimeoutHandler(req);
   if (timeoutHandler.isApproachingTimeout()) {
     return res.json(cachedData);
   }
   ```

3. **Use pagination for large datasets**:
   ```typescript
   (res as any).paginate(largeArray);
   ```

4. **Throw appropriate error types**:
   ```typescript
   throw new NotFoundError('Resource not found');
   throw new ValidationError('Invalid input');
   throw new TimeoutError('Operation timed out');
   ```

5. **Log warnings for slow operations**:
   ```typescript
   timeoutHandler.logWarningIfNeeded('Fetching market data');
   ```

## Monitoring

The system logs:
- All errors with full context
- Slow requests (>6s)
- Timeout warnings
- Redis connection issues
- Request/response times

Monitor these logs to identify and fix issues quickly.

## Next Steps

The following components will be implemented in subsequent tasks:
- Circuit breaker for external APIs
- Retry logic with exponential backoff
- Enhanced rate limiting with Redis
- Cache manager with stale-while-revalidate
- Error monitoring and alerting integration

## Testing

Test the error handling:

```bash
# Start the server
npm run dev

# Test timeout handling
curl http://localhost:5000/api/slow-endpoint

# Test payload validation
curl -X POST http://localhost:5000/api/data \
  -H "Content-Type: application/json" \
  -d @large-payload.json

# Test error responses
curl http://localhost:5000/api/nonexistent
```

## Troubleshooting

**Redis connection fails:**
- Set `SKIP_REDIS=true` in development
- Check Redis is running: `redis-cli ping`
- Verify `REDIS_URL` is correct

**Timeout errors:**
- Increase `FUNCTION_TIMEOUT_MS` if needed
- Check for slow database queries
- Implement caching for expensive operations

**Payload too large:**
- Implement pagination
- Reduce data returned per request
- Use compression for large responses
