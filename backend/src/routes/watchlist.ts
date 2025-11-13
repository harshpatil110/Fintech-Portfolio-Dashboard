import { Router, Response } from 'express';
import { body } from 'express-validator';
import { WatchlistRepository } from '../repositories/WatchlistRepository';
import { authenticateToken, AuthenticatedRequest } from '../utils/auth';
import { MarketDataService, createMarketDataService } from '../services/MarketDataService';
import {
  validateStockSymbol,
  validateCompanyName,
  validateAlertPrice,
  validateUserId,
  validateBulkWatchlistAdd,
  handleValidationErrors,
  sanitizeInput
} from '../middleware/validation';
import { watchlistLimiter, bulkOperationsLimiter } from '../middleware/rateLimiter';
import { CacheManager } from '../utils/cacheManager';
import { asyncHandler } from '../utils/errorHandler';
import { RetryHandler, isRetryableError } from '../utils/retryHandler';
import { getTimeoutHandler } from '../middleware/timeoutHandler';
import { PayloadValidator } from '../middleware/payloadValidator';

const router = Router();
const watchlistRepository = new WatchlistRepository();
let marketDataService: MarketDataService;

// Initialize retry handler for watchlist operations
// Requirement 3.1, 3.4, 3.5: Implement retry logic with exponential backoff
const retryHandler = new RetryHandler({
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 2000,
  backoffMultiplier: 2
});

// Initialize market data service
try {
  marketDataService = createMarketDataService();
} catch (error) {
  console.error('Failed to initialize market data service:', error);
}

// Watchlist cache: 30s TTL with 15s stale-while-revalidate
// Requirement 9.2: Cache portfolio calculations for 30 seconds (watchlist is similar to portfolio data)
const watchlistCache = new CacheManager('watchlist:');

/**
 * Validation rules for adding a stock to watchlist
 */
const validateAddToWatchlist = [
  validateStockSymbol(),
  validateCompanyName(),
  validateAlertPrice()
];

/**
 * GET /api/watchlist/:userId
 * Retrieve user's complete watchlist with current market data, sorting, and filtering
 * Requirements:
 * - 2.1: Payload validation
 * - 3.1: Retry logic with exponential backoff
 * - 6.2: Rate limiting (100 req/min per user)
 * - 9.2: Cache watchlist data for 30 seconds
 */
