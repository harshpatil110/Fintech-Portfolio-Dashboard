# Edge Middleware Usage Guide

## Overview

Edge middleware runs on Vercel's Edge Network before requests reach your API functions. It provides lightweight authentication and rate limiting with <25ms execution time.

## Requirements

- **10.1**: Edge Function execution limited to 25ms for middleware
- **10.2**: Avoid heavy computations in Edge Function
- **10.3**: Use only Edge-compatible APIs in middleware
- **10.4**: Graceful fallback when Edge Function fails
- **10.5**: Lightweight authentication checks in Edge Function

## Architecture

```
Client Request
     ↓
Edge Middleware (Vercel Edge Network)
     ├─ Rate Limiting Check (<5ms)
     ├─ Authentication Check (<5ms)
     └─ Request Headers Update
     ↓
API Function (Serverless)
```

## Components

### 1. Edge Authentication (`edgeAuth.ts`)

Lightweight JWT verification optimized for edge runtime.

**Features:**
- Token validation without crypto libraries
- <5ms execution time
- Graceful fallback on errors
- Public route detection

**Usage:**

```typescript
import { edgeAuthCheck, isPublicRoute } from './middleware/edgeAuth';

// Check authentication
const result = await edgeAuthCheck(request);
if (result.authenticated) {
  console.log('User ID:', result.userId);
}

// Check if route is public
if (isPublicRoute('/api/auth/login')) {
  // Skip authentication
}
```

### 2. Edge Rate Limiting (`edgeRateLimiter.ts`)

In-memory rate limiting for edge runtime.

**Features:**
- In-memory store with automatic cleanup
- <5ms execution time
- Per-user and per-IP limiting
- Sliding window algorithm

**Rate Limits:**
- Portfolio: 100 req/min
- Market Data: 300 req/min
- Auth: 20 req/min
- General: 500 req/min

**Usage:**

```typescript
import { edgeRateLimit } from './middleware/edgeRateLimiter';

// Check rate limit
const result = await edgeRateLimit(request);
if (!result.allowed) {
  console.log('Rate limited, retry after:', result.retryAfter);
}
```

### 3. Main Middleware (`middleware.ts`)

Root-level middleware that combines authentication and rate limiting.

**Execution Flow:**
1. Skip static assets and Next.js internals
2. Check rate limits (all routes)
3. Check authentication (protected routes only)
4. Add headers and pass request through

**Configuration:**

```typescript
export const config = {
  matcher: ['/api/:path*']
};
```

### 4. Edge Helpers (`edgeHelpers.ts`)

Utility functions for edge runtime.

**Features:**
- Execution time tracking
- Error response builders
- Request context creation
- Edge constraint validation

**Usage:**

```typescript
import { 
  EdgeExecutionTimer, 
  createEdgeErrorResponse,
  validateEdgeConstraints 
} from './utils/edgeHelpers';

// Track execution time
const timer = new EdgeExecutionTimer(25);
// ... do work ...
timer.logIfSlow('my-function');

// Create error response
return createEdgeErrorResponse(
  'INVALID_REQUEST',
  'Request validation failed',
  400
);

// Validate constraints
const validation = validateEdgeConstraints(request);
if (!validation.valid) {
  return createEdgeErrorResponse('CONSTRAINT_ERROR', validation.error!, 400);
}
```

## Performance Optimization

### Execution Time Targets

- **Rate Limiting**: <5ms
- **Authentication**: <5ms
- **Total Middleware**: <25ms

### Best Practices

1. **Avoid Heavy Operations**
   - No database queries
   - No external API calls
   - No complex cryptography

2. **Use In-Memory Storage**
   - Rate limit counters in memory
   - Token validation without external calls

3. **Fail Open**
   - Allow requests if middleware fails
   - Log errors but don't block traffic

4. **Monitor Performance**
   - Log execution times
   - Alert on slow middleware (>25ms)

## Error Handling

### Graceful Fallback

Edge middleware fails open to prevent blocking legitimate traffic:

