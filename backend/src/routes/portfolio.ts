import { Router, Response } from 'express';
import { body, query } from 'express-validator';
import { PortfolioRepository } from '../repositories/PortfolioRepository';
import { authenticateToken, AuthenticatedRequest } from '../utils/auth';
import { MarketDataService, createMarketDataService } from '../services/MarketDataService';
import { PortfolioCalculations } from '../models/calculations';
import { StockPosition, PortfolioSummary, PortfolioFilters, BulkPositionOperation } from '../models/Portfolio';
import { PerformanceService, TimeRange } from '../services/PerformanceService';
import {
  validateStockSymbol,
  validateFinancialAmount,
  validateQuantity,
  validateDate,
  validateCompanyName,
  validateUserId,
  validateUUID,
  validateTimeRange,
  validateBulkOperation,
  handleValidationErrors,
  sanitizeInput
} from '../middleware/validation';
import { portfolioLimiter, bulkOperationsLimiter } from '../middleware/rateLimiter';
import { getTimeoutHandler } from '../middleware/timeoutHandler';
import { PayloadValidator } from '../middleware/payloadValidator';
import { portfolioCache, marketDataCache } from '../utils/cacheManager';
import { asyncHandler, ErrorHandler } from '../utils/errorHandler';
import { RetryHandler, isRetryableError } from '../utils/retryHandler';

/**
 * NOTE: Timeout handling is automatically applied via global middleware in server.ts
 * 
 * Portfolio routes have an 8-second timeout configured (see ENDPOINT_TIMEOUT_CONFIGS)
 * 
 * To use timeout protection in routes:
 * 1. Get timeout handler: const timeoutHandler = getTimeoutHandler(req);
 * 2. Check remaining time: timeoutHandler?.getRemainingTime()
 * 3. Check if approaching timeout: timeoutHandler?.isApproachingTimeout()
 * 4. Wrap async operations: timeoutHandler?.wrapWithTimeout(fn, fallback)
 * 
 * See backend/src/middleware/TIMEOUT_USAGE_EXAMPLES.md for detailed examples
 */

const router = Router();
const portfolioRepository = new PortfolioRepository();
let marketDataService: MarketDataService;
let performanceService: PerformanceService;

// Initialize retry handler for portfolio operations
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
  performanceService = new PerformanceService(portfolioRepository, marketDataService);
} catch (error) {
  console.error('Failed to initialize market data service:', error);
}

/**
 * GET /api/portfolio/:userId
 * Retrieve complete portfolio with current market data and calculations
 * Supports pagination via ?page=0&limit=100 query parameters
 * Requirements:
 * - 1.1: Timeout handling (8s limit)
 * - 2.1: Payload validation and pagination
 * - 3.1: Retry logic with exponential backoff
 * - 6.2: Rate limiting (100 req/min per user)
 * - 9.2: Cache portfolio calculations for 30 seconds
 */
