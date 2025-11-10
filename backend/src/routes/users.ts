import { Router, Response } from 'express';
import { UserService } from '../services/UserService';
import { 
  validateProfileUpdate, 
  validatePreferencesUpdate,
  handleValidationErrors 
} from '../utils/validation';
import { authenticateToken, AuthenticatedRequest } from '../utils/auth';
import { ApiResponse } from '../models';
import { asyncHandler, NotFoundError, ValidationError } from '../utils/errorHandler';

const router = Router();
const userService = new UserService();

/**
 * GET /api/users/profile
 * Get current user's profile
 */
router.get('/profile',
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const profile = await userService.getUserProfile(userId);

    if (!profile) {
      throw new NotFoundError('User profile not found');
    }

    const response: ApiResponse<typeof profile> = {
      success: true,
      data: profile,
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/profile',
  authenticateToken,
  validateProfileUpdate,
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const updates = req.body;

    const updatedProfile = await userService.updateUserProfile(userId, updates);

    if (!updatedProfile) {
      throw new NotFoundError('User not found');
    }

    const response: ApiResponse<typeof updatedProfile> = {
      success: true,
      data: updatedProfile,
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * GET /api/users/preferences
 * Get current user's preferences
 */
router.get('/preferences',
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const preferences = await userService.getUserPreferences(userId);

    if (!preferences) {
      throw new NotFoundError('User preferences not found');
    }

    const response: ApiResponse<typeof preferences> = {
      success: true,
      data: preferences,
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * PUT /api/users/preferences
 * Update current user's preferences
 */
router.put('/preferences',
  authenticateToken,
  validatePreferencesUpdate,
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const updates = req.body;

    const updatedPreferences = await userService.updateUserPreferences(userId, updates);

    if (!updatedPreferences) {
      throw new NotFoundError('User not found');
    }

    const response: ApiResponse<typeof updatedPreferences> = {
      success: true,
      data: updatedPreferences,
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * DELETE /api/users/account
 * Delete current user's account
 */
router.delete('/account',
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const success = await userService.deleteUserAccount(userId);

    if (!success) {
      throw new Error('Failed to delete account');
    }

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Account deleted successfully' },
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * GET /api/users/email-availability/:email
 * Check if email is available (public endpoint for registration form)
 */
router.get('/email-availability/:email',
  asyncHandler(async (req, res): Promise<void> => {
    const { email } = req.params;
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format');
    }

    const isAvailable = await userService.isEmailAvailable(email);

    const response: ApiResponse<{ available: boolean }> = {
      success: true,
      data: { available: isAvailable },
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

export default router;