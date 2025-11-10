# CacheManager Usage Guide

## Overview

The `CacheManager` utility implements the **stale-while-revalidate** caching pattern, which provides optimal performance by serving cached data immediately while updating stale data in the background.

## Requirements Addressed

- **9.1**: Cache market data responses for 60 seconds
- **9.2**: Cache portfolio calculations for 30 seconds  
- **9.3**: Implement stale-while-revalidate caching pattern
- **9.4**: Serve stale data while fetching fresh data
- **9.5**: Set appropriate cache-control headers

## How Stale-While-Revalidate Works

1. **Fresh Data (age < TTL)**: Return cached data immediately
2. **Stale Data (TTL < age < TTL + SWR)**: Return stale data immediately + trigger background refresh
3. **Expired Data (age > TTL + SWR)**: Fetch fresh data synchronously

## Pre-configured Cache Managers

```typescript
import { marketDataCache, portfolioCache } from '../utils/cacheManager';

// Market data cache: 60s TTL + 30s stale-while-revalidate
// Portfolio cache: 30s TTL + 15s stale-while-revalidate
```

## Basic Usage

### Get with Auto-Fetch

```typescript
const quote = await marketDataCache.get(
  `quote:${symbol}`,
  async () => {
    // This function is called only when cache is empty or expired
    return await marketDataService.getQuote(symbol);
  },
  { ttl: 60, staleWhileRevalidate: 30 }
);
```

### Set Data Directly

```typescript
await marketDataCache.set(
  `quote:${symbol}`,
  quoteData,
  { ttl: 60, staleWhileRevalidate: 30 }
);
```

### Delete Cache Entry

```typescript
await marketDataCache.delete(`quote:${symbol}`);
```

### Invalidate Pattern (Multiple Keys)

```typescript
// Invalidate all portfolio cache for a user
await portfolioCache.invalidatePattern(`user:${userId}:portfolio:*`);
```

### Check Cache Stats

```typescript
const stats = await marketDataCache.getStats(`quote:${symbol}`);
// Returns: { exists: boolean, age?: number, ttl?: number, isStale?: boolean }
```

## API Endpoint Integration

### Market Data Endpoints (60s TTL)

```typescript
router.get('/quote/:symbol', async (req, res) => {
  const quote = await marketDataCache.get(
    `quote:${symbol}`,
    async () => await marketDataService.getQuote(symbol),
    { ttl: 60, staleWhileRevalidate: 30 }
  );

  // Set cache-control headers
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');

  res.json({ data: quote });
});
```

### Portfolio Endpoints (30s TTL)

```typescript
router.get('/:userId', async (req, res) => {
  const portfolioData = await portfolioCache.get(
    `user:${userId}:portfolio:page:${page}:limit:${limit}`,
    async () => {
      // Fetch and calculate portfolio data
      return await calculatePortfolioData(userId, page, limit);
    },
    { ttl: 30, staleWhileRevalidate: 15 }
  );

  // Set cache-control headers (private for user-specific data)
  res.setHeader('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=15');

  res.json({ data: portfolioData });
});
```

## Cache Invalidation on Updates

Always invalidate cache when data is modified:

```typescript
// After adding/updating/deleting a position
await portfolioCache.invalidatePattern(`user:${userId}:portfolio:*`);
```

## Cache Key Naming Conventions

- **Market Data**: `quote:{SYMBOL}`, `market:status`
- **Portfolio**: `user:{userId}:portfolio:page:{page}:limit:{limit}`
- **Use colons** to separate key segments for better organization

## Benefits

1. **Fast Response Times**: Serve cached data immediately
2. **Always Fresh**: Background updates keep data current
3. **Graceful Degradation**: Serve stale data if API fails
4. **Reduced API Calls**: Minimize external API requests
5. **Better UX**: No loading delays for users

## Cache-Control Headers

### Public Data (Market Quotes)
```
Cache-Control: public, s-maxage=60, stale-while-revalidate=30
CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=30
```

### Private Data (Portfolio)
```
Cache-Control: private, s-maxage=30, stale-while-revalidate=15
```

## Custom Cache Manager

Create a custom cache manager for specific use cases:

```typescript
import { CacheManager } from '../utils/cacheManager';

const customCache = new CacheManager('custom:');

await customCache.get(
  'mykey',
  async () => await fetchData(),
  { ttl: 120, staleWhileRevalidate: 60 }
);
```

## Error Handling

The CacheManager handles errors gracefully:
- Parse errors: Deletes corrupted cache and fetches fresh data
- Fetch errors: Logs error and propagates to caller
- Background revalidation errors: Logged but don't affect response

## Performance Considerations

- **TTL**: Balance freshness vs. API load
- **Stale-While-Revalidate**: Typically 25-50% of TTL
- **Key Design**: Use specific keys to avoid over-invalidation
- **Pattern Invalidation**: Use sparingly (scans all keys)
