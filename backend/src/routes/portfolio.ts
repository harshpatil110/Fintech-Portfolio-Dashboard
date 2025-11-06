import { Router, Response } from 'express';
import { body } from 'express-validator';
import { PortfolioRepository } from '../repositories/PortfolioRepository';
import { authenticateToken, AuthenticatedRequest } from '../utils/auth';
import { handleValidationErrors } from '../utils/validation';
import { MarketDataService, createMarketDataService } from '../services/MarketDataService';
import { PortfolioCalculations } from '../models/calculations';
import { StockPosition, PortfolioSummary } from '../models/Portfolio';

const router = Router();
const portfolioRepository = new PortfolioRepository();
let marketDataService: MarketDataService;

// Initialize market data service
try {
  marketDataService = createMarketDataService();
} catch (error) {
  console.error('Failed to initialize market data service:', error);
}

/**
 * GET /api/portfolio/:userId
 * Retrieve complete portfolio with current market data and calculations
 */
router.get('/:userId',
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

      // Calculate portfolio totals
      const totals = PortfolioCalculations.calculatePortfolioTotals(updatedPositions);
      
      // Generate portfolio summary
      const summary = PortfolioCalculations.generatePortfolioSummary(updatedPositions);
      
      // Calculate position allocations
      const positionsWithAllocations = PortfolioCalculations.calculatePositionAllocations(updatedPositions);

      // Update portfolio with calculated values
      const updatedPortfolio = {
        ...portfolio,
        positions: positionsWithAllocations,
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
          }
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
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 10 })
    .isAlphanumeric()
    .withMessage('Symbol must be 1-10 alphanumeric characters'),
  body('companyName')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Company name is required and must be less than 200 characters'),
  body('quantity')
    .isFloat({ min: 0.001 })
    .withMessage('Quantity must be a positive number greater than 0'),
  body('averageCost')
    .isFloat({ min: 0.01 })
    .withMessage('Average cost must be a positive number greater than 0'),
  body('purchaseDate')
    .isISO8601()
    .withMessage('Purchase date must be a valid ISO 8601 date')
];

/**
 * Validation rules for updating a stock position
 */
const validateUpdatePosition = [
  body('quantity')
    .optional()
    .isFloat({ min: 0.001 })
    .withMessage('Quantity must be a positive number greater than 0'),
  body('averageCost')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Average cost must be a positive number greater than 0'),
  body('purchaseDate')
    .optional()
    .isISO8601()
    .withMessage('Purchase date must be a valid ISO 8601 date')
];

/**
 * POST /api/portfolio/position
 * Add a new stock position to the user's portfolio
 */
router.post('/position', 
  authenticateToken,
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
  authenticateToken,
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
  authenticateToken,
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

export default router;