```typescript
try {
  // Middleware logic
} catch (error) {
  console.error('Edge middleware error:', error);
  // Allow request to proceed
  return NextResponse.next();
}
```

### Error Responses

Standardized error format:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "retryAfter": "60 seconds"
  }
}
```

## Testing

### Local Testing

```bash
# Run development server
npm run dev

# Test authentication
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/portfolio

# Test rate limiting
for i in {1..150}; do curl http://localhost:3000/api/portfolio; done
```

### Edge Runtime Testing

```bash
# Deploy to Vercel preview
vercel

# Monitor edge logs
vercel logs --follow
```

### Performance Testing

```typescript
// Add timing logs
const startTime = Date.now();
// ... middleware logic ...
const elapsed = Date.now() - startTime;
console.log(`Middleware execution: ${elapsed}ms`);
```

## Monitoring

### Metrics to Track

1. **Execution Time**
   - p50, p95, p99 latency
   - Alert if >25ms

2. **Rate Limit Hits**
   - Number of 429 responses
   - Top rate-limited users/IPs

3. **Authentication Failures**
   - Number of 401 responses
   - Invalid token patterns

4. **Error Rate**
   - Middleware errors
   - Fallback activations

### Logging

```typescript
// Execution log
{
  type: 'edge_middleware',
  pathname: '/api/portfolio',
  executionTime: '15ms',
  status: 'success',
  timestamp: '2024-01-01T00:00:00.000Z'
}

// Error log
{
  type: 'edge_middleware_error',
  pathname: '/api/portfolio',
  error: 'Rate limit store error',
  executionTime: '8ms',
  timestamp: '2024-01-01T00:00:00.000Z'
}
```

## Deployment

### Environment Variables

```env
# JWT Configuration
JWT_SECRET=your-secret-key

# Rate Limiting
EDGE_RATE_LIMIT_ENABLED=true

# Monitoring
VERCEL_REGION=iad1
NODE_ENV=production
```

### Vercel Configuration

```json
{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 10
    }
  }
}
```

## Troubleshooting

### Slow Middleware (>25ms)

**Symptoms:**
- Warnings in logs: "Edge middleware slow"
- Increased latency

**Solutions:**
1. Check for heavy operations
2. Optimize token validation
3. Reduce rate limit store size
4. Consider moving logic to API functions

### Rate Limit Store Memory Issues

**Symptoms:**
- Memory errors in edge runtime
- Inconsistent rate limiting

**Solutions:**
1. Increase cleanup frequency
2. Reduce window size
3. Use Redis for distributed rate limiting (in API functions)

### Authentication Failures

**Symptoms:**
- Legitimate requests getting 401
- Token validation errors

**Solutions:**
1. Check JWT secret configuration
2. Verify token format
3. Check token expiration
4. Review public routes list

## Migration from Express Middleware

### Before (Express)

```typescript
app.use(authenticateToken);
app.use(rateLimiter);
```

### After (Edge)

```typescript
// middleware.ts (root level)
export async function middleware(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await edgeRateLimitMiddleware(request);
  if (rateLimitResponse) return rateLimitResponse;

  // Authentication
  const authResponse = await edgeAuthMiddleware(request);
  if (authResponse) return authResponse;

  return NextResponse.next();
}
```

## Security Considerations

1. **Token Validation**
   - Simplified validation for edge
   - Full validation in API functions
   - No signature verification in edge (performance)

2. **Rate Limiting**
   - In-memory store (not distributed)
   - Per-edge-region limits
   - Backend has additional Redis-based limits

3. **Error Messages**
   - Generic messages in edge
   - Detailed errors in API functions
   - No sensitive information in responses

## Future Enhancements

1. **Distributed Rate Limiting**
   - Use Vercel KV for edge storage
   - Cross-region rate limiting

2. **Advanced Authentication**
   - API key validation
   - OAuth token validation

3. **Request Filtering**
   - Bot detection
   - Suspicious pattern detection

4. **Caching**
   - Edge caching for public data
   - Cache-Control header management
