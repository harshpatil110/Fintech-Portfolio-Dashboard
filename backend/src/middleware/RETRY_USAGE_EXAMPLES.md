# Retry Handler Usage Examples

This document provides examples of how to use the retry handler utility and middleware in the application.

## Overview

The retry handler implements exponential backoff retry logic for handling transient failures. It's configured per endpoint type with appropriate retry settings.

**Requirements Addressed:**
- 3.1: Retry logic with cached fallback when all retries fail
- 3.2: Exponential backoff implementation
- 3.3: Configurable retry attempts and delays
- 3.4: Retry condition checking (only retry retryable errors)
- 3.5: Retry logging and monitoring

## Configuration

Retry configurations are defined per endpoint type in `backend/src/middleware/retryMiddleware.ts`:

```typescript
export const ENDPOINT_RETRY_CONFIGS = {
  portfolio: {
    maxAttempts: 3,
    initialDelay: 1000,      // 1 second
    maxDelay: 5000,          // 5 seconds
    backoffMultiplier: 2,
  },
  marketData: {
    maxAttempts: 3,
    initialDelay: 2000,      // 2 seconds
    maxDelay: 10000,         // 10 seconds
    backoffMultiplier: 2,
  },
  // ... other endpoint types
};
```

## Usage Patterns

### 1. Using Retry in Route Handlers

#### Option A: Wrap Entire Route Handler

```typescript
import { withRetry } from '../middleware/retryMiddleware';

router.get('/api/data',
  authenticateToken,
  withRetry(async (req: Request, res: Response) => {
    // Your route logic here
    const data = await someAsyncOperation();
    res.json({ data });
  }, 'marketData')  // Specify endpoint type
);
```

#### Option B: Use Retry Middleware

```typescript
import { createRetryMiddleware } from '../middleware/retryMiddleware';

// Apply to specific routes
router.use('/api/market', createRetryMiddleware('marketData'));

// Or apply to all routes in a router
router.use(createRetryMiddleware('default'));
```

### 2. Using Retry in Services

Wrap async operations that may fail transiently:

```typescript
import { retryAsync } from '../middleware/retryMiddleware';
import { ENDPOINT_RETRY_CONFIGS } from '../middleware/retryMiddleware';

class MyService {
  async fetchData(id: string): Promise<Data> {
    return retryAsync(
      async () => {
        // Your async operation
        const response = await externalAPI.get(`/data/${id}`);
        return response.data;
      },
      ENDPOINT_RETRY_CONFIGS.marketData,
      { operation: 'fetchData', service: 'MyService' }
    );
  }
}
```

### 3. Using Retry Handler Directly

For more control over retry behavior:

```typescript
import { RetryHandler, isRetryableError } from '../utils/retryHandler';

const retryHandler = new RetryHandler({
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 5000,
  backoffMultiplier: 2,
});

async function fetchWithRetry() {
  return retryHandler.executeWithRetry(
    async () => {
      // Your operation
      return await someAsyncOperation();
    },
    (error, attempt) => {
      // Custom retry condition
      return isRetryableError(error) && attempt < 3;
    },
    (error, attempt, delay) => {
      // Custom logging before each retry
      console.log(`Retrying in ${delay}ms (attempt ${attempt})`);
    }
  );
}
```

### 4. Custom Retry Conditions

Define custom logic for determining if an error should be retried:

```typescript
import { RetryHandler } from '../utils/retryHandler';

const retryHandler = new RetryHandler();

await retryHandler.executeWithRetry(
  async () => {
    return await riskyOperation();
  },
  (error, attempt) => {
    // Only retry on specific error codes
    if (error.code === 'ECONNREFUSED') return true;
    if (error.statusCode === 503) return true;
    if (error.statusCode === 429) return true;
    return false;
  }
);
```

## Retryable Errors

The `isRetryableError` function determines which errors should be retried:

- Network errors: `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `ECONNRESET`
- HTTP 5xx server errors (500-599)
- HTTP 429 (Too Many Requests)
- HTTP 408 (Request Timeout)
- Timeout errors
- Rate limit errors
- External service errors

## Monitoring

### Get Retry Statistics

```typescript
import { getRetryStats } from '../middleware/retryMiddleware';

// Get stats for specific endpoint type
const marketDataStats = getRetryStats('marketData');
console.log(marketDataStats);
// {
//   totalRequests: 1000,
//   retriedRequests: 50,
//   successfulRetries: 45,
//   failedRetries: 5,
//   averageAttempts: 1.05
// }

// Get stats for all endpoints
const allStats = getRetryStats();
```

### Reset Statistics

```typescript
import { resetRetryStats } from '../middleware/retryMiddleware';

// Reset specific endpoint
resetRetryStats('marketData');

