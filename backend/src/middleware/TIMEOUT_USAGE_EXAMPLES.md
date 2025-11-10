# Timeout Handler Usage Examples

This document provides examples of how to use the timeout handling middleware in your API routes.

## Basic Usage

The timeout middleware is automatically applied globally in `server.ts`, so all routes have timeout tracking by default.

### Accessing Timeout Handler in Routes

```typescript
import { getTimeoutHandler } from '../middleware/timeoutHandler';

router.get('/example', async (req, res) => {
  const timeoutHandler = getTimeoutHandler(req);
  
  // Check remaining time
  const remaining = timeoutHandler?.getRemainingTime();
  console.log(`Remaining time: ${remaining}ms`);
  
  // Check if approaching timeout
  if (timeoutHandler?.isApproachingTimeout()) {
    console.warn('Approaching timeout, returning cached data');
    return res.json({ data: cachedData });
  }
  
  // Continue with normal processing
  const data = await fetchData();
  res.json({ data });
});
```

## Using Timeout Protection Wrapper

The `withTimeoutProtection` wrapper automatically handles timeouts and can use fallback data:

```typescript
import { withTimeoutProtection } from '../middleware/timeoutHandler';

router.get('/portfolio/:userId',
  withTimeoutProtection(
    // Main handler
    async (req, res) => {
      const portfolio = await fetchPortfolioWithMarketData(req.params.userId);
      res.json({ data: portfolio });
    },
    // Fallback handler (optional) - used when timeout occurs
    async (req, res) => {
      const cachedPortfolio = await getCachedPortfolio(req.params.userId);
      res.json({ 
        data: cachedPortfolio,
        cached: true,
        warning: 'Using cached data due to timeout'
      });
    }
  )
);
```

## Using Timeout-Aware Handler

For routes that need to check timeout status before proceeding:

```typescript
import { timeoutAwareHandler } from '../middleware/timeoutHandler';

router.post('/bulk-operation',
  timeoutAwareHandler(async (req, res, next) => {
    const timeoutHandler = getTimeoutHandler(req);
    
    // Process items one by one, checking timeout between each
    const results = [];
    for (const item of req.body.items) {
      if (timeoutHandler?.checkTimeout()) {
        return res.json({
          data: results,
          partial: true,
          message: 'Partial results due to timeout'
        });
      }
      
      const result = await processItem(item);
      results.push(result);
    }
    
    res.json({ data: results });
  })
);
```

## Using Check Timeout Middleware

Add the `checkTimeoutMiddleware` to specific routes that need early timeout detection:

```typescript
import { checkTimeoutMiddleware } from '../middleware/timeoutHandler';

router.get('/expensive-operation',
  checkTimeoutMiddleware(), // Checks timeout before handler
  async (req, res) => {
    // This handler only runs if timeout hasn't been reached
    const result = await expensiveOperation();
    res.json({ data: result });
  }
);
```

## Wrapping External API Calls

Use the `wrapWithTimeout` method for external API calls:

```typescript
import { getTimeoutHandler } from '../middleware/timeoutHandler';

router.get('/market/quote/:symbol', async (req, res) => {
  const timeoutHandler = getTimeoutHandler(req);
  
  if (!timeoutHandler) {
    // Fallback if no timeout handler
    const quote = await marketApi.getQuote(req.params.symbol);
    return res.json({ data: quote });
  }
  
  // Wrap external API call with timeout
  const quote = await timeoutHandler.wrapWithTimeout(
    () => marketApi.getQuote(req.params.symbol),
    () => getCachedQuote(req.params.symbol) // Fallback to cache
  );
  
  res.json({ data: quote });
});
```

## Endpoint-Specific Timeout Configurations

The middleware automatically applies different timeout configurations based on the endpoint:

- `/api/portfolio` - 8000ms (longer for complex calculations)
- `/api/market` - 6000ms (shorter for external API calls)
- `/api/watchlist` - 7000ms (standard timeout)
- `/api/auth` - 5000ms (quick timeout)
- Default - 8000ms

You can override these by passing a custom config:

```typescript
import { timeoutMiddleware } from '../middleware/timeoutHandler';

// Apply custom timeout to specific route
router.use('/api/custom', timeoutMiddleware({
  maxExecutionTime: 10000,
  warningThreshold: 8000
}));
```

## Logging Timeout Warnings

The timeout handler automatically logs warnings when requests approach the timeout threshold:

```typescript
router.get('/slow-operation', async (req, res) => {
  const timeoutHandler = getTimeoutHandler(req);
  
  // Manually log warning if needed
  timeoutHandler?.logWarningIfNeeded('Processing slow operation');
  
  const result = await slowOperation();
  res.json({ data: result });
});
```

## Best Practices

1. **Always check for timeout in long-running operations**: Use `checkTimeout()` or `isApproachingTimeout()` in loops or multi-step processes.

2. **Provide fallback data**: When possible, return cached or partial data instead of timing out completely.

3. **Use appropriate timeout configs**: Choose timeout values based on the operation type (external API calls should have shorter timeouts).

4. **Log timeout warnings**: Use `logWarningIfNeeded()` to track operations that are taking too long.

5. **Handle timeouts gracefully**: Always provide meaningful error messages to users when timeouts occur.

## Requirements Mapping

This implementation satisfies the following requirements:

- **Requirement 1.1**: Limits all Vercel Function execution time to 8 seconds maximum (configurable per endpoint)
- **Requirement 1.2**: Returns cached data or partial response when approaching timeout threshold
- **Requirement 1.3**: Implements timeout monitoring for external API calls with 5-second maximum
- **Requirement 1.4**: Returns fallback data when external API call exceeds timeout
- **Requirement 1.5**: Logs timeout warnings when functions exceed 6 seconds (configurable threshold)
