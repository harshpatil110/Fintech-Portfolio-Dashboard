import { Router, Response } from 'express';
import { body } from 'express-validator';
import { PortfolioRepository } from '../repositories/PortfolioRepository';
import { authenticateToken, AuthenticatedRequest } from '../utils/auth';
import { handleValidationErrors } from '../utils/validation';

const router = Router();
const portfolioRepository = new PortfolioRepository();

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
      const existingPositions = await portfolioRepository.findPositionsByPortfolioId(portfolio.id);
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
      const newPosition = await portfolioRepository.addPosition(portfolio.id, {
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
      const updatedPosition = await portfolioRepository.updatePosition(positionId, {
        quantity: updateData.quantity ? parseFloat(updateData.quantity) : undefined,
        averageCost: updateData.averageCost ? parseFloat(updateData.averageCost) : undefined,
        purchaseDate: updateData.purchaseDate
      });

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