// Reset all
resetRetryStats();
```

### Add Retry Stats to Response Headers

```typescript
import { retryStatsMiddleware } from '../middleware/retryMiddleware';

// Add middleware to include stats in response headers
router.use(retryStatsMiddleware());

// Response will include headers:
// X-Retry-Stats-Total: 1000
// X-Retry-Stats-Retried: 50
// X-Retry-Stats-Success-Rate: 90.00
```

## Real-World Examples

### Example 1: Market Data API with Retry

```typescript
// In MarketDataService.ts
import { retryAsync } from '../middleware/retryMiddleware';
import { ENDPOINT_RETRY_CONFIGS } from '../middleware/retryMiddleware';

async getQuote(symbol: string): Promise<StockQuote> {
  return retryAsync(
    async () => {
      const response = await this.client.get('/quote', {
        params: { symbol }
      });
      return response.data;
    },
    ENDPOINT_RETRY_CONFIGS.marketData,
    { operation: 'getQuote', service: 'MarketDataService' }
  );
}
```

### Example 2: Portfolio Route with Retry and Fallback

```typescript
// In portfolio routes
import { withRetry } from '../middleware/retryMiddleware';

router.get('/:userId',
  authenticateToken,
  withRetry(async (req: Request, res: Response) => {
    try {
      const portfolio = await portfolioService.getPortfolio(req.params.userId);
      res.json({ data: portfolio });
    } catch (error) {
      // If all retries fail, return cached data
      const cached = await cacheService.getCachedPortfolio(req.params.userId);
      if (cached) {
        res.json({ 
          data: cached, 
          warning: 'Using cached data due to service unavailability' 
        });
      } else {
        throw error;
      }
    }
  }, 'portfolio')
);
```

### Example 3: Monitoring Endpoint

```typescript
// Health check endpoint with retry stats
router.get('/health/retry-stats',
  authenticateToken,
  async (req: Request, res: Response) => {
    const stats = getRetryStats();
    res.json({
      data: {
        overall: stats,
        marketData: getRetryStats('marketData'),
        portfolio: getRetryStats('portfolio'),
      },
      timestamp: new Date()
    });
  }
);
```

## Best Practices

1. **Choose Appropriate Endpoint Type**: Use the correct endpoint type configuration for your use case
   - `marketData`: For external API calls that may be slow or unreliable
   - `portfolio`: For internal operations that may have transient failures
   - `auth`: For authentication operations (minimal retries for security)

2. **Combine with Circuit Breaker**: Use retry logic together with circuit breaker for external services
   ```typescript
   // Circuit breaker wraps retry logic
   await circuitBreaker.execute(
     async () => retryAsync(apiCall, config),
     fallbackFunction
   );
   ```

3. **Log Appropriately**: Retry middleware automatically logs retry attempts, but you can add custom logging
   ```typescript
   await retryHandler.executeWithRetry(
     operation,
     isRetryableError,
     (error, attempt, delay) => {
       logger.warn(`Retry ${attempt}: ${error.message}, waiting ${delay}ms`);
     }
   );
   ```

4. **Monitor Retry Rates**: High retry rates may indicate underlying issues
   - Set up alerts when retry rate exceeds threshold
   - Review retry statistics regularly
   - Investigate patterns in failed retries

5. **Provide Fallbacks**: Always have a fallback strategy when retries are exhausted
   - Return cached data
   - Return partial data
   - Return user-friendly error message

## Testing

### Unit Testing Retry Logic

```typescript
import { RetryHandler } from '../utils/retryHandler';

describe('RetryHandler', () => {
  it('should retry on retryable errors', async () => {
    const handler = new RetryHandler({ maxAttempts: 3 });
    let attempts = 0;
    
    const result = await handler.executeWithRetry(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    });
    
    expect(attempts).toBe(3);
    expect(result).toBe('success');
  });
});
```

### Integration Testing with Retry

```typescript
describe('Market Data API with Retry', () => {
  it('should retry and succeed on transient failure', async () => {
    // Mock API to fail twice then succeed
    let callCount = 0;
    mockAPI.get.mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Service unavailable');
      }
      return { data: mockQuote };
    });
    
    const quote = await marketDataService.getQuote('AAPL');
    
    expect(callCount).toBe(3);
    expect(quote).toEqual(mockQuote);
  });
});
```

## Troubleshooting

### High Retry Rates

If you see high retry rates:
1. Check external service health
2. Review timeout configurations
3. Check network connectivity
4. Review error logs for patterns

### Retries Not Working

If retries aren't happening:
1. Verify error is retryable (check `isRetryableError`)
2. Check retry configuration is applied
3. Verify middleware is properly attached
4. Check logs for retry attempts

### Performance Issues

If retries are causing performance issues:
1. Reduce `maxAttempts`
2. Reduce `maxDelay`
3. Implement circuit breaker to fail fast
4. Add caching to reduce need for retries
