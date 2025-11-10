# Redis-Based Rate Limiter Usage Guide

## Overview

The Redis-based rate limiter implements a sliding window algorithm for distributed rate limiting across multiple server instances. It provides per-user and per-endpoint rate limiting with automatic fallback when Redis is unavailable.

## Features

- **Sliding Window Algorithm**: More accurate than fixed window, prevents burst traffic at window boundaries
- **Distributed**: Works across multiple server instances using Redis
- **Per-User Rate Limiting**: Tracks limits per authenticated user
- **Per-Endpoint Rate Limiting**: Different limits for different API endpoints
- **Graceful Degradation**: Fails open when Redis is unavailable
- **Standard Headers**: Returns `X-RateLimit-*` and `Retry-After` headers

## Architecture

### Requirements Addressed

- **Requirement 6.1**: Redis-based distributed rate limiting
- **Requirement 6.2**: 100 requests per minute per user for portfolio endpoints
- **Requirement 6.3**: 300 requests per minute per user for market data endpoints
- **Requirement 6.4**: 429 responses with retry-after headers
- **Requirement 6.5**: Redis for distributed rate limiting

## Pre-configured Rate Limiters

### Portfolio Endpoints
```typescript
import { portfolioLimiter } from '../middleware/rateLimiter';

router.get('/portfolio/:userId', portfolioLimiter, async (req, res) => {
  // 100 requests per minute per user
});
```

### Market Data Endpoints
```typescript
import { marketDataLimiter } from '../middleware/rateLimiter';

router.get('/market/quote/:symbol', marketDataLimiter, async (req, res) => {
  // 300 requests per minute per user
});
```

### Watchlist Endpoints
```typescript
import { watchlistLimiter } from '../middleware/rateLimiter';

router.get('/watchlist/:userId', watchlistLimiter, async (req, res) => {
  // 100 requests per minute per user
});
```

### Authentication Endpoints
```typescript
import { authLimiter } from '../middleware/rateLimiter';

router.post('/auth/login', authLimiter, async (req, res) => {
  // 5 requests per 15 minutes per IP
});
```

## Creating Custom Rate Limiters

### Basic Rate Limiter
```typescript
import { RateLimiter } from '../utils/rateLimiter';

const customLimiter = new RateLimiter({
  windowMs: 60 * 1000,      // 1 minute window
  maxRequests: 50,           // 50 requests max
  keyPrefix: 'custom'        // Redis key prefix
});
```

### User-Specific Rate Limiter
```typescript
import { createUserRateLimiter } from '../utils/rateLimiter';

const userLimiter = createUserRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyPrefix: 'ratelimit:custom'
});
```

### Custom Key Generator
```typescript
import { RateLimiter } from '../utils/rateLimiter';

const customLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyPrefix: 'custom',
  keyGenerator: (req) => {
    // Custom logic for generating rate limit keys
    const userId = req.user?.id || 'anonymous';
    const apiKey = req.headers['x-api-key'];
    return `${userId}:${apiKey}`;
  }
});
```

## Using Rate Limiter Programmatically

### Check Rate Limit
```typescript
import { portfolioRateLimiter } from '../utils/rateLimiter';

const result = await portfolioRateLimiter.checkLimit(req);

if (!result.allowed) {
  return res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      retryAfter: result.retryAfter
    }
  });
}
```

### Get Rate Limit Status (Without Incrementing)
```typescript
const status = await portfolioRateLimiter.getStatus(req);

console.log(`Remaining requests: ${status.remaining}`);
console.log(`Reset time: ${new Date(status.resetTime)}`);
```

### Reset Rate Limit
```typescript
// Useful for testing or manual intervention
await portfolioRateLimiter.reset(req);
```

## Response Headers

When rate limiting is applied, the following headers are included:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-15T10:30:00.000Z
```

When rate limit is exceeded:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2024-01-15T10:30:00.000Z
```

