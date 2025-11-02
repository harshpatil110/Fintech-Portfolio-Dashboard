import { Router, Response } from 'express';
import { UserService } from '../services/UserService';
import { 
  validateProfileUpdate, 
  validatePreferencesUpdate,
  handleValidationErrors 
} from '../utils/validation';
import { authenticateToken, AuthenticatedRequest } from '../utils/auth';
import { ApiResponse } from '../models';

const router = Router();
const userService = new UserService();

/**
 * GET /api/users/profile
 * Get current user's profile
 */
router.get('/profile',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const profile = await userService.getUserProfile(userId);

      if (!profile) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User profile not found',
            timestamp: new Date()
          }
        });
        return;
      }

      const response: ApiResponse<typeof profile> = {
        success: true,
        data: profile,
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'PROFILE_FETCH_ERROR',
          message: 'Failed to fetch user profile',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/profile',
  authenticateToken,
  validateProfileUpdate,
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const updates = req.body;

      const updatedProfile = await userService.updateUserProfile(userId, updates);

      if (!updatedProfile) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date()
          }
        });
        return;
      }

      const response: ApiResponse<typeof updatedProfile> = {
        success: true,
        data: updatedProfile,
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
      
      let statusCode = 500;
      let errorCode = 'PROFILE_UPDATE_ERROR';
      
      if (errorMessage.includes('already in use')) {
        statusCode = 409;
        errorCode = 'EMAIL_ALREADY_EXISTS';
      }

      res.status(statusCode).json({
        error: {
          code: errorCode,
          message: errorMessage,
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * GET /api/users/preferences
 * Get current user's preferences
 */
router.get('/preferences',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const preferences = await userService.getUserPreferences(userId);

      if (!preferences) {
        res.status(404).json({
          error: {
            code: 'PREFERENCES_NOT_FOUND',
            message: 'User preferences not found',
            timestamp: new Date()
          }
        });
        return;
      }

      const response: ApiResponse<typeof preferences> = {
        success: true,
        data: preferences,
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'PREFERENCES_FETCH_ERROR',
          message: 'Failed to fetch user preferences',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * PUT /api/users/preferences
 * Update current user's preferences
 */
router.put('/preferences',
  authenticateToken,
  validatePreferencesUpdate,
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const updates = req.body;

      const updatedPreferences = await userService.updateUserPreferences(userId, updates);

      if (!updatedPreferences) {
        res.status(404).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date()
          }
        });
        return;
      }

      const response: ApiResponse<typeof updatedPreferences> = {
        success: true,
        data: updatedPreferences,
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Preferences update failed';
      
      let statusCode = 500;
      let errorCode = 'PREFERENCES_UPDATE_ERROR';
      
      if (errorMessage.includes('Invalid currency') || errorMessage.includes('Invalid timezone')) {
        statusCode = 400;
        errorCode = 'INVALID_PREFERENCE_VALUE';
      }

      res.status(statusCode).json({
        error: {
          code: errorCode,
          message: errorMessage,
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * DELETE /api/users/account
 * Delete current user's account
 */
router.delete('/account',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const success = await userService.deleteUserAccount(userId);

      if (!success) {
        res.status(500).json({
          error: {
            code: 'ACCOUNT_DELETION_ERROR',
            message: 'Failed to delete account',
            timestamp: new Date()
          }
        });
        return;
      }

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Account deleted successfully' },
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Account deletion failed';
      
      let statusCode = 500;
      let errorCode = 'ACCOUNT_DELETION_ERROR';
      
      if (errorMessage.includes('not found')) {
        statusCode = 404;
        errorCode = 'USER_NOT_FOUND';
      }

      res.status(statusCode).json({
        error: {
          code: errorCode,
          message: errorMessage,
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * GET /api/users/email-availability/:email
 * Check if email is available (public endpoint for registration form)
 */
router.get('/email-availability/:email',
  async (req, res): Promise<void> => {
    try {
      const { email } = req.params;
      
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          error: {
            code: 'INVALID_EMAIL',
            message: 'Invalid email format',
            timestamp: new Date()
          }
        });
        return;
      }

      const isAvailable = await userService.isEmailAvailable(email);

      const response: ApiResponse<{ available: boolean }> = {
        success: true,
        data: { available: isAvailable },
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'EMAIL_CHECK_ERROR',
          message: 'Failed to check email availability',
          timestamp: new Date()
        }
      });
    }
  }
);

export default router;