router.get('/:userId',
  watchlistLimiter, // Requirement 6.2: Rate limiting
  authenticateToken,
  sanitizeInput,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestedUserId = req.params.userId;
    const authenticatedUserId = req.user!.userId;

    // Ensure users can only access their own watchlist
    if (requestedUserId !== authenticatedUserId) {
      res.status(403).json({
        error: {
          code: 'UNAUTHORIZED_ACCESS',
          message: 'You can only access your own watchlist',
          timestamp: new Date()
        }
      });
      return;
    }

    // Get timeout handler
    const timeoutHandler = getTimeoutHandler(req);

    // Parse query parameters for sorting and filtering
    const {
      sortBy = 'addedAt',
      sortOrder = 'desc',
      filterBy,
      filterValue,
      alertsOnly = 'false',
      gainersOnly = 'false',
      losersOnly = 'false'
    } = req.query;

    // Create cache key based on query parameters
    const queryKey = JSON.stringify({ sortBy, sortOrder, filterBy, filterValue, alertsOnly, gainersOnly, losersOnly });

    // Use CacheManager with stale-while-revalidate pattern
    // Requirement 9.2: 30s TTL for watchlist data
    const watchlistData = await watchlistCache.get(
      `user:${requestedUserId}:list:${queryKey}`,
      async () => {
        // Check timeout before expensive operations
        if (timeoutHandler?.checkTimeout()) {
          throw new Error('Timeout approaching, returning cached data');
        }

        // Requirement 3.1: Get user's watchlist with retry logic
        const watchlistItems = await retryHandler.executeWithRetry(
          () => watchlistRepository.findByUserId(requestedUserId),
          isRetryableError
        );
          
          if (watchlistItems.length === 0) {
            return {
              items: [],
              summary: {
                totalItems: 0,
                filteredItems: 0,
                itemsWithAlerts: 0,
                triggeredAlerts: []
              }
            };
          }

          // Get current market data for all watchlist items
          const symbols = watchlistItems.map(item => item.symbol);
          let updatedItems = [...watchlistItems];
          
          if (marketDataService) {
            try {
              // Check timeout before fetching market data
              if (timeoutHandler?.isApproachingTimeout()) {
                throw new Error('Timeout approaching, skipping market data fetch');
              }

              // Requirement 3.1: Fetch market data with retry logic
              const quotes = await retryHandler.executeWithRetry(
                () => marketDataService.getBatchQuotes(symbols),
                isRetryableError
              );
              const quoteMap = new Map(quotes.map(quote => [quote.symbol, quote]));
              
              // Update watchlist items with current market data
              updatedItems = watchlistItems.map(item => {
                const quote = quoteMap.get(item.symbol);
                if (quote) {
                  return {
                    ...item,
                    currentPrice: quote.currentPrice,
                    change: quote.change,
                    changePercent: quote.changePercent
                  };
                }
                return item;
              });
            } catch (marketDataError) {
              console.error('Failed to fetch market data for watchlist:', marketDataError);
              // Continue with watchlist items without current market data
            }
          }

          // Apply filters
          let filteredItems = updatedItems;

          // Filter by alerts only
          if (alertsOnly === 'true') {
            filteredItems = filteredItems.filter(item => item.alertPrice !== undefined);
          }

          // Filter by gainers only
          if (gainersOnly === 'true') {
            filteredItems = filteredItems.filter(item => 
              item.changePercent !== undefined && item.changePercent > 0
            );
          }

          // Filter by losers only
          if (losersOnly === 'true') {
            filteredItems = filteredItems.filter(item => 
              item.changePercent !== undefined && item.changePercent < 0
            );
          }

          // Apply custom filter
          if (filterBy && filterValue) {
            const filterVal = String(filterValue).toLowerCase();
            filteredItems = filteredItems.filter(item => {
              switch (filterBy) {
                case 'symbol':
                  return item.symbol.toLowerCase().includes(filterVal);
                case 'companyName':
                  return item.companyName.toLowerCase().includes(filterVal);
                default:
                  return true;
              }
            });
          }

          // Apply sorting
          filteredItems.sort((a, b) => {
            let aValue: any;
            let bValue: any;

            switch (sortBy) {
              case 'symbol':
                aValue = a.symbol;
                bValue = b.symbol;
                break;
              case 'companyName':
                aValue = a.companyName;
                bValue = b.companyName;
                break;
              case 'currentPrice':
                aValue = a.currentPrice || 0;
                bValue = b.currentPrice || 0;
                break;
              case 'change':
                aValue = a.change || 0;
                bValue = b.change || 0;
                break;
              case 'changePercent':
                aValue = a.changePercent || 0;
                bValue = b.changePercent || 0;
                break;
              case 'alertPrice':
                aValue = a.alertPrice || 0;
                bValue = b.alertPrice || 0;
                break;
              case 'addedAt':
              default:
                aValue = new Date(a.addedAt).getTime();
                bValue = new Date(b.addedAt).getTime();
                break;
            }

            if (typeof aValue === 'string') {
              aValue = aValue.toLowerCase();
              bValue = bValue.toLowerCase();
            }

            let comparison = 0;
            if (aValue < bValue) {
              comparison = -1;
            } else if (aValue > bValue) {
              comparison = 1;
            }

            return sortOrder === 'desc' ? -comparison : comparison;
          });

          // Calculate summary
          const itemsWithAlerts = updatedItems.filter(item => item.alertPrice !== undefined);
          const triggeredAlerts = updatedItems.filter(item => 
            item.alertPrice !== undefined && 
            item.currentPrice !== undefined && 
            item.currentPrice <= item.alertPrice
          );

          return {
            items: filteredItems,
            summary: {
              totalItems: updatedItems.length,
              filteredItems: filteredItems.length,
              itemsWithAlerts: itemsWithAlerts.length,
              triggeredAlerts
            }
          };
        },
        { ttl: 30, staleWhileRevalidate: 15 }
      );

    // Requirement 9.5: Set appropriate cache-control headers
    res.setHeader('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=15');

    // Requirement 2.1: Validate response payload size
    const validator = new PayloadValidator();
    const responseData = {
      message: 'Watchlist retrieved successfully',
      data: watchlistData,
      timestamp: new Date()
    };
    
    const validationResult = validator.validateResponse(responseData);
    if (!validationResult.valid) {
      console.warn('Response payload too large for watchlist');
    }

    res.json(responseData);
  })
);

