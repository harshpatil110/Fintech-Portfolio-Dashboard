import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { createMarketDataService } from '../services/MarketDataService';
import { MarketDataRepository } from '../repositories/MarketDataRepository';
import CacheService from '../services/CacheService';
import { authenticateToken } from '../utils/auth';
import { getTimeoutHandler } from '../middleware/timeoutHandler';
import { getRetryStats } from '../middleware/retryMiddleware';
import { marketDataCache } from '../utils/cacheManager';
import { asyncHandler, ValidationError } from '../utils/errorHandler';
import { marketDataLimiter } from '../middleware/rateLimiter';

/**
 * Market Data API Routes
 * 
 * Requirements implemented:
 * - 1.3: Timeout handling for external API (6s limit)
 * - 5.1: Circuit breaker for external market data API
 * - 6.3: Rate limiting (300 req/min per user)
 * - 9.1: Cache market data responses for 60 seconds
 * 
 * NOTE: Timeout handling is automatically applied via global middleware in server.ts
 * Market data routes have a 6-second timeout configured (see ENDPOINT_TIMEOUT_CONFIGS)
 * This shorter timeout is appropriate for external API calls that should respond quickly.
 * 
 * Circuit breaker is implemented in MarketDataService to prevent cascading failures.
 * When circuit is open, cached data is returned automatically.
 */

const router = Router();
const marketDataService = createMarketDataService();
const marketDataRepository = new MarketDataRepository();

// Validation middleware
const validateSymbol = param('symbol')
  .isString()
  .isLength({ min: 1, max: 10 })
  .matches(/^[A-Za-z0-9.-]+$/)
  .withMessage('Invalid stock symbol format');

const validateSymbols = body('symbols')
  .isArray({ min: 1, max: 50 })
  .withMessage('Symbols must be an array with 1-50 items')
  .custom((symbols) => {
    return symbols.every((symbol: string) => 
      typeof symbol === 'string' && 
      symbol.length >= 1 && 
      symbol.length <= 10 &&
      /^[A-Za-z0-9.-]+$/.test(symbol)
    );
  })
  .withMessage('All symbols must be valid stock symbols');

const validateSearchQuery = query('q')
  .isString()
  .isLength({ min: 1, max: 50 })
  .withMessage('Search query must be 1-50 characters');

const validatePeriod = query('period')
  .optional()
  .isIn(['daily', 'intraday'])
  .withMessage('Period must be either "daily" or "intraday"');

// Error handling middleware
const handleValidationErrors = (req: Request, res: Response, next: Function) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: errors.array(),
        timestamp: new Date()
      }
    });
  }
  return next();
};

// Get current stock quote
// Requirements: 1.3, 5.1, 6.3, 9.1
router.get('/quote/:symbol', 
  marketDataLimiter, // Requirement 6.3: Rate limiting (300 req/min)
  authenticateToken,
  validateSymbol,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { symbol } = req.params;
    if (!symbol) {
      throw new ValidationError('Symbol parameter is required');
    }
    const upperSymbol = symbol.toUpperCase();

    // Requirement 1.3: Get timeout handler for timeout protection
    const timeoutHandler = getTimeoutHandler(req);

    // Use CacheManager with stale-while-revalidate pattern
    // Requirement 9.1: 60s TTL for market data
    // Requirement 9.3: Implement stale-while-revalidate caching pattern
    // Requirement 5.1: Circuit breaker is implemented in marketDataService.getQuote()
    const quote = await marketDataCache.get(
      `quote:${upperSymbol}`,
      async () => {
        // Requirement 1.3: Check timeout before external API call
        if (timeoutHandler?.isApproachingTimeout()) {
          throw new Error('Timeout approaching, using cached data');
        }
        
        // Requirement 5.1: Circuit breaker wraps this call in MarketDataService
        const freshQuote = await marketDataService.getQuote(upperSymbol);
        
        // Also cache in database for long-term storage
        await marketDataRepository.cacheQuote(freshQuote);
        return freshQuote;
      },
      { ttl: 60, staleWhileRevalidate: 30 }
    );

    // Requirement 9.5: Set appropriate cache-control headers
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
    res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');

    res.json({
      data: quote,
      timestamp: new Date(),
      source: 'cache'
    });
  })
);

