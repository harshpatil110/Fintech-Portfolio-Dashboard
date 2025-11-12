# Edge Function Error Handling Integration Guide

## Overview

This guide demonstrates how to integrate edge function error handling into your Vercel deployment. Edge functions run on Vercel's Edge Network with strict constraints (25ms execution time, 1MB payload limit).

**Requirements**: 10.4 (Graceful fallback when edge function fails), 10.5 (Edge-compatible error responses)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Client Request                              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│         Edge Middleware (middleware.ts)                  │
│  - Timeout Protection (25ms)                            │
│  - Constraint Validation                                │
│  - Graceful Fallback                                    │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
┌────────▼────────┐    ┌────────▼────────┐
│  Edge Function  │    │  Fallback Path  │
│  (Success)      │    │  (On Failure)   │
└─────────────────┘    └─────────────────┘
```

## Current Implementation Status

### ✅ Completed Components

1. **Edge Error Handler** (`backend/src/middleware/edgeErrorHandler.ts`)
   - EdgeError class with typed error categories
   - Timeout protection with EdgeTimeoutHandler
   - Circuit breaker for external calls
   - Retry logic with exponential backoff
   - Constraint validation
   - Graceful fallback mechanisms

2. **Edge Middleware** (`middleware.ts`)
   - Integrated error handling
   - Timeout protection (25ms)
   - Rate limiting
   - Authentication checks
   - Automatic fallback on failure

3. **Edge Helpers** (`backend/src/utils/edgeHelpers.ts`)
   - Lightweight utilities for edge runtime
   - Request context extraction
   - Response builders
   - Execution time tracking

4. **Tests** (`backend/src/middleware/edgeErrorHandler.test.ts`)
   - Comprehensive unit tests
   - Error handling scenarios
   - Timeout behavior
   - Circuit breaker functionality

## Edge Function Error Handling Features

### 1. Graceful Fallback (Requirement 10.4)

When an edge function fails, the system automatically falls back to allow the request to proceed:

```typescript
// In middleware.ts
try {
  return await withEdgeTimeout(
    async () => {
      // Edge middleware logic
      return processRequest(request);
    },
    25, // 25ms timeout
    () => {
      // Fallback: allow request to proceed
      console.warn('Edge middleware timeout, using fallback');
      const response = NextResponse.next();
      response.headers.set('X-Edge-Middleware-Timeout', 'true');
      return response;
    }
  );
} catch (error) {
  // Graceful fallback - allow request to proceed if middleware fails
  return handleEdgeMiddlewareError(error as Error, request);
}
```

**Fallback Behavior**:
- **Timeout errors**: Pass request through with warning header
- **Runtime errors**: Pass request through with fallback indicator
- **Constraint violations**: Return error response (block request)
- **Rate limit errors**: Return 429 response (block request)
- **Auth errors on protected routes**: Return 401 response (block request)
- **Auth errors on public routes**: Pass request through

### 2. Edge-Compatible Error Responses (Requirement 10.5)

All edge errors follow a standardized format:

```typescript
{
  "error": {
    "code": "TIMEOUT",
    "message": "Edge function timeout after 25ms",
    "type": "TIMEOUT",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_123",
    "details": {
      "maxExecutionTime": 25
    }
  }
}
```

**Error Types**:
- `TIMEOUT`: Execution time exceeded
- `CONSTRAINT_VIOLATION`: Payload too large or unsupported feature
- `AUTHENTICATION_ERROR`: Auth check failed
- `RATE_LIMIT_ERROR`: Rate limit exceeded
- `VALIDATION_ERROR`: Invalid input
- `RUNTIME_ERROR`: Unexpected runtime error
- `UNKNOWN_ERROR`: Unclassified error

### 3. Constraint Validation

Edge functions have strict constraints that are validated before processing:

```typescript
// Validates:
// - Payload size (1MB limit for edge)
// - Content type (no multipart/form-data)
// - Supported HTTP methods
validateEdgeRuntimeConstraints(request);
```

### 4. Timeout Protection

All edge operations are wrapped with timeout protection:

```typescript
const timer = new EdgeTimeoutHandler(25);

// Check timeout at critical points
timer.checkTimeout(); // Throws if timeout exceeded

// Check if approaching timeout
if (timer.isApproachingTimeout()) {
  // Skip optional operations
  return partialResponse();
}

// Get remaining time
const remaining = timer.getRemainingTime();
```

### 5. Circuit Breaker

Prevents cascading failures from external services:

```typescript
const circuitBreaker = new EdgeCircuitBreaker(5, 30000);

return circuitBreaker.execute(
  async () => {
    // Call external service
    return await externalApi();
  },
  () => {
    // Fallback when circuit is open
    return cachedData();
  }
);
```

### 6. Retry Logic

Automatic retry with exponential backoff:

```typescript
const result = await withEdgeRetry(
  async () => {
    // Operation that might fail
    return await unreliableOperation();
  },
  2, // max attempts
  100 // initial delay (ms)
);
```

## Testing Edge Function Constraints

### Manual Testing

1. **Test Timeout Behavior**:
```bash
# Simulate slow operation
curl -X GET http://localhost:3000/api/test-slow
# Should return fallback response with X-Edge-Middleware-Timeout header
```

2. **Test Payload Limit**:
```bash
# Send large payload (>1MB)
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d @large-payload.json
# Should return 413 error
```

3. **Test Circuit Breaker**:
```bash
# Make multiple failing requests
for i in {1..6}; do
  curl -X GET http://localhost:3000/api/test-external
