# Edge Function Error Handling Examples

## Overview

This document provides examples of how to use edge function error handling utilities to build robust edge functions with graceful fallbacks.

## Requirements

- **10.4**: Graceful fallback when Edge Function fails
- **10.5**: Lightweight authentication checks in Edge Function

## Basic Error Handling

### Example 1: Simple Edge Function with Error Handling

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { 
  withEdgeErrorHandling, 
  createEdgeErrorResponse,
  EdgeError,
  EdgeErrorType 
} from './middleware/edgeErrorHandler';

export async function GET(request: NextRequest) {
  return withEdgeErrorHandling(
    async () => {
      // Your edge function logic
      const data = await fetchData();
      return NextResponse.json({ data });
    },
    async () => {
      // Fallback when error occurs
      return NextResponse.json({ 
        data: null, 
        cached: true 
      });
    },
    'my-edge-function'
  );
}
```

### Example 2: Edge Function with Timeout Protection

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withEdgeTimeout } from './middleware/edgeErrorHandler';

export async function GET(request: NextRequest) {
  return withEdgeTimeout(
    async () => {
      // This must complete within 25ms
      const result = await quickOperation();
      return NextResponse.json({ result });
    },
    25, // 25ms timeout
    () => {
      // Fallback if timeout occurs
      return NextResponse.json({ 
        result: null,
        timeout: true 
      }, { status: 504 });
    }
  );
}
```

## Circuit Breaker Pattern

### Example 3: Edge Function with Circuit Breaker

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { EdgeCircuitBreaker } from './middleware/edgeErrorHandler';

// Create circuit breaker instance (shared across requests)
const circuitBreaker = new EdgeCircuitBreaker(5, 30000);

export async function GET(request: NextRequest) {
  return circuitBreaker.execute(
    async () => {
      // Call external service
      const data = await externalApiCall();
      return NextResponse.json({ data });
    },
    () => {
      // Fallback when circuit is open
      return NextResponse.json({ 
        data: getCachedData(),
        cached: true,
        circuitOpen: true 
      });
    }
  );
}
```

## Retry Logic

### Example 4: Edge Function with Retry

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withEdgeRetry } from './middleware/edgeErrorHandler';

export async function GET(request: NextRequest) {
  try {
    const data = await withEdgeRetry(
      async () => {
        // This will be retried up to 2 times
        return await unreliableOperation();
      },
      2, // max attempts
      100 // delay between retries (ms)
    );

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Operation failed after retries' 
    }, { status: 500 });
  }
}
```

## Custom Error Types

### Example 5: Throwing Custom Edge Errors

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { 
  EdgeError, 
  EdgeErrorType,
  createEdgeErrorResponse 
} from './middleware/edgeErrorHandler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    if (!body.userId) {
      throw new EdgeError(
        EdgeErrorType.VALIDATION_ERROR,
        'userId is required',
        400,
        { field: 'userId' }
      );
    }

    // Check constraints
    if (body.data.length > 1000) {
      throw new EdgeError(
        EdgeErrorType.CONSTRAINT_VIOLATION,
        'Data exceeds edge function limit',
        413,
        { maxLength: 1000, actualLength: body.data.length }
      );
    }

    // Process request
    const result = await processData(body);
    return NextResponse.json({ result });

  } catch (error) {
    return createEdgeErrorResponse(error as Error, request);
  }
}
```

## Constraint Validation

### Example 6: Validating Edge Runtime Constraints

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { 
  validateEdgeRuntimeConstraints,
  createEdgeErrorResponse 
} from './middleware/edgeErrorHandler';

export async function POST(request: NextRequest) {
  try {
    // Validate constraints before processing
    validateEdgeRuntimeConstraints(request);

    // Process request
    const body = await request.json();
    const result = await processRequest(body);
    
    return NextResponse.json({ result });

  } catch (error) {
    return createEdgeErrorResponse(error as Error, request);
  }
}
```

## Timeout Monitoring

### Example 7: Monitoring Execution Time

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { EdgeTimeoutHandler } from './middleware/edgeErrorHandler';

export async function GET(request: NextRequest) {
  const timer = new EdgeTimeoutHandler(25);

  try {
    // Step 1: Quick operation
    const step1 = await quickOperation();
    timer.checkTimeout(); // Throws if timeout exceeded

    // Step 2: Another operation
    if (timer.isApproachingTimeout()) {
      // Skip optional operations if running out of time
      return NextResponse.json({ 
        result: step1, 
        partial: true 
      });
    }

    const step2 = await anotherOperation();
    timer.checkTimeout();

    return NextResponse.json({ 
      result: { step1, step2 },
      executionTime: timer.getRemainingTime()
    });

  } catch (error) {
    return createEdgeErrorResponse(error as Error, request);
  }
}
```

## Graceful Degradation

### Example 8: Multi-Level Fallback

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { 
  withEdgeTimeout,
  EdgeCircuitBreaker 
} from './middleware/edgeErrorHandler';

const circuitBreaker = new EdgeCircuitBreaker(5, 30000);

export async function GET(request: NextRequest) {
  // Try primary source with timeout
  return withEdgeTimeout(
    async () => {
      // Try with circuit breaker
      return circuitBreaker.execute(
        async () => {
          // Primary: Fresh data from API
          const data = await fetchFromApi();
          return NextResponse.json({ 
            data, 
            source: 'api' 
          });
        },
        async () => {
          // Secondary: Cached data
          const cached = await getCachedData();
          if (cached) {
            return NextResponse.json({ 
              data: cached, 
              source: 'cache' 
            });
          }
          
          // Tertiary: Static fallback
          return NextResponse.json({ 
            data: getStaticFallback(), 
            source: 'static' 
          });
        }
      );
    },
    25,
    () => {
      // Timeout fallback
      return NextResponse.json({ 
        data: getStaticFallback(), 
        source: 'timeout-fallback' 
      });
    }
  );
}
```