// Get multiple stock quotes
// Requirements: 1.3, 5.1, 6.3, 9.1
router.post('/quotes',
  marketDataLimiter, // Requirement 6.3: Rate limiting (300 req/min)
  authenticateToken,
  validateSymbols,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { symbols } = req.body;
      const upperSymbols = symbols.map((s: string) => s.toUpperCase());

      // Requirement 1.3: Get timeout handler
      const timeoutHandler = getTimeoutHandler(req);

      // Fetch quotes for all symbols using CacheManager
      // Each symbol is cached individually with stale-while-revalidate
      // Requirement 5.1: Circuit breaker is implemented in marketDataService
      const quotePromises = upperSymbols.map((symbol: string) =>
        marketDataCache.get(
          `quote:${symbol}`,
          async () => {
            // Requirement 1.3: Check timeout before each API call
            if (timeoutHandler?.isApproachingTimeout()) {
              throw new Error('Timeout approaching');
            }
            
            // Requirement 5.1: Circuit breaker wraps this call
            const quote = await marketDataService.getQuote(symbol);
            await marketDataRepository.cacheQuote(quote);
            return quote;
          },
          { ttl: 60, staleWhileRevalidate: 30 }
        ).catch(error => {
          console.error(`Failed to fetch quote for ${symbol}:`, error);
          return null;
        })
      );

      const quotes = (await Promise.all(quotePromises)).filter(q => q !== null);

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');

      res.json({
        data: quotes,
        timestamp: new Date(),
        source: 'cache',
        requestedSymbols: upperSymbols.length,
        returnedSymbols: quotes.length
      });
  })
);

// Search for stocks
// Requirements: 1.3, 5.1, 6.3, 9.1
router.get('/search',
  marketDataLimiter, // Requirement 6.3: Rate limiting (300 req/min)
  authenticateToken,
  validateSearchQuery,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { q: query } = req.query as { q: string };
      
      // Use CacheManager with stale-while-revalidate pattern
      // Cache search results to reduce API calls for common searches
      const results = await marketDataCache.get(
        `search:${query.toLowerCase()}`,
        async () => await marketDataService.searchSymbols(query),
        { ttl: 60, staleWhileRevalidate: 30 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      
      res.json({
        data: results,
        timestamp: new Date(),
        query: query,
        source: 'cache'
      });
  })
);

// Get historical data
// Requirements: 1.3, 5.1, 6.3, 9.1
router.get('/history/:symbol',
  marketDataLimiter, // Requirement 6.3: Rate limiting (300 req/min)
  authenticateToken,
  validateSymbol,
  validatePeriod,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { symbol } = req.params;
      if (!symbol) {
        throw new ValidationError('Symbol parameter is required');
      }
      const { period = 'daily' } = req.query as { period?: string };
      const upperSymbol = symbol.toUpperCase();
      
      // Use CacheManager with stale-while-revalidate pattern
      // Historical data changes less frequently, so caching is beneficial
      const historicalData = await marketDataCache.get(
        `history:${upperSymbol}:${period}`,
        async () => await marketDataService.getHistoricalData(upperSymbol, period),
        { ttl: 60, staleWhileRevalidate: 30 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      
      res.json({
        data: historicalData,
        timestamp: new Date(),
        period: period,
        source: 'cache'
      });
  })
);

// Validate stock symbol
// Requirements: 1.3, 5.1, 6.3, 9.1
router.get('/validate/:symbol',
  marketDataLimiter, // Requirement 6.3: Rate limiting (300 req/min)
  authenticateToken,
  validateSymbol,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { symbol } = req.params;
      if (!symbol) {
        throw new ValidationError('Symbol parameter is required');
      }
      const upperSymbol = symbol.toUpperCase();
      
      // Use CacheManager - symbol validation results rarely change
      const validationResult = await marketDataCache.get(
        `validate:${upperSymbol}`,
        async () => {
          const isValid = await marketDataService.validateSymbol(upperSymbol);
          return { symbol: upperSymbol, isValid };
        },
        { ttl: 60, staleWhileRevalidate: 30 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      
      res.json({
        data: validationResult,
        timestamp: new Date(),
        source: 'cache'
      });
  })
);

