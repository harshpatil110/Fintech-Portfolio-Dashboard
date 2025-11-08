import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting middleware configurations for different API endpoints
 */

// General API rate limiter - 100 requests per 15 minutes
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again after 15 minutes',
        retryAfter: '15 minutes',
        timestamp: new Date()
      }
    });
  }
});

// Strict rate limiter for authentication endpoints - 5 requests per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: false,
  message: {
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
        retryAfter: '15 minutes',
        timestamp: new Date()
      }
    });
  }
});

// Password reset rate limiter - 3 requests per hour
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  skipSuccessfulRequests: false,
  message: {
    error: {
      code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
      message: 'Too many password reset requests, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
        message: 'Too many password reset requests from this IP, please try again after 1 hour',
        retryAfter: '1 hour',
        timestamp: new Date()
      }
    });
  }
});

// Market data rate limiter - 200 requests per minute (more lenient for real-time data)
export const marketDataLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  message: {
    error: {
      code: 'MARKET_DATA_RATE_LIMIT_EXCEEDED',
      message: 'Too many market data requests, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'MARKET_DATA_RATE_LIMIT_EXCEEDED',
        message: 'Too many market data requests, please try again after 1 minute',
        retryAfter: '1 minute',
        timestamp: new Date()
      }
    });
  }
});

// Portfolio operations rate limiter - 50 requests per minute
export const portfolioLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  message: {
    error: {
      code: 'PORTFOLIO_RATE_LIMIT_EXCEEDED',
      message: 'Too many portfolio operations, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'PORTFOLIO_RATE_LIMIT_EXCEEDED',
        message: 'Too many portfolio operations, please try again after 1 minute',
        retryAfter: '1 minute',
        timestamp: new Date()
      }
    });
  }
});

// Watchlist operations rate limiter - 30 requests per minute
export const watchlistLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    error: {
      code: 'WATCHLIST_RATE_LIMIT_EXCEEDED',
      message: 'Too many watchlist operations, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'WATCHLIST_RATE_LIMIT_EXCEEDED',
        message: 'Too many watchlist operations, please try again after 1 minute',
        retryAfter: '1 minute',
        timestamp: new Date()
      }
    });
  }
});

// Bulk operations rate limiter - 10 requests per 5 minutes (more restrictive)
export const bulkOperationsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: {
    error: {
      code: 'BULK_OPERATIONS_RATE_LIMIT_EXCEEDED',
      message: 'Too many bulk operations, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'BULK_OPERATIONS_RATE_LIMIT_EXCEEDED',
        message: 'Too many bulk operations, please try again after 5 minutes',
        retryAfter: '5 minutes',
        timestamp: new Date()
      }
    });
  }
});

// Registration rate limiter - 3 registrations per hour per IP
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  skipSuccessfulRequests: false,
  message: {
    error: {
      code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
      message: 'Too many registration attempts, please try again later',
      timestamp: new Date()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
        message: 'Too many registration attempts from this IP, please try again after 1 hour',
        retryAfter: '1 hour',
        timestamp: new Date()
      }
    });
  }
});
