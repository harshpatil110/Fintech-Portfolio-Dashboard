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
  async (req: Request, res: Response): Promise<void> => {
    try {
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      
      let statusCode = 500;
      let errorCode = 'REGISTRATION_ERROR';
      
      if (errorMessage.includes('already exists')) {
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
 * POST /api/auth/login
 * Login user
 */
router.post('/login',
  authLimiter,
  sanitizeInput,
  validateLogin,
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;
      
      const result = await authService.login({ email, password });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      
      res.status(401).json({
        error: {
          code: 'LOGIN_FAILED',
          message: errorMessage,
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        res.status(400).json({
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'Refresh token is required',
            timestamp: new Date()
          }
        });
        return;
      }

      const result = await authService.refreshToken({ refreshToken });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token refresh failed';
      
      res.status(401).json({
        error: {
          code: 'REFRESH_TOKEN_INVALID',
          message: errorMessage,
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * POST /api/auth/change-password
 * Change user password (requires authentication)
 */
router.post('/change-password',
  authenticateToken,
  validatePasswordChange,
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.userId;

      await authService.changePassword(userId, currentPassword, newPassword);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Password changed successfully' },
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Password change failed';
      
      let statusCode = 500;
      let errorCode = 'PASSWORD_CHANGE_ERROR';
      
      if (errorMessage.includes('incorrect')) {
        statusCode = 400;
        errorCode = 'INCORRECT_CURRENT_PASSWORD';
      } else if (errorMessage.includes('not found')) {
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
 * POST /api/auth/validate
 * Validate current token (useful for checking if user is still authenticated)
 */
router.post('/validate',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const isValid = await authService.validateUser(userId);

      if (!isValid) {
        res.status(401).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User account no longer exists',
            timestamp: new Date()
          }
        });
        return;
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
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Token validation failed',
          timestamp: new Date()
        }
      });
    }
  }
);

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password',
  passwordResetLimiter,
  sanitizeInput,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;
      
      if (!email) {
        res.status(400).json({
          error: {
            code: 'MISSING_EMAIL',
            message: 'Email is required',
            timestamp: new Date()
          }
        });
        return;
      }

      await authService.requestPasswordReset(email);

      // Always return success to prevent email enumeration
      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'If an account with that email exists, a password reset link has been sent' },
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      // Always return success to prevent email enumeration
      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'If an account with that email exists, a password reset link has been sent' },
        timestamp: new Date()
      };

      res.status(200).json(response);
    }
  }
);

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
router.post('/reset-password',
  passwordResetLimiter,
  sanitizeInput,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        res.status(400).json({
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'Token and new password are required',
            timestamp: new Date()
          }
        });
        return;
      }

      // Validate password strength
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        res.status(400).json({
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character',
            timestamp: new Date()
          }
        });
        return;
      }

      await authService.resetPassword(token, newPassword);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Password reset successfully' },
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Password reset failed';
      
      let statusCode = 500;
      let errorCode = 'PASSWORD_RESET_ERROR';
      
      if (errorMessage.includes('Invalid') || errorMessage.includes('expired')) {
        statusCode = 400;
        errorCode = 'INVALID_RESET_TOKEN';
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

export default router;