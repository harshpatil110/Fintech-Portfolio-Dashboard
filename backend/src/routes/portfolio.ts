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
 */
router.get('/:userId',
  portfolioLimiter,
  authenticateToken,
  sanitizeInput,
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

      // Get user's portfolios
      const portfolios = await portfolioRepository.findByUserId(requestedUserId);
      
      if (portfolios.length === 0) {
        res.json({
          message: 'Portfolio retrieved successfully',
          data: {
            portfolio: null,
            summary: {
              totalValue: 0,
              totalGainLoss: 0,
              totalGainLossPercent: 0,
              positionCount: 0,
              topPerformers: [],
              worstPerformers: []
            }
          },
          timestamp: new Date()
        });
        return;
      }

      // Use the first portfolio (default portfolio)
      const portfolio = portfolios[0];
      
      if (!portfolio || !portfolio.positions || portfolio.positions.length === 0) {
        res.json({
          message: 'Portfolio retrieved successfully',
          data: {
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
            }
          },
          timestamp: new Date()
        });
        return;
      }

      // Get current market data for all positions
      const symbols = portfolio.positions!.map(pos => pos.symbol);
      let updatedPositions: StockPosition[] = [];
      
      if (marketDataService) {
        try {
          const quotes = await marketDataService.getBatchQuotes(symbols);
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

      res.json({
        message: 'Portfolio retrieved successfully',
        data: {
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
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving portfolio:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve portfolio',
          timestamp: new Date()
        }
      });
    }
  }
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
 */
router.post('/position', 
  portfolioLimiter,
  authenticateToken,
  sanitizeInput,
  validateCreatePosition,
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { symbol, companyName, quantity, averageCost, purchaseDate } = req.body;
      const userId = req.user!.userId;

      // Get or create user's default portfolio
      let portfolios = await portfolioRepository.findByUserId(userId);
      let portfolio;

      if (portfolios.length === 0) {
        // Create default portfolio if user doesn't have one
        portfolio = await portfolioRepository.create(userId, { name: 'My Portfolio' });
      } else {
        // Use the first portfolio (default)
        portfolio = portfolios[0];
      }

      // Check if position with same symbol already exists in portfolio
      const existingPositions = await portfolioRepository.findPositionsByPortfolioId(portfolio!.id);
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

      // Add the new position
      const newPosition = await portfolioRepository.addPosition(portfolio!.id, {
        symbol: symbol.toUpperCase(),
        companyName,
        quantity: parseFloat(quantity),
        averageCost: parseFloat(averageCost),
        purchaseDate
      });

      res.status(201).json({
        message: 'Stock position added successfully',
        data: newPosition,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error adding stock position:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to add stock position',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * PUT /api/portfolio/position/:id
 * Update an existing stock position
 */
router.put('/position/:id',
  portfolioLimiter,
  authenticateToken,
  sanitizeInput,
  validateUpdatePosition,
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
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

      // Verify the position exists and belongs to the user
      const existingPosition = await portfolioRepository.findPositionById(positionId);
      
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
      const portfolio = await portfolioRepository.findById(existingPosition.portfolioId);
      
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

      const updatedPosition = await portfolioRepository.updatePosition(positionId, updateRequest);

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

      res.json({
        message: 'Stock position updated successfully',
        data: updatedPosition,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error updating stock position:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update stock position',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * DELETE /api/portfolio/position/:id
 * Remove a stock position from the portfolio
 */
router.delete('/position/:id',
  portfolioLimiter,
  authenticateToken,
  sanitizeInput,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
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

      // Verify the position exists and belongs to the user
      const existingPosition = await portfolioRepository.findPositionById(positionId);
      
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
      const portfolio = await portfolioRepository.findById(existingPosition.portfolioId);
      
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

      // Remove the position
      const deleted = await portfolioRepository.removePosition(positionId);

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

      res.json({
        message: 'Stock position removed successfully',
        data: {
          id: positionId,
          symbol: existingPosition.symbol,
          deletedAt: new Date()
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error removing stock position:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to remove stock position',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * GET /api/portfolio/:userId/history
 * Get transaction history for user's portfolio
 * Supports pagination via ?page=0&limit=100 query parameters
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

      // Get user's portfolios
      const portfolios = await portfolioRepository.findByUserId(requestedUserId);
      
      if (portfolios.length === 0) {
        res.json({
          message: 'Transaction history retrieved successfully',
          data: [],
          pagination: {
            page: 0,
            limit,
            total: 0,
            totalPages: 0,
            hasMore: false,
            hasPrevious: false
          },
          timestamp: new Date()
        });
        return;
      }

      // Get transaction history for the first portfolio (default portfolio)
      const portfolio = portfolios[0];
      if (!portfolio) {
        res.json({
          message: 'Transaction history retrieved successfully',
          data: [],
          pagination: {
            page: 0,
            limit,
            total: 0,
            totalPages: 0,
            hasMore: false,
            hasPrevious: false
          },
          timestamp: new Date()
        });
        return;
      }
      
      // Get all history first to properly paginate
      const allHistory = await portfolioRepository.getTransactionHistory(portfolio.id, 10000); // Get large set
      
      // Apply pagination
      const validator = new PayloadValidator();
      const paginatedResult = validator.paginateResponse(allHistory, page, limit);

      res.json({
        message: 'Transaction history retrieved successfully',
        data: paginatedResult.data,
        pagination: paginatedResult.pagination,
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

      // Get user's portfolios
      const portfolios = await portfolioRepository.findByUserId(requestedUserId);
      
      if (portfolios.length === 0) {
        res.json({
          message: 'Filtered positions retrieved successfully',
          data: [],
          pagination: {
            page: 0,
            limit,
            total: 0,
            totalPages: 0,
            hasMore: false,
            hasPrevious: false
          },
          timestamp: new Date()
        });
        return;
      }

      // Get filtered positions for the first portfolio (default portfolio)
      const portfolio = portfolios[0];
      if (!portfolio) {
        res.json({
          message: 'Filtered positions retrieved successfully',
          data: [],
          pagination: {
            page: 0,
            limit,
            total: 0,
            totalPages: 0,
            hasMore: false,
            hasPrevious: false
          },
          timestamp: new Date()
        });
        return;
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

      res.json({
        message: 'Filtered positions retrieved successfully',
        data: paginatedResult.data,
        pagination: paginatedResult.pagination,
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

      const performanceData = await performanceService.getPortfolioPerformance(
        requestedUserId,
        timeRange
      );

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

      const performanceData = await performanceService.getStockPerformance(
        symbol,
        timeRange
      );

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

      const comparisonData = await performanceService.getPerformanceComparison(
        requestedUserId,
        timeRange,
        indexSymbol
      );

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

      const metricsData = await performanceService.getPerformanceMetrics(
        requestedUserId,
        timeRange
      );

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
