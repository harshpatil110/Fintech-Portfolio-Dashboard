import { Request, Response, NextFunction } from 'express';
import {
  RateLimiter,
  portfolioRateLimiter,
  marketDataRateLimiter,
  watchlistRateLimiter,
  authRateLimiter,
  generalRateLimiter
} from '../utils/rateLimiter';

/**
 * Rate limiting middleware configurations for different API endpoints
 * Uses Redis-based sliding window algorithm for distributed rate limiting
 */

/**
 * Create Express middleware from RateLimiter instance
 */
export function createRateLimitMiddleware(
  rateLimiter: RateLimiter,
  errorCode: string,
  errorMessage: string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rateLimiter.checkLimit(req);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', result.remaining + (result.allowed ? 1 : 0));
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        // Set Retry-After header (in seconds)
        if (result.retryAfter) {
          res.setHeader('Retry-After', result.retryAfter);
        }

        return res.status(429).json({
          error: {
            code: errorCode,
            message: errorMessage,
            retryAfter: result.retryAfter ? `${result.retryAfter} seconds` : 'later',
            resetTime: new Date(result.resetTime).toISOString(),
            timestamp: new Date().toISOString()
          }
        });
      }

      next();
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      // Fail open - allow request if middleware fails
      next();
    }
  };
}

/**
 * Portfolio operations rate limiter - 100 requests per minute per user
 * Requirement 6.2: Limit portfolio requests to 100 per minute per user
 */
export const portfolioLimiter = createRateLimitMiddleware(
  portfolioRateLimiter,
  'PORTFOLIO_RATE_LIMIT_EXCEEDED',
  'Too many portfolio operations, please try again later'
);

/**
 * Market data rate limiter - 300 requests per minute per user
 * Requirement 6.3: Limit market data requests to 300 per minute per user
 */
export const marketDataLimiter = createRateLimitMiddleware(
  marketDataRateLimiter,
  'MARKET_DATA_RATE_LIMIT_EXCEEDED',
  'Too many market data requests, please try again later'
);

/**
 * Watchlist operations rate limiter - 100 requests per minute per user
 */
export const watchlistLimiter = createRateLimitMiddleware(
  watchlistRateLimiter,
  'WATCHLIST_RATE_LIMIT_EXCEEDED',
  'Too many watchlist operations, please try again later'
);

/**
 * Authentication rate limiter - 5 requests per 15 minutes per IP
 * Strict rate limiting for authentication endpoints
 */
export const authLimiter = createRateLimitMiddleware(
  authRateLimiter,
  'AUTH_RATE_LIMIT_EXCEEDED',
  'Too many authentication attempts, please try again later'
);

/**
 * General API rate limiter - 1000 requests per minute per user
 * Fallback rate limiter for endpoints without specific limits
 */
export const generalLimiter = createRateLimitMiddleware(
  generalRateLimiter,
  'RATE_LIMIT_EXCEEDED',
  'Too many requests, please try again later'
);

/**
 * Password reset rate limiter - 3 requests per hour per IP
 */
export const passwordResetLimiter = createRateLimitMiddleware(
  new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    keyPrefix: 'ratelimit:password-reset',
    keyGenerator: (req: Request) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return `ip:${ip}`;
    }
  }),
  'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
  'Too many password reset requests, please try again later'
);

/**
 * Registration rate limiter - 3 registrations per hour per IP
 */
export const registrationLimiter = createRateLimitMiddleware(
  new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    keyPrefix: 'ratelimit:registration',
    keyGenerator: (req: Request) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return `ip:${ip}`;
    }
  }),
  'REGISTRATION_RATE_LIMIT_EXCEEDED',
  'Too many registration attempts, please try again later'
);

/**
 * Bulk operations rate limiter - 10 requests per 5 minutes per user
 */
export const bulkOperationsLimiter = createRateLimitMiddleware(
  new RateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10,
    keyPrefix: 'ratelimit:bulk',
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.id || req.ip || 'anonymous';
      return `user:${userId}`;
    }
  }),
  'BULK_OPERATIONS_RATE_LIMIT_EXCEEDED',
  'Too many bulk operations, please try again later'
);