done
# After 5 failures, should return cached data
```

### Automated Testing

Run the test suite:
```bash
cd backend
npm test -- edgeErrorHandler.test.ts
```

### Load Testing

Test edge function performance under load:
```bash
# Install k6 or similar load testing tool
k6 run edge-load-test.js
```

## Monitoring Edge Functions

### Metrics to Track

1. **Execution Time**:
   - Average: Should be <20ms
   - P95: Should be <25ms
   - P99: Should be <25ms

2. **Timeout Rate**:
   - Should be <1%
   - Alert if >5%

3. **Fallback Rate**:
   - Track how often fallback is used
   - Investigate if >10%

4. **Circuit Breaker State**:
   - Monitor state changes
   - Alert when circuit opens

5. **Error Rate**:
   - By error type
   - By endpoint
   - Alert if >5%

### Logging

All edge errors are logged with context:

```json
{
  "type": "edge_error",
  "error": {
    "name": "EdgeError",
    "message": "Edge function timeout after 25ms",
    "type": "TIMEOUT",
    "statusCode": 504
  },
  "request": {
    "method": "GET",
    "pathname": "/api/data",
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Deployment Configuration

### Vercel Configuration

The `vercel.json` file should include:

```json
{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 10,
      "memory": 1024
    }
  }
}
```

### Environment Variables

Required for edge functions:

```env
# Edge function configuration
EDGE_TIMEOUT_MS=25
EDGE_MAX_PAYLOAD_SIZE=1048576

# Circuit breaker
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_MS=30000

# Rate limiting (handled by edge middleware)
RATE_LIMIT_ENABLED=true
```

## Best Practices

### 1. Keep Edge Functions Lightweight

```typescript
// ✅ Good: Lightweight operation
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  return NextResponse.json({ userId });
}

// ❌ Bad: Heavy computation
export async function GET(request: NextRequest) {
  const result = await complexCalculation(); // Too slow for edge
  return NextResponse.json({ result });
}
```

### 2. Always Provide Fallbacks

```typescript
// ✅ Good: Has fallback
return withEdgeTimeout(
  async () => fetchData(),
  25,
  () => getCachedData()
);

// ❌ Bad: No fallback
return withEdgeTimeout(
  async () => fetchData(),
  25
);
```

### 3. Validate Constraints Early

```typescript
// ✅ Good: Validate first
validateEdgeRuntimeConstraints(request);
const body = await request.json();

// ❌ Bad: Validate after processing
const body = await request.json();
validateEdgeRuntimeConstraints(request);
```

### 4. Monitor Execution Time

```typescript
// ✅ Good: Track time
const timer = new EdgeTimeoutHandler(25);
const result = await operation();
timer.logIfSlow('operation');

// ❌ Bad: No monitoring
const result = await operation();
```

### 5. Use Circuit Breakers for External Calls

```typescript
// ✅ Good: Protected external call
const breaker = new EdgeCircuitBreaker(5, 30000);
return breaker.execute(
  () => externalApi(),
  () => cachedData()
);

// ❌ Bad: Unprotected external call
return externalApi();
```

## Troubleshooting

### Issue: Edge Function Timeouts

**Symptoms**: Frequent timeout errors, X-Edge-Middleware-Timeout headers

**Solutions**:
1. Profile the function to identify slow operations
2. Move heavy computations to serverless functions
3. Use caching to reduce processing time
4. Implement early returns for optional operations

### Issue: Circuit Breaker Opens Frequently

**Symptoms**: High fallback rate, circuit breaker state = OPEN

**Solutions**:
1. Check external service health
2. Increase timeout for external calls
3. Implement better retry logic
4. Add more robust fallback data

### Issue: High Error Rate

**Symptoms**: Many edge errors in logs

**Solutions**:
1. Review error types to identify patterns
2. Add more comprehensive validation
3. Improve fallback mechanisms
4. Consider moving to serverless functions

### Issue: Payload Too Large Errors

**Symptoms**: 413 errors, CONSTRAINT_VIOLATION errors

**Solutions**:
1. Implement pagination for large datasets
2. Use compression
3. Move to serverless function (4.5MB limit)
4. Split requests into smaller chunks

## Migration Guide

### Moving from Serverless to Edge

If you want to convert a serverless function to edge:

1. **Add runtime export**:
```typescript
export const runtime = 'edge';
```

2. **Wrap with error handling**:
```typescript
import { safeEdgeExecution } from '@/backend/src/middleware/edgeErrorHandler';

export async function GET(request: NextRequest) {
  return safeEdgeExecution(
    async () => {
      // Your logic here
    },
    {
      fallback: () => NextResponse.json({ cached: true }),
      timeout: 25,
      context: 'my-edge-function'
    }
  );
}
```

3. **Test constraints**:
   - Execution time <25ms
   - Payload size <1MB
   - No heavy computations
   - No file system access
   - No Node.js-specific APIs

4. **Deploy and monitor**:
   - Check execution time metrics
   - Monitor error rates
   - Verify fallback behavior

## Summary

The edge function error handling system provides:

✅ **Graceful Fallback**: Requests proceed even when edge functions fail
✅ **Edge-Compatible Responses**: Standardized error format
✅ **Constraint Validation**: Automatic validation of edge runtime limits
✅ **Timeout Protection**: 25ms execution time enforcement
✅ **Circuit Breaker**: Protection from cascading failures
✅ **Retry Logic**: Automatic retry with exponential backoff
✅ **Comprehensive Testing**: Unit tests and integration examples
✅ **Monitoring**: Detailed logging and metrics

The system ensures that edge functions remain fast, reliable, and fail gracefully when issues occur, meeting all requirements for production deployment on Vercel.