/**
 * POST /api/watchlist
 * Add a stock to the user's watchlist
 * Requirements: 2.1, 3.1, 6.2, 9.2
 */
router.post('/', 
  watchlistLimiter, // Requirement 6.2: Rate limiting
  authenticateToken,
  sanitizeInput,
  validateAddToWatchlist,
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { symbol, companyName, alertPrice } = req.body;
    const userId = req.user!.userId;

    // Requirement 2.1: Payload validation is handled by validateAddToWatchlist middleware

    // Validate stock symbol with market data service if available
    if (marketDataService) {
      try {
        // Requirement 3.1: Validate symbol with retry logic
        const isValid = await retryHandler.executeWithRetry(
          () => marketDataService.validateSymbol(symbol),
          isRetryableError
        );
        
        if (!isValid) {
          res.status(400).json({
            error: {
              code: 'INVALID_SYMBOL',
              message: `Stock symbol ${symbol.toUpperCase()} is not valid or not found`,
              timestamp: new Date()
            }
          });
          return;
        }
      } catch (validationError) {
        console.error('Symbol validation failed:', validationError);
        // Continue without validation if market data service is unavailable
      }
    }

    // Requirement 3.1: Add to watchlist with retry logic
    const watchlistItem = await retryHandler.executeWithRetry(
      () => watchlistRepository.add(userId, {
        symbol: symbol.toUpperCase(),
        companyName,
        alertPrice: alertPrice ? parseFloat(alertPrice) : undefined
      }),
      (error) => {
        // Don't retry if it's a business logic error (already exists, limit exceeded)
        if (error instanceof Error) {
          if (error.message.includes('already in your watchlist') || 
              error.message.includes('Watchlist limit')) {
            return false;
          }
        }
        return isRetryableError(error);
      }
    );

    // Requirement 9.2: Implement cache invalidation on data updates
    // Invalidate all cached watchlist data for this user
    await watchlistCache.invalidatePattern(`user:${userId}:*`);

    res.status(201).json({
      message: 'Stock added to watchlist successfully',
      data: watchlistItem,
      timestamp: new Date()
    });
  })
);

/**
 * DELETE /api/watchlist/:userId/:symbol
 * Remove a stock from the user's watchlist
 * Requirements: 3.1, 6.2, 9.2
 */