router.get('/:userId',
  portfolioLimiter, // Requirement 6.2: Rate limiting
  authenticateToken,
  sanitizeInput,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestedUserId = req.params.userId;
    const authenticatedUserId = req.user!.userId;

    // Ensure users can only access their own portfolio
    if (requestedUserId !== authenticatedUserId) {
      res.status(403).json({
        error: {
          code: 'UNAUTHORIZED_ACCESS',
          message: 'You can only access your own portfolio',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 1.1: Get timeout handler for timeout protection
    const timeoutHandler = getTimeoutHandler(req);

    // Requirement 2.1: Get pagination parameters with payload validation
    const { page, limit } = PayloadValidator.getPaginationParams(req);

    // Use CacheManager with stale-while-revalidate pattern
    // Requirement 9.2: 30s TTL for portfolio data
    // Requirement 9.3: Implement stale-while-revalidate caching pattern
    const portfolioData = await portfolioCache.get(
      `user:${requestedUserId}:portfolio:page:${page}:limit:${limit}`,
      async () => {
        // Requirement 1.1: Check timeout before expensive operations
        if (timeoutHandler?.checkTimeout()) {
          throw new Error('Timeout approaching, returning cached data');
        }
        
        // Requirement 3.1: Get user's portfolios with retry logic
        const portfolios = await retryHandler.executeWithRetry(
          () => portfolioRepository.findByUserId(requestedUserId),
          isRetryableError
        );
        
        if (portfolios.length === 0) {
            return {
              portfolio: null,
              summary: {
                totalValue: 0,
                totalGainLoss: 0,
                totalGainLossPercent: 0,
                positionCount: 0,
                topPerformers: [],
                worstPerformers: []
              },
              performance: {
                totalValue: 0,
                totalCostBasis: 0,
                totalGainLoss: 0,
                totalGainLossPercent: 0,
                positionCount: 0
              },
              pagination: {
                page: 0,
                limit,
                total: 0,
                totalPages: 0,
                hasMore: false,
                hasPrevious: false
              }
            };
          }

          // Use the first portfolio (default portfolio)
          const portfolio = portfolios[0];
          
          if (!portfolio || !portfolio.positions || portfolio.positions.length === 0) {
            return {
              portfolio: {
                ...portfolio,
                totalValue: 0,
                totalGainLoss: 0,
                totalGainLossPercent: 0
              },
              summary: {
                totalValue: 0,
                totalGainLoss: 0,
                totalGainLossPercent: 0,
                positionCount: 0,
                topPerformers: [],
                worstPerformers: []
              },
              performance: {
                totalValue: 0,
                totalCostBasis: 0,
                totalGainLoss: 0,
                totalGainLossPercent: 0,
                positionCount: 0
              },
              pagination: {
                page: 0,
                limit,
                total: 0,
                totalPages: 0,
                hasMore: false,
                hasPrevious: false
              }
            };
          }

          // Get current market data for all positions
          const symbols = portfolio.positions!.map(pos => pos.symbol);
          let updatedPositions: StockPosition[] = [];
          
          if (marketDataService) {
            try {
              // Requirement 1.1: Wrap external API call with timeout protection
              // Requirement 3.1: Add retry logic for market data fetching
              const quotes = await retryHandler.executeWithRetry(
                async () => {
                  if (timeoutHandler?.isApproachingTimeout()) {
                    throw new Error('Timeout approaching, skipping market data fetch');
                  }
                  return await marketDataService.getBatchQuotes(symbols);
                },
                isRetryableError
              );
              const quoteMap = new Map(quotes.map(quote => [quote.symbol, quote]));
              
              // Update positions with current market data
              updatedPositions = portfolio.positions!.map(position => {
                const quote = quoteMap.get(position.symbol);
                if (quote) {
                  return PortfolioCalculations.updatePositionWithMarketData(position, quote);
                }
                // If no market data available, return position with calculated values based on average cost
                return {
                  ...position,
                  currentPrice: position.averageCost,
                  marketValue: PortfolioCalculations.calculateMarketValue(position, position.averageCost),
                  gainLoss: 0,
                  gainLossPercent: 0
                };
              });
            } catch (marketDataError) {
              console.error('Failed to fetch market data:', marketDataError);
              // Fallback: use average cost as current price
              updatedPositions = portfolio.positions!.map(position => ({
                ...position,
                currentPrice: position.averageCost,
                marketValue: PortfolioCalculations.calculateMarketValue(position, position.averageCost),
                gainLoss: 0,
                gainLossPercent: 0
              }));
            }
          } else {
            // Fallback: use average cost as current price
            updatedPositions = portfolio.positions!.map(position => ({
              ...position,
              currentPrice: position.averageCost,
              marketValue: PortfolioCalculations.calculateMarketValue(position, position.averageCost),
              gainLoss: 0,
              gainLossPercent: 0
            }));
          }

          // Calculate portfolio totals (using all positions, not paginated)
          const totals = PortfolioCalculations.calculatePortfolioTotals(updatedPositions);
          
          // Generate portfolio summary (using all positions)
          const summary = PortfolioCalculations.generatePortfolioSummary(updatedPositions);
          
          // Calculate position allocations
          const positionsWithAllocations = PortfolioCalculations.calculatePositionAllocations(updatedPositions);

          // Apply pagination to positions
          const validator = new PayloadValidator();
          const paginatedPositions = validator.paginateResponse(positionsWithAllocations, page, limit);

          // Update portfolio with calculated values and paginated positions
          const updatedPortfolio = {
            ...portfolio,
            positions: paginatedPositions.data,
            totalValue: totals.totalValue,
            totalGainLoss: totals.totalGainLoss,
            totalGainLossPercent: totals.totalGainLossPercent
          };

          return {
            portfolio: updatedPortfolio,
            summary,
            performance: {
              totalValue: totals.totalValue,
              totalCostBasis: totals.totalCostBasis,
              totalGainLoss: totals.totalGainLoss,
              totalGainLossPercent: totals.totalGainLossPercent,
              positionCount: updatedPositions.length
            },
            pagination: paginatedPositions.pagination
          };
        },
        { ttl: 30, staleWhileRevalidate: 15 }
      );

    // Requirement 9.5: Set appropriate cache-control headers
    res.setHeader('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=15');

    // Requirement 2.1: Validate response payload size
    const validator = new PayloadValidator();
    const responseData = {
      message: 'Portfolio retrieved successfully',
      data: portfolioData,
      timestamp: new Date()
    };
    
    const validationResult = validator.validateResponse(responseData);
    if (!validationResult.valid) {
      console.warn('Response payload too large, data already paginated');
    }

    res.json(responseData);
  })
);

/**
 * Validation rules for creating a stock position
 */
const validateCreatePosition = [
  validateStockSymbol(),
  validateCompanyName(),
  validateQuantity(),
  validateFinancialAmount('averageCost'),
  validateDate('purchaseDate', false)
];

/**
 * Validation rules for updating a stock position
 */
const validateUpdatePosition = [
  body('quantity')
    .optional()
    .isFloat({ min: 0.000001, max: 999999999 })
    .withMessage('Quantity must be between 0.000001 and 999,999,999')
    .custom((value: number) => {
      if (value !== undefined) {
        const decimalPlaces = (value.toString().split('.')[1] || '').length;
        if (decimalPlaces > 6) {
          throw new Error('Quantity can have at most 6 decimal places');
        }
      }
      return true;
    }),
  body('averageCost')
    .optional()
    .isFloat({ min: 0.01, max: 999999999.99 })
    .withMessage('Average cost must be between 0.01 and 999,999,999.99')
    .custom((value: number) => {
      if (value !== undefined) {
        const decimalPlaces = (value.toString().split('.')[1] || '').length;
        if (decimalPlaces > 2) {
          throw new Error('Average cost can have at most 2 decimal places');
        }
      }
      return true;
    }),
  body('purchaseDate')
    .optional()
    .isISO8601()
    .withMessage('Purchase date must be a valid ISO 8601 date')
    .custom((value: string) => {
      if (value) {
        const date = new Date(value);
        const now = new Date();
        if (date > now) {
          throw new Error('Purchase date cannot be in the future');
        }
      }
      return true;
    })
];

/**
 * POST /api/portfolio/position
 * Add a new stock position to the user's portfolio
 * Requirements:
 * - 1.1: Timeout handling
 * - 2.1: Payload validation
 * - 3.1: Retry logic
 * - 6.2: Rate limiting
 * - 9.2: Cache invalidation
 */
router.post('/position', 
  portfolioLimiter, // Requirement 6.2: Rate limiting
  authenticateToken,
  sanitizeInput,
  validateCreatePosition,
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { symbol, companyName, quantity, averageCost, purchaseDate } = req.body;
    const userId = req.user!.userId;

    // Requirement 1.1: Get timeout handler
    const timeoutHandler = getTimeoutHandler(req);

    // Requirement 3.1: Get or create user's default portfolio with retry logic
    let portfolios = await retryHandler.executeWithRetry(
      () => portfolioRepository.findByUserId(userId),
      isRetryableError
    );
    let portfolio;

    if (portfolios.length === 0) {
      // Create default portfolio if user doesn't have one
      portfolio = await retryHandler.executeWithRetry(
        () => portfolioRepository.create(userId, { name: 'My Portfolio' }),
        isRetryableError
      );
    } else {
      // Use the first portfolio (default)
      portfolio = portfolios[0];
    }

    // Check if position with same symbol already exists in portfolio
    const existingPositions = await retryHandler.executeWithRetry(
      () => portfolioRepository.findPositionsByPortfolioId(portfolio!.id),
      isRetryableError
    );
    const existingPosition = existingPositions.find(pos => pos.symbol.toUpperCase() === symbol.toUpperCase());

    if (existingPosition) {
      res.status(409).json({
        error: {
          code: 'POSITION_EXISTS',
          message: `Position for ${symbol.toUpperCase()} already exists in portfolio. Use PUT to update existing position.`,
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 1.1: Check timeout before adding position
    if (timeoutHandler?.checkTimeout()) {
      res.status(504).json({
        error: {
          code: 'TIMEOUT_ERROR',
          message: 'Request timeout while adding position',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 3.1: Add the new position with retry logic
    const newPosition = await retryHandler.executeWithRetry(
      () => portfolioRepository.addPosition(portfolio!.id, {
        symbol: symbol.toUpperCase(),
        companyName,
        quantity: parseFloat(quantity),
        averageCost: parseFloat(averageCost),
        purchaseDate
      }),
      isRetryableError
    );

    // Requirement 9.2: Implement cache invalidation on data updates
    // Invalidate all cached portfolio data for this user
    await portfolioCache.invalidatePattern(`user:${userId}:portfolio:*`);

    res.status(201).json({
      message: 'Stock position added successfully',
      data: newPosition,
      timestamp: new Date()
    });
  })
);

/**
 * PUT /api/portfolio/position/:id
 * Update an existing stock position
 * Requirements: 1.1, 2.1, 3.1, 6.2, 9.2
 */
router.put('/position/:id',
  portfolioLimiter, // Requirement 6.2: Rate limiting
  authenticateToken,
  sanitizeInput,
  validateUpdatePosition,
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const positionId = req.params.id;
    const userId = req.user!.userId;
    const updateData = req.body;

    if (!positionId) {
      res.status(400).json({
        error: {
          code: 'MISSING_POSITION_ID',
          message: 'Position ID is required',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 3.1: Verify the position exists and belongs to the user with retry logic
    const existingPosition = await retryHandler.executeWithRetry(
      () => portfolioRepository.findPositionById(positionId),
      isRetryableError
    );
    
    if (!existingPosition) {
      res.status(404).json({
        error: {
          code: 'POSITION_NOT_FOUND',
          message: 'Stock position not found',
          timestamp: new Date()
        }
      });
      return;
    }

    // Verify the position belongs to the user's portfolio
    const portfolio = await retryHandler.executeWithRetry(
      () => portfolioRepository.findById(existingPosition.portfolioId),
      isRetryableError
    );
    
    if (!portfolio || portfolio.userId !== userId) {
      res.status(403).json({
        error: {
          code: 'UNAUTHORIZED_ACCESS',
          message: 'You do not have permission to update this position',
          timestamp: new Date()
        }
      });
      return;
    }

    // Update the position
    const updateRequest: any = {};
    if (updateData.quantity !== undefined) {
      updateRequest.quantity = parseFloat(updateData.quantity);
    }
    if (updateData.averageCost !== undefined) {
      updateRequest.averageCost = parseFloat(updateData.averageCost);
    }
    if (updateData.purchaseDate !== undefined) {
      updateRequest.purchaseDate = updateData.purchaseDate;
    }

    // Requirement 3.1: Update with retry logic
    const updatedPosition = await retryHandler.executeWithRetry(
      () => portfolioRepository.updatePosition(positionId, updateRequest),
      isRetryableError
    );

    if (!updatedPosition) {
      res.status(500).json({
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update stock position',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 9.2: Implement cache invalidation on data updates
    // Invalidate all cached portfolio data for this user
    await portfolioCache.invalidatePattern(`user:${userId}:portfolio:*`);

    res.json({
      message: 'Stock position updated successfully',
      data: updatedPosition,
      timestamp: new Date()
    });
  })
);

/**
 * DELETE /api/portfolio/position/:id
 * Remove a stock position from the portfolio
 * Requirements: 1.1, 3.1, 6.2, 9.2
 */
router.delete('/position/:id',
  portfolioLimiter, // Requirement 6.2: Rate limiting
  authenticateToken,
  sanitizeInput,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const positionId = req.params.id;
    const userId = req.user!.userId;

    if (!positionId) {
      res.status(400).json({
        error: {
          code: 'MISSING_POSITION_ID',
          message: 'Position ID is required',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 3.1: Verify the position exists and belongs to the user with retry logic
    const existingPosition = await retryHandler.executeWithRetry(
      () => portfolioRepository.findPositionById(positionId),
      isRetryableError
    );
    
    if (!existingPosition) {
      res.status(404).json({
        error: {
          code: 'POSITION_NOT_FOUND',
          message: 'Stock position not found',
          timestamp: new Date()
        }
      });
      return;
    }

    // Verify the position belongs to the user's portfolio
    const portfolio = await retryHandler.executeWithRetry(
      () => portfolioRepository.findById(existingPosition.portfolioId),
      isRetryableError
    );
    
    if (!portfolio || portfolio.userId !== userId) {
      res.status(403).json({
        error: {
          code: 'UNAUTHORIZED_ACCESS',
          message: 'You do not have permission to delete this position',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 3.1: Remove the position with retry logic
    const deleted = await retryHandler.executeWithRetry(
      () => portfolioRepository.removePosition(positionId),
      isRetryableError
    );

    if (!deleted) {
      res.status(500).json({
        error: {
          code: 'DELETE_FAILED',
          message: 'Failed to delete stock position',
          timestamp: new Date()
        }
      });
      return;
    }

    // Requirement 9.2: Implement cache invalidation on data updates
    // Invalidate all cached portfolio data for this user
    await portfolioCache.invalidatePattern(`user:${userId}:portfolio:*`);

    res.json({
      message: 'Stock position removed successfully',
      data: {
        id: positionId,
        symbol: existingPosition.symbol,
        deletedAt: new Date()
      },
      timestamp: new Date()
    });
  })
);

/**
 * GET /api/portfolio/:userId/history
 * Get transaction history for user's portfolio
 * Supports pagination via ?page=0&limit=100 query parameters
 * Requirement 9.2: Cache portfolio calculations for 30 seconds
 */
router.get('/:userId/history',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const requestedUserId = req.params.userId;
      const authenticatedUserId = req.user!.userId;

      // Ensure users can only access their own transaction history
      if (requestedUserId !== authenticatedUserId) {
        res.status(403).json({
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'You can only access your own transaction history',
            timestamp: new Date()
          }
        });
        return;
      }

      // Get pagination parameters (default limit to 50 for history)
      const { page, limit: requestedLimit } = PayloadValidator.getPaginationParams(req);
      const limit = requestedLimit || 50;

      // Use CacheManager with stale-while-revalidate pattern
      // Requirement 9.2: 30s TTL for portfolio data
      const historyData = await portfolioCache.get(
        `user:${requestedUserId}:history:page:${page}:limit:${limit}`,
        async () => {
          // Get user's portfolios
          const portfolios = await portfolioRepository.findByUserId(requestedUserId);
          
          if (portfolios.length === 0) {
            return {
              data: [],
              pagination: {
                page: 0,
                limit,
                total: 0,
                totalPages: 0,
                hasMore: false,
                hasPrevious: false
              }
            };
          }

          // Get transaction history for the first portfolio (default portfolio)
          const portfolio = portfolios[0];
          if (!portfolio) {
            return {
              data: [],
              pagination: {
                page: 0,
                limit,
                total: 0,
                totalPages: 0,
                hasMore: false,
                hasPrevious: false
              }
            };
          }
          
          // Get all history first to properly paginate
          const allHistory = await portfolioRepository.getTransactionHistory(portfolio.id, 10000);
          
          // Apply pagination
          const validator = new PayloadValidator();
          const paginatedResult = validator.paginateResponse(allHistory, page, limit);

          return {
            data: paginatedResult.data,
            pagination: paginatedResult.pagination
          };
        },
        { ttl: 30, staleWhileRevalidate: 15 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=15');

      res.json({
        message: 'Transaction history retrieved successfully',
        data: historyData.data,
        pagination: historyData.pagination,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving transaction history:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve transaction history',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * GET /api/portfolio/:userId/positions/filtered
 * Get filtered and sorted positions
 * Supports pagination via ?page=0&limit=100 query parameters
 * Requirement 9.2: Cache portfolio calculations for 30 seconds
 */
router.get('/:userId/positions/filtered',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const requestedUserId = req.params.userId;
      const authenticatedUserId = req.user!.userId;

      // Ensure users can only access their own portfolio
      if (requestedUserId !== authenticatedUserId) {
        res.status(403).json({
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'You can only access your own portfolio',
            timestamp: new Date()
          }
        });
        return;
      }

      // Get pagination parameters
      const { page, limit } = PayloadValidator.getPaginationParams(req);

      // Parse filters from query parameters
      const filters: PortfolioFilters = {};
      
      if (req.query.symbols) {
        filters.symbols = (req.query.symbols as string).split(',');
      }
      if (req.query.minValue) {
        filters.minValue = parseFloat(req.query.minValue as string);
      }
      if (req.query.maxValue) {
        filters.maxValue = parseFloat(req.query.maxValue as string);
      }
      if (req.query.gainersOnly === 'true') {
        filters.gainersOnly = true;
      }
      if (req.query.losersOnly === 'true') {
        filters.losersOnly = true;
      }
      if (req.query.sortBy) {
        filters.sortBy = req.query.sortBy as any;
      }
      if (req.query.sortOrder) {
        filters.sortOrder = req.query.sortOrder as any;
      }

      // Create cache key based on filters
      const filterKey = JSON.stringify(filters);
      
      // Use CacheManager with stale-while-revalidate pattern
      // Requirement 9.2: 30s TTL for portfolio data
      const filteredData = await portfolioCache.get(
        `user:${requestedUserId}:filtered:${filterKey}:page:${page}:limit:${limit}`,
        async () => {
          // Get user's portfolios
          const portfolios = await portfolioRepository.findByUserId(requestedUserId);
          
          if (portfolios.length === 0) {
            return {
              data: [],
              pagination: {
                page: 0,
                limit,
                total: 0,
                totalPages: 0,
                hasMore: false,
                hasPrevious: false
              }
            };
          }

          // Get filtered positions for the first portfolio (default portfolio)
          const portfolio = portfolios[0];
          if (!portfolio) {
            return {
              data: [],
              pagination: {
                page: 0,
                limit,
                total: 0,
                totalPages: 0,
                hasMore: false,
                hasPrevious: false
              }
            };
          }
          const positions = await portfolioRepository.findPositionsWithFilters(portfolio.id, filters);

          // Apply market data and additional filtering if needed
          let filteredPositions = positions;
          
          if (marketDataService && (filters.gainersOnly || filters.losersOnly || filters.minValue || filters.maxValue)) {
            try {
              const symbols = positions.map(pos => pos.symbol);
              const quotes = await marketDataService.getBatchQuotes(symbols);
              const quoteMap = new Map(quotes.map(quote => [quote.symbol, quote]));
              
              // Update positions with current market data
              const updatedPositions = positions.map(position => {
                const quote = quoteMap.get(position.symbol);
                if (quote) {
                  return PortfolioCalculations.updatePositionWithMarketData(position, quote);
                }
                return {
                  ...position,
                  currentPrice: position.averageCost,
                  marketValue: PortfolioCalculations.calculateMarketValue(position, position.averageCost),
                  gainLoss: 0,
                  gainLossPercent: 0
                };
              });

              // Apply gain/loss and value filters
              filteredPositions = updatedPositions.filter(position => {
                if (filters.gainersOnly && (position.gainLoss || 0) <= 0) return false;
                if (filters.losersOnly && (position.gainLoss || 0) >= 0) return false;
                if (filters.minValue && (position.marketValue || 0) < filters.minValue) return false;
                if (filters.maxValue && (position.marketValue || 0) > filters.maxValue) return false;
                return true;
              });
            } catch (marketDataError) {
              console.error('Failed to fetch market data for filtering:', marketDataError);
              // Continue with basic filtering without market data
            }
          }

          // Apply pagination
          const validator = new PayloadValidator();
          const paginatedResult = validator.paginateResponse(filteredPositions, page, limit);

          return {
            data: paginatedResult.data,
            pagination: paginatedResult.pagination
          };
        },
        { ttl: 30, staleWhileRevalidate: 15 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=15');

      res.json({
        message: 'Filtered positions retrieved successfully',
        data: filteredData.data,
        pagination: filteredData.pagination,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving filtered positions:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve filtered positions',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * POST /api/portfolio/bulk-operations
 * Perform bulk operations on multiple positions
 */
router.post('/bulk-operations',
  bulkOperationsLimiter,
  authenticateToken,
  sanitizeInput,
  validateBulkOperation(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { operation, positionIds, updateData } = req.body;
      const userId = req.user!.userId;

      // Verify all positions belong to the user
      for (const positionId of positionIds) {
        const position = await portfolioRepository.findPositionById(positionId);
        if (!position) {
          res.status(404).json({
            error: {
              code: 'POSITION_NOT_FOUND',
              message: `Position ${positionId} not found`,
              timestamp: new Date()
            }
          });
          return;
        }

        const portfolio = await portfolioRepository.findById(position.portfolioId);
        if (!portfolio || portfolio.userId !== userId) {
          res.status(403).json({
            error: {
              code: 'UNAUTHORIZED_ACCESS',
              message: 'You do not have permission to modify these positions',
              timestamp: new Date()
            }
          });
          return;
        }
      }

      let result;
      if (operation === 'delete') {
        result = await portfolioRepository.bulkDeletePositions(positionIds);
      } else if (operation === 'update') {
        if (!updateData) {
          res.status(400).json({
            error: {
              code: 'MISSING_UPDATE_DATA',
              message: 'Update data is required for update operation',
              timestamp: new Date()
            }
          });
          return;
        }
        result = await portfolioRepository.bulkUpdatePositions(positionIds, updateData);
      }

      // Requirement 9.2: Implement cache invalidation on data updates
      // Invalidate all cached portfolio data for this user
      await portfolioCache.invalidatePattern(`user:${userId}:portfolio:*`);

      res.json({
        message: `Bulk ${operation} operation completed`,
        data: result,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error performing bulk operation:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to perform bulk operation',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * GET /api/portfolio/:userId/performance/history
 * Get portfolio performance history for a given time range
 * Requirement 9.2: Cache portfolio calculations for 30 seconds
 */
router.get('/:userId/performance/history',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const requestedUserId = req.params.userId;
      const authenticatedUserId = req.user!.userId;
      const timeRange = (req.query.timeRange as TimeRange) || '1M';

      // Ensure users can only access their own performance data
      if (requestedUserId !== authenticatedUserId) {
        res.status(403).json({
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'You can only access your own performance data',
            timestamp: new Date()
          }
        });
        return;
      }

      if (!performanceService) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Performance service is not available',
            timestamp: new Date()
          }
        });
        return;
      }

      // Use CacheManager with stale-while-revalidate pattern
      // Requirement 9.2: 30s TTL for portfolio data
      const performanceData = await portfolioCache.get(
        `user:${requestedUserId}:performance:${timeRange}`,
        async () => await performanceService.getPortfolioPerformance(requestedUserId, timeRange),
        { ttl: 30, staleWhileRevalidate: 15 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=15');

      res.json({
        message: 'Portfolio performance retrieved successfully',
        data: performanceData,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving portfolio performance:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve portfolio performance',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * GET /api/portfolio/stock/:symbol/performance
 * Get individual stock performance history
 * Requirement 9.1: Cache market data responses for 60 seconds
 */
router.get('/stock/:symbol/performance',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const symbol = req.params.symbol?.toUpperCase();
      if (!symbol) {
        res.status(400).json({
          error: {
            code: 'MISSING_SYMBOL',
            message: 'Symbol parameter is required',
            timestamp: new Date()
          }
        });
        return;
      }
      const timeRange = (req.query.timeRange as TimeRange) || '1M';

      if (!performanceService) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Performance service is not available',
            timestamp: new Date()
          }
        });
        return;
      }

      // Use marketDataCache since this is stock-specific, not user-specific
      // Requirement 9.1: 60s TTL for market data
      const performanceData = await marketDataCache.get(
        `stock:${symbol}:performance:${timeRange}`,
        async () => await performanceService.getStockPerformance(symbol, timeRange),
        { ttl: 60, staleWhileRevalidate: 30 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');

      res.json({
        message: 'Stock performance retrieved successfully',
        data: performanceData,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving stock performance:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve stock performance',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * GET /api/portfolio/:userId/performance/comparison
 * Get portfolio vs market index comparison
 * Requirement 9.2: Cache portfolio calculations for 30 seconds
 */
router.get('/:userId/performance/comparison',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const requestedUserId = req.params.userId;
      const authenticatedUserId = req.user!.userId;
      const timeRange = (req.query.timeRange as TimeRange) || '1M';
      const indexSymbol = (req.query.indexSymbol as string) || 'SPY';

      // Ensure users can only access their own performance data
      if (requestedUserId !== authenticatedUserId) {
        res.status(403).json({
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'You can only access your own performance data',
            timestamp: new Date()
          }
        });
        return;
      }

      if (!performanceService) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Performance service is not available',
            timestamp: new Date()
          }
        });
        return;
      }

      // Use CacheManager with stale-while-revalidate pattern
      // Requirement 9.2: 30s TTL for portfolio data
      const comparisonData = await portfolioCache.get(
        `user:${requestedUserId}:comparison:${timeRange}:${indexSymbol}`,
        async () => await performanceService.getPerformanceComparison(requestedUserId, timeRange, indexSymbol),
        { ttl: 30, staleWhileRevalidate: 15 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=15');

      res.json({
        message: 'Performance comparison retrieved successfully',
        data: comparisonData,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving performance comparison:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve performance comparison',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * GET /api/portfolio/:userId/performance/metrics
 * Get detailed performance metrics
 * Requirement 9.2: Cache portfolio calculations for 30 seconds
 */
router.get('/:userId/performance/metrics',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const requestedUserId = req.params.userId;
      const authenticatedUserId = req.user!.userId;
      const timeRange = (req.query.timeRange as TimeRange) || '1M';

      // Ensure users can only access their own performance data
      if (requestedUserId !== authenticatedUserId) {
        res.status(403).json({
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: 'You can only access your own performance data',
            timestamp: new Date()
          }
        });
        return;
      }

      if (!performanceService) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Performance service is not available',
            timestamp: new Date()
          }
        });
        return;
      }

      // Use CacheManager with stale-while-revalidate pattern
      // Requirement 9.2: 30s TTL for portfolio data
      const metricsData = await portfolioCache.get(
        `user:${requestedUserId}:metrics:${timeRange}`,
        async () => await performanceService.getPerformanceMetrics(requestedUserId, timeRange),
        { ttl: 30, staleWhileRevalidate: 15 }
      );

      // Requirement 9.5: Set appropriate cache-control headers
      res.setHeader('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=15');

      res.json({
        message: 'Performance metrics retrieved successfully',
        data: metricsData,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving performance metrics:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve performance metrics',
          timestamp: new Date()
        }
      });
    }
  }
);

export default router;
