import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { 
  validateRegistration, 
  validateLogin, 
  validatePasswordChange,
  handleValidationErrors 
} from '../utils/validation';
import { authenticateToken, AuthenticatedRequest } from '../utils/auth';
import { ApiResponse } from '../models';
import { sanitizeInput } from '../middleware/validation';
import { authLimiter, registrationLimiter, passwordResetLimiter } from '../middleware/rateLimiter';
import { asyncHandler, ValidationError, UnauthorizedError } from '../utils/errorHandler';

const router = Router();
const authService = new AuthService();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', 
  registrationLimiter,
  sanitizeInput,
  validateRegistration,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, password, firstName, lastName } = req.body;
    
    const result = await authService.register({
      email,
      password,
      firstName,
      lastName
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      timestamp: new Date()
    };

    res.status(201).json(response);
  })
);

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login',
  authLimiter,
  sanitizeInput,
  validateLogin,
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    
    const result = await authService.login({ email, password });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    const result = await authService.refreshToken({ refreshToken });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * POST /api/auth/change-password
 * Change user password (requires authentication)
 */
router.post('/change-password',
  authenticateToken,
  validatePasswordChange,
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    await authService.changePassword(userId, currentPassword, newPassword);

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Password changed successfully' },
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * POST /api/auth/validate
 * Validate current token (useful for checking if user is still authenticated)
 */
router.post('/validate',
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const isValid = await authService.validateUser(userId);

    if (!isValid) {
      throw new UnauthorizedError('User account no longer exists');
    }

    const response: ApiResponse<{ valid: boolean; user: { id: string; email: string } }> = {
      success: true,
      data: {
        valid: true,
        user: {
          id: req.user!.userId,
          email: req.user!.email
        }
      },
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password',
  passwordResetLimiter,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
    
    if (!email) {
      throw new ValidationError('Email is required');
    }

    try {
      await authService.requestPasswordReset(email);
    } catch (error) {
      // Silently catch errors to prevent email enumeration
    }

    // Always return success to prevent email enumeration
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'If an account with that email exists, a password reset link has been sent' },
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
router.post('/reset-password',
  passwordResetLimiter,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      throw new ValidationError('Token and new password are required');
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      throw new ValidationError('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }

    await authService.resetPassword(token, newPassword);

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Password reset successfully' },
      timestamp: new Date()
    };

    res.status(200).json(response);
  })
);

export default router;