router.delete('/:userId/:symbol',
  watchlistLimiter, // Requirement 6.2: Rate limiting
  authenticateToken,
  sanitizeInput,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId: requestedUserId, symbol } = req.params;
    const authenticatedUserId = req.user!.userId;

    // Ensure users can only modify their own watchlist
    if (requestedUserId !== authenticatedUserId) {
      res.status(403).json({
        error: {
          code: 'UNAUTHORIZED_ACCESS',
          message: 'You can only modify your own watchlist',
          timestamp: new Date()
        }
      });
      return;
    }

    if (!symbol) {
      res.status(400).json({
        error: {
          code: 'MISSING_SYMBOL',
          message: 'Stock symbol is required',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 3.1: Check if the stock exists in the watchlist with retry logic
    const existingItem = await retryHandler.executeWithRetry(
      () => watchlistRepository.findByUserIdAndSymbol(requestedUserId, symbol),
      isRetryableError
    );
    
    if (!existingItem) {
      res.status(404).json({
        error: {
          code: 'STOCK_NOT_IN_WATCHLIST',
          message: `Stock ${symbol.toUpperCase()} is not in your watchlist`,
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 3.1: Remove from watchlist with retry logic
    const removed = await retryHandler.executeWithRetry(
      () => watchlistRepository.remove(requestedUserId, symbol),
      isRetryableError
    );

    if (!removed) {
      res.status(500).json({
        error: {
          code: 'REMOVAL_FAILED',
          message: 'Failed to remove stock from watchlist',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 9.2: Implement cache invalidation on data updates
    // Invalidate all cached watchlist data for this user
    await watchlistCache.invalidatePattern(`user:${requestedUserId}:*`);

    res.json({
      message: 'Stock removed from watchlist successfully',
      data: {
        symbol: symbol.toUpperCase(),
        companyName: existingItem.companyName,
        removedAt: new Date()
      },
      timestamp: new Date()
    });
  })
);

/**
 * DELETE /api/watchlist/:userId
 * Clear all stocks from the user's watchlist
 */
router.delete('/:userId',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const requestedUserId = req.params.userId;
      const authenticatedUserId = req.user!.userId;

      // Ensure users can only modify their own watchlist
      if (requestedUserId !== authenticatedUserId) {
        res.status(403).json({
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'You can only modify your own watchlist',
            timestamp: new Date()
          }
        });
        return;
      }

      // Get current watchlist count before clearing
      const currentCount = await watchlistRepository.getWatchlistCount(requestedUserId);
      
      if (currentCount === 0) {
        res.json({
          message: 'Watchlist is already empty',
          data: {
            removedCount: 0
          },
          timestamp: new Date()
        });
        return;
      }

      // Clear the watchlist
      const cleared = await watchlistRepository.clearWatchlist(requestedUserId);

      if (!cleared) {
        res.status(500).json({
          error: {
            code: 'CLEAR_FAILED',
            message: 'Failed to clear watchlist',
            timestamp: new Date()
          }
        });
        return;
      }

      // Requirement 9.2: Implement cache invalidation on data updates
      // Invalidate all cached watchlist data for this user
      await watchlistCache.invalidatePattern(`user:${requestedUserId}:*`);

      res.json({
        message: 'Watchlist cleared successfully',
        data: {
          removedCount: currentCount
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error clearing watchlist:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to clear watchlist',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * PUT /api/watchlist/:userId/:symbol
 * Update alert price for a stock in the watchlist
 * Requirements: 2.1, 3.1, 6.2, 9.2
 */
router.put('/:userId/:symbol',
  watchlistLimiter, // Requirement 6.2: Rate limiting
  authenticateToken,
  [
    body('alertPrice')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Alert price must be a positive number greater than 0')
  ],
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { userId: requestedUserId, symbol } = req.params;
    const { alertPrice } = req.body;
    const authenticatedUserId = req.user!.userId;

    // Ensure users can only modify their own watchlist
    if (requestedUserId !== authenticatedUserId) {
      res.status(403).json({
        error: {
          code: 'UNAUTHORIZED_ACCESS',
          message: 'You can only modify your own watchlist',
          timestamp: new Date()
        }
      });
      return;
    }

    if (!symbol) {
      res.status(400).json({
        error: {
          code: 'MISSING_SYMBOL',
          message: 'Stock symbol is required',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 3.1: Check if the stock exists in the watchlist with retry logic
    const existingItem = await retryHandler.executeWithRetry(
      () => watchlistRepository.findByUserIdAndSymbol(requestedUserId, symbol),
      isRetryableError
    );
    
    if (!existingItem) {
      res.status(404).json({
        error: {
          code: 'STOCK_NOT_IN_WATCHLIST',
          message: `Stock ${symbol.toUpperCase()} is not in your watchlist`,
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 3.1: Update the watchlist item with retry logic
    const updatedItem = await retryHandler.executeWithRetry(
      () => watchlistRepository.update(requestedUserId, symbol, {
        alertPrice: alertPrice ? parseFloat(alertPrice) : undefined
      }),
      isRetryableError
    );

    if (!updatedItem) {
      res.status(500).json({
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update watchlist item',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 9.2: Implement cache invalidation on data updates
    // Invalidate all cached watchlist data for this user
    await watchlistCache.invalidatePattern(`user:${requestedUserId}:*`);

    res.json({
      message: 'Watchlist item updated successfully',
      data: updatedItem,
      timestamp: new Date()
    });
  })
);

/**
 * POST /api/watchlist/bulk
 * Add multiple stocks to watchlist in a single request
 */
router.post('/bulk',
  bulkOperationsLimiter,
  authenticateToken,
  sanitizeInput,
  validateBulkWatchlistAdd(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { stocks } = req.body;
      const userId = req.user!.userId;

      // Check current watchlist count
      const currentCount = await watchlistRepository.getWatchlistCount(userId);
      
      if (currentCount + stocks.length > 50) {
        res.status(400).json({
          error: {
            code: 'WATCHLIST_LIMIT_EXCEEDED',
            message: `Adding ${stocks.length} stocks would exceed the watchlist limit of 50. Current count: ${currentCount}`,
            timestamp: new Date()
          }
        });
        return;
      }

      const results = {
        added: [] as any[],
        skipped: [] as any[],
        errors: [] as any[]
      };

      // Process each stock
      for (const stock of stocks) {
        try {
          // Check if stock already exists
          const existing = await watchlistRepository.findByUserIdAndSymbol(userId, stock.symbol);
          if (existing) {
            results.skipped.push({
              symbol: stock.symbol.toUpperCase(),
              reason: 'Already in watchlist'
            });
            continue;
          }

          // Validate symbol if market data service is available
          if (marketDataService) {
            try {
              const isValid = await marketDataService.validateSymbol(stock.symbol);
              if (!isValid) {
                results.errors.push({
                  symbol: stock.symbol.toUpperCase(),
                  reason: 'Invalid or unknown stock symbol'
                });
                continue;
              }
            } catch (validationError) {
              console.error('Symbol validation failed:', validationError);
              // Continue without validation if market data service is unavailable
            }
          }

          // Add to watchlist
          const watchlistItem = await watchlistRepository.add(userId, {
            symbol: stock.symbol.toUpperCase(),
            companyName: stock.companyName,
            alertPrice: stock.alertPrice ? parseFloat(stock.alertPrice) : undefined
          });

          results.added.push(watchlistItem);

        } catch (error) {
          console.error(`Error adding ${stock.symbol} to watchlist:`, error);
          results.errors.push({
            symbol: stock.symbol.toUpperCase(),
            reason: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Requirement 9.2: Implement cache invalidation on data updates
      // Invalidate all cached watchlist data for this user if any items were added
      if (results.added.length > 0) {
        await watchlistCache.invalidatePattern(`user:${userId}:*`);
      }

      res.status(201).json({
        message: 'Bulk watchlist operation completed',
        data: {
          summary: {
            requested: stocks.length,
            added: results.added.length,
            skipped: results.skipped.length,
            errors: results.errors.length
          },
          results
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error in bulk watchlist operation:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process bulk watchlist operation',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * GET /api/watchlist/:userId/summary
 * Get watchlist summary and statistics
 * Requirement 9.2: Cache portfolio calculations for 30 seconds
 */
router.get('/:userId/summary',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const requestedUserId = req.params.userId;
      const authenticatedUserId = req.user!.userId;

      // Ensure users can only access their own watchlist
      if (requestedUserId !== authenticatedUserId) {
        res.status(403).json({
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'You can only access your own watchlist',
            timestamp: new Date()
          }
        });
        return;
      }

      // Use CacheManager with stale-while-revalidate pattern
      // Requirement 9.2: 30s TTL for watchlist data
      const summaryData = await watchlistCache.get(
        `user:${requestedUserId}:summary`,
        async () => {
          // Get watchlist items
          const watchlistItems = await watchlistRepository.findByUserId(requestedUserId);
          const itemsWithAlerts = await watchlistRepository.findItemsWithAlerts(requestedUserId);

          // Get current market data for triggered alerts
          let triggeredAlerts: any[] = [];
          
          if (marketDataService && itemsWithAlerts.length > 0) {
            try {
              const symbols = itemsWithAlerts.map(item => item.symbol);
              const quotes = await marketDataService.getBatchQuotes(symbols);
              const quoteMap = new Map(quotes.map(quote => [quote.symbol, quote]));
              
              triggeredAlerts = itemsWithAlerts.filter(item => {
                const quote = quoteMap.get(item.symbol);
                return quote && item.alertPrice && quote.currentPrice <= item.alertPrice;
              }).map(item => {
                const quote = quoteMap.get(item.symbol);
                return {
                  ...item,
                  currentPrice: quote?.currentPrice,
                  change: quote?.change,
                  changePercent: quote?.changePercent
                };
              });
            } catch (marketDataError) {
              console.error('Failed to fetch market data for alerts:', marketDataError);
            }
          }

          return {
            totalItems: watchlistItems.length,
            itemsWithAlerts: itemsWithAlerts.length,
            triggeredAlerts: triggeredAlerts.length,
            remainingSlots: 50 - watchlistItems.length,
            alerts: triggeredAlerts
          };
        },
        { ttl: 30, staleWhileRevalidate: 15 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=15');

      res.json({
        message: 'Watchlist summary retrieved successfully',
        data: summaryData,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving watchlist summary:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve watchlist summary',
          timestamp: new Date()
        }
      });
    }
  }
);

export default router;