// Get market status
// Requirements: 1.3, 5.1, 6.3, 9.1
router.get('/status',
  marketDataLimiter, // Requirement 6.3: Rate limiting (300 req/min)
  authenticateToken,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Use CacheManager with stale-while-revalidate pattern
      const marketStatus = await marketDataCache.get(
        'market:status',
        async () => {
          // Get a sample quote to determine market status
          // Using a major index like SPY as it's always available
          const quote = await marketDataService.getQuote('SPY');
          return {
            status: quote.marketStatus,
            timestamp: quote.timestamp.toISOString()
          };
        },
        { ttl: 60, staleWhileRevalidate: 30 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      
      res.json({
        data: {
          marketStatus: marketStatus.status,
          timestamp: marketStatus.timestamp
        },
        timestamp: new Date(),
        source: 'cache'
      });
    } catch (error) {
      console.error('Error getting market status:', error);
      
      // Fallback to time-based market status
      const now = new Date();
      const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
      const hour = easternTime.getHours();
      const dayOfWeek = easternTime.getDay();
      
      let status = 'CLOSED';
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Monday to Friday
        if (hour >= 9 && hour < 16) {
          status = 'OPEN';
        } else if (hour >= 4 && hour < 9) {
          status = 'PRE_MARKET';
        } else if (hour >= 16 && hour < 20) {
          status = 'AFTER_HOURS';
        }
      }
      
      res.json({
        data: {
          marketStatus: status,
          timestamp: new Date()
        },
        timestamp: new Date(),
        source: 'fallback'
      });
    }
  })
);

// WebSocket connection info
router.get('/ws/info',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
      // This would be injected by the WebSocket service if available
      const wsService = (req as any).wsService;
      
      res.json({
        data: {
          endpoint: `/ws/market?token=${req.headers.authorization?.replace('Bearer ', '')}`,
          connectedClients: wsService?.getConnectedClients() || 0,
          subscribedSymbols: wsService?.getSubscribedSymbols() || [],
          protocol: 'WebSocket',
          messageTypes: ['subscribe', 'unsubscribe', 'quote', 'error', 'heartbeat', 'market_status']
        },
        timestamp: new Date()
      });
  })
);

// Circuit breaker monitoring endpoint
// Requirement: 5.5 - Add circuit breaker state monitoring
router.get('/health/circuit-breaker',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const state = marketDataService.getCircuitBreakerState();
      const stats = marketDataService.getCircuitBreakerStats();
      
      res.json({
        data: {
          serviceName: state.serviceName,
          state: state.state,
          isHealthy: state.state === 'CLOSED',
          statistics: {
            failureCount: stats.failureCount,
            successCount: stats.successCount,
            lastFailureTime: stats.lastFailureTime ? new Date(stats.lastFailureTime).toISOString() : null,
            lastSuccessTime: stats.lastSuccessTime ? new Date(stats.lastSuccessTime).toISOString() : null,
            nextAttemptTime: stats.nextAttemptTime ? new Date(stats.nextAttemptTime).toISOString() : null
          },
          details: {
            consecutiveSuccesses: state.consecutiveSuccesses,
            stateDescription: getCircuitStateDescription(state.state)
          }
        },
        timestamp: new Date()
      });
  })
);

// Helper function to describe circuit state
function getCircuitStateDescription(state: string): string {
  switch (state) {
    case 'CLOSED':
      return 'Normal operation - requests are passing through';
    case 'OPEN':
      return 'Circuit is open - requests are failing fast with cached fallback';
    case 'HALF_OPEN':
      return 'Testing service recovery - allowing limited requests';
    default:
      return 'Unknown state';
  }
}

// Retry monitoring endpoint
// Requirement: 3.5 - Add retry logging and monitoring
router.get('/health/retry-stats',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const allStats = getRetryStats();
      const marketDataStats = getRetryStats('marketData');
      
      res.json({
        data: {
          overall: allStats,
          marketData: marketDataStats || {
            totalRequests: 0,
            retriedRequests: 0,
            successfulRetries: 0,
            failedRetries: 0,
            averageAttempts: 0,
          },
          summary: {
            totalEndpoints: Object.keys(allStats).length,
            healthStatus: marketDataStats && marketDataStats.failedRetries > 0 ? 'degraded' : 'healthy',
          }
        },
        timestamp: new Date()
      });
  })
);

export default router;