## Health Check

### Example 9: Edge Function Health Check

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createEdgeHealthCheck } from './middleware/edgeErrorHandler';

export async function GET(request: NextRequest) {
  return createEdgeHealthCheck();
}

// Response:
// {
//   "status": "healthy",
//   "edge": true,
//   "timestamp": "2024-01-01T00:00:00.000Z",
//   "region": "iad1"
// }
```

## Error Response Format

### Example 10: Standardized Error Responses

All edge errors follow this format:

```json
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

## Middleware Integration

### Example 11: Using Error Handling in Middleware

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { 
  handleEdgeMiddlewareError,
  withEdgeTimeout,
  EdgeTimeoutHandler 
} from './backend/src/middleware/edgeErrorHandler';

export async function middleware(request: NextRequest) {
  const timer = new EdgeTimeoutHandler(25);

  try {
    return await withEdgeTimeout(
      async () => {
        // Middleware logic
        timer.checkTimeout();
        const result = await processRequest(request);
        return NextResponse.next();
      },
      25,
      () => {
        // Timeout fallback
        const response = NextResponse.next();
        response.headers.set('X-Middleware-Timeout', 'true');
        return response;
      }
    );
  } catch (error) {
    return handleEdgeMiddlewareError(error as Error, request);
  }
}
```

## Testing Edge Functions

### Example 12: Testing Error Scenarios

```typescript
// Test timeout
async function testTimeout() {
  const request = new NextRequest('http://localhost/api/test');
  
  const response = await withEdgeTimeout(
    async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return NextResponse.json({ success: true });
    },
    25,
    () => NextResponse.json({ timeout: true }, { status: 504 })
  );

  console.log('Timeout test:', response.status); // Should be 504
}

// Test circuit breaker
async function testCircuitBreaker() {
  const breaker = new EdgeCircuitBreaker(3, 5000);
  
  // Cause failures
  for (let i = 0; i < 5; i++) {
    try {
      await breaker.execute(
        async () => { throw new Error('Fail'); },
        () => ({ fallback: true })
      );
    } catch (e) {}
  }

  console.log('Circuit state:', breaker.getState()); // Should be 'OPEN'
}

// Test retry
async function testRetry() {
  let attempts = 0;
  
  const result = await withEdgeRetry(
    async () => {
      attempts++;
      if (attempts < 2) throw new Error('Fail');
      return 'success';
    },
    3,
    50
  );

  console.log('Retry attempts:', attempts); // Should be 2
  console.log('Result:', result); // Should be 'success'
}
```

## Best Practices

### 1. Always Use Fallbacks

```typescript
// ✅ Good: Has fallback
return withEdgeErrorHandling(
  async () => fetchData(),
  async () => getCachedData(),
  'fetch-data'
);

// ❌ Bad: No fallback
return withEdgeErrorHandling(
  async () => fetchData(),
  undefined,
  'fetch-data'
);
```

### 2. Monitor Execution Time

```typescript
// ✅ Good: Monitors time
const timer = new EdgeTimeoutHandler(25);
const result = await operation();
timer.logIfSlow('operation');

// ❌ Bad: No monitoring
const result = await operation();
```

### 3. Validate Constraints Early

```typescript
// ✅ Good: Validates first
validateEdgeRuntimeConstraints(request);
const body = await request.json();

// ❌ Bad: Validates after processing
const body = await request.json();
validateEdgeRuntimeConstraints(request);
```

### 4. Use Circuit Breakers for External Calls

```typescript
// ✅ Good: Circuit breaker protects external calls
const breaker = new EdgeCircuitBreaker(5, 30000);
return breaker.execute(
  () => externalApi(),
  () => cachedData()
);

// ❌ Bad: No protection
return externalApi();
```

### 5. Sanitize Error Messages

```typescript
// ✅ Good: Uses error handler (sanitizes automatically)
return createEdgeErrorResponse(error, request);

// ❌ Bad: Exposes raw error
return NextResponse.json({ error: error.message });
```

## Monitoring and Logging

All edge errors are automatically logged with this format:

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

## Performance Tips

1. **Keep execution under 25ms**
   - Use timeouts to enforce limits
   - Skip optional operations if running out of time

2. **Fail fast**
   - Validate constraints early
   - Use circuit breakers to avoid slow failures

3. **Use fallbacks**
   - Always provide cached or static fallback data
   - Fail open when possible

4. **Monitor performance**
   - Log slow executions
   - Track timeout rates
   - Monitor circuit breaker states
