import { Router, Response } from 'express';
import { body } from 'express-validator';
import { WatchlistRepository } from '../repositories/WatchlistRepository';
import { authenticateToken, AuthenticatedRequest } from '../utils/auth';
import { handleValidationErrors } from '../utils/validation';
import { MarketDataService, createMarketDataService } from '../services/MarketDataService';

const router = Router();
const watchlistRepository = new WatchlistRepository();
let marketDataService: MarketDataService;

// Initialize market data service
try {
  marketDataService = createMarketDataService();
} catch (error) {
  console.error('Failed to initialize market data service:', error);
}

/**
 * Validation rules for adding a stock to watchlist
 */
const validateAddToWatchlist = [
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 10 })
    .isAlphanumeric()
    .withMessage('Symbol must be 1-10 alphanumeric characters'),
  body('companyName')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Company name is required and must be less than 200 characters'),
  body('alertPrice')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Alert price must be a positive number greater than 0')
];

/**
 * GET /api/watchlist/:userId
 * Retrieve user's complete watchlist with current market data, sorting, and filtering
 */
router.get('/:userId',
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

      // Get user's watchlist
      const watchlistItems = await watchlistRepository.findByUserId(requestedUserId);
      
      if (watchlistItems.length === 0) {
        res.json({
          message: 'Watchlist retrieved successfully',
          data: {
            items: [],
            summary: {
              totalItems: 0,
              itemsWithAlerts: 0,
              triggeredAlerts: []
            }
          },
          timestamp: new Date()
        });
        return;
      }

      // Get current market data for all watchlist items
      const symbols = watchlistItems.map(item => item.symbol);
      let updatedItems = [...watchlistItems];
      
      if (marketDataService) {
        try {
          const quotes = await marketDataService.getBatchQuotes(symbols);
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

      const summary = {
        totalItems: updatedItems.length,
        filteredItems: filteredItems.length,
        itemsWithAlerts: itemsWithAlerts.length,
        triggeredAlerts
      };

      res.json({
        message: 'Watchlist retrieved successfully',
        data: {
          items: filteredItems,
          summary
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error retrieving watchlist:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve watchlist',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * POST /api/watchlist
 * Add a stock to the user's watchlist
 */
router.post('/', 
  authenticateToken,
  validateAddToWatchlist,
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { symbol, companyName, alertPrice } = req.body;
      const userId = req.user!.userId;

      // Validate stock symbol with market data service if available
      if (marketDataService) {
        try {
          const isValid = await marketDataService.validateSymbol(symbol);
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

      // Add to watchlist
      const watchlistItem = await watchlistRepository.add(userId, {
        symbol: symbol.toUpperCase(),
        companyName,
        alertPrice: alertPrice ? parseFloat(alertPrice) : undefined
      });

      res.status(201).json({
        message: 'Stock added to watchlist successfully',
        data: watchlistItem,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error adding to watchlist:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('already in your watchlist')) {
          res.status(409).json({
            error: {
              code: 'STOCK_ALREADY_IN_WATCHLIST',
              message: error.message,
              timestamp: new Date()
            }
          });
          return;
        }
        
        if (error.message.includes('Watchlist limit')) {
          res.status(400).json({
            error: {
              code: 'WATCHLIST_LIMIT_EXCEEDED',
              message: error.message,
              timestamp: new Date()
            }
          });
          return;
        }
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to add stock to watchlist',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * DELETE /api/watchlist/:userId/:symbol
 * Remove a stock from the user's watchlist
 */
router.delete('/:userId/:symbol',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
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

      // Check if the stock exists in the watchlist
      const existingItem = await watchlistRepository.findByUserIdAndSymbol(requestedUserId, symbol);
      
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

      // Remove from watchlist
      const removed = await watchlistRepository.remove(requestedUserId, symbol);

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

      res.json({
        message: 'Stock removed from watchlist successfully',
        data: {
          symbol: symbol.toUpperCase(),
          companyName: existingItem.companyName,
          removedAt: new Date()
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error removing from watchlist:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to remove stock from watchlist',
          timestamp: new Date()
        }
      });
    }
  }
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
 */
router.put('/:userId/:symbol',
  authenticateToken,
  [
    body('alertPrice')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Alert price must be a positive number greater than 0')
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
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

      // Check if the stock exists in the watchlist
      const existingItem = await watchlistRepository.findByUserIdAndSymbol(requestedUserId, symbol);
      
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

      // Update the watchlist item
      const updatedItem = await watchlistRepository.update(requestedUserId, symbol, {
        alertPrice: alertPrice ? parseFloat(alertPrice) : undefined
      });

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

      res.json({
        message: 'Watchlist item updated successfully',
        data: updatedItem,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error updating watchlist item:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update watchlist item',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * POST /api/watchlist/bulk
 * Add multiple stocks to watchlist in a single request
 */
router.post('/bulk',
  authenticateToken,
  [
    body('stocks')
      .isArray({ min: 1, max: 10 })
      .withMessage('Stocks array must contain 1-10 items'),
    body('stocks.*.symbol')
      .trim()
      .isLength({ min: 1, max: 10 })
      .isAlphanumeric()
      .withMessage('Each symbol must be 1-10 alphanumeric characters'),
    body('stocks.*.companyName')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Each company name is required and must be less than 200 characters'),
    body('stocks.*.alertPrice')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Alert price must be a positive number greater than 0')
  ],
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

      const summary = {
        totalItems: watchlistItems.length,
        itemsWithAlerts: itemsWithAlerts.length,
        triggeredAlerts: triggeredAlerts.length,
        remainingSlots: 50 - watchlistItems.length,
        alerts: triggeredAlerts
      };

      res.json({
        message: 'Watchlist summary retrieved successfully',
        data: summary,
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