## Error Response Format

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please try again later",
    "retryAfter": "45 seconds",
    "resetTime": "2024-01-15T10:30:00.000Z",
    "timestamp": "2024-01-15T10:29:15.000Z"
  }
}
```

## Configuration

### Environment Variables

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379
SKIP_REDIS=false

# Rate Limiting (optional - defaults are set in code)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Redis Connection

The rate limiter uses the Redis client from `backend/src/config/redis.ts`. Ensure Redis is running and properly configured.

## Sliding Window Algorithm

The sliding window algorithm provides more accurate rate limiting:

1. **Add Request**: Each request is added to a Redis sorted set with timestamp as score
2. **Remove Old Entries**: Entries outside the time window are removed
3. **Count Requests**: Current requests in the window are counted
4. **Allow/Deny**: Request is allowed if count < limit

### Benefits over Fixed Window

- **No Burst Traffic**: Prevents burst at window boundaries
- **More Accurate**: Tracks exact request times
- **Fair Distribution**: Requests are evenly distributed over time

## Failover Behavior

When Redis is unavailable:

1. Rate limiter logs a warning
2. Request is **allowed** (fail open)
3. Returns maximum remaining count
4. Application continues to function

This ensures the application remains available even if Redis fails.

## Testing

### Unit Tests

```typescript
import { RateLimiter } from '../utils/rateLimiter';

describe('RateLimiter', () => {
  it('should allow requests under limit', async () => {
    const limiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 10
    });
    
    const result = await limiter.checkLimit(mockRequest);
    expect(result.allowed).toBe(true);
  });
  
  it('should deny requests over limit', async () => {
    // Make 10 requests
    for (let i = 0; i < 10; i++) {
      await limiter.checkLimit(mockRequest);
    }
    
    // 11th request should be denied
    const result = await limiter.checkLimit(mockRequest);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
describe('Rate Limiting Integration', () => {
  it('should rate limit portfolio endpoints', async () => {
    // Make 100 requests
    for (let i = 0; i < 100; i++) {
      const res = await request(app)
        .get('/api/portfolio/user123')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
    
    // 101st request should be rate limited
    const res = await request(app)
      .get('/api/portfolio/user123')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});
```

## Monitoring

### Check Rate Limit Status

```bash
# Check Redis keys
redis-cli KEYS "ratelimit:*"

# Check specific user's rate limit
redis-cli ZCARD "ratelimit:portfolio:user:123:/api/portfolio"

# Check when entries expire
redis-cli TTL "ratelimit:portfolio:user:123:/api/portfolio"
```

### Metrics to Track

- Rate limit hit rate (429 responses)
- Average remaining requests
- Redis connection failures
- Rate limit resets

## Best Practices

1. **Set Appropriate Limits**: Balance user experience with server capacity
2. **Use Different Limits**: Different endpoints have different resource costs
3. **Monitor Redis**: Ensure Redis is healthy and has sufficient memory
4. **Log Rate Limit Hits**: Track which users/endpoints hit limits
5. **Communicate Limits**: Document rate limits in API documentation
6. **Provide Retry-After**: Always include retry-after header in 429 responses

## Troubleshooting

### Rate Limiter Not Working

1. Check Redis connection: `redis-cli ping`
2. Check environment variables: `REDIS_URL`, `SKIP_REDIS`
3. Check Redis memory: `redis-cli INFO memory`
4. Check logs for Redis errors

### Too Many 429 Errors

1. Review rate limit configuration
2. Check if limits are too restrictive
3. Analyze traffic patterns
4. Consider increasing limits or adding caching

### Redis Memory Issues

1. Check TTL on rate limit keys
2. Ensure old entries are being cleaned up
3. Monitor Redis memory usage
4. Consider increasing Redis memory or using Redis eviction policies

## Migration from express-rate-limit

The new Redis-based rate limiter is a drop-in replacement for the old `express-rate-limit` middleware:

### Before
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60000,
  max: 100
});
```

### After
```typescript
import { portfolioLimiter } from '../middleware/rateLimiter';

// Use pre-configured limiter
router.get('/api/portfolio', portfolioLimiter, handler);
```

The new implementation provides:
- Distributed rate limiting across instances
- Per-user tracking (not just per-IP)
- Sliding window algorithm
- Better Redis integration
- Graceful degradation
