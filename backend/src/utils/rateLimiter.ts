import { Request } from 'express';
import redisClient from '../config/redis';

/**
 * Rate limit configuration interface
 */
export interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests allowed in the window
  keyPrefix?: string;      // Prefix for Redis keys
  keyGenerator?: (req: Request) => string; // Custom key generator
}

/**
 * Rate limit result interface
 */
export interface RateLimitResult {
  allowed: boolean;        // Whether the request is allowed
  remaining: number;       // Remaining requests in the window
  resetTime: number;       // Timestamp when the limit resets
  retryAfter?: number;     // Seconds to wait before retrying (if not allowed)
}

/**
 * Redis-based rate limiter using sliding window algorithm
 * Implements distributed rate limiting across multiple instances
 */
export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyPrefix: 'ratelimit',
      keyGenerator: this.defaultKeyGenerator,
      ...config
    };
  }

  /**
   * Default key generator - uses IP address and endpoint
   */
  private defaultKeyGenerator(req: Request): string {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const endpoint = req.path;
    return `${ip}:${endpoint}`;
  }

  /**
   * Generate Redis key for rate limiting
   */
  private generateKey(req: Request): string {
    const identifier = this.config.keyGenerator!(req);
    return `${this.config.keyPrefix}:${identifier}`;
  }

  /**
   * Check if request is within rate limit using sliding window algorithm
   * 
   * Sliding window algorithm:
   * 1. Use current timestamp as score
   * 2. Remove old entries outside the time window
   * 3. Count remaining entries
   * 4. Add current request if under limit
   */
  async checkLimit(req: Request): Promise<RateLimitResult> {
    const key = this.generateKey(req);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      // Check if Redis is available
      if (!redisClient.isOpen) {
        console.warn('Redis not available, allowing request');
        return {
          allowed: true,
          remaining: this.config.maxRequests,
          resetTime: now + this.config.windowMs
        };
      }

      // Use Redis transaction for atomic operations
      const multi = redisClient.multi();

      // Remove old entries outside the time window
      multi.zRemRangeByScore(key, 0, windowStart);

      // Count current entries in the window
      multi.zCard(key);

      // Execute transaction
      const results = await multi.exec();
      const currentCount = (results[1] as number) || 0;

      // Check if under limit
      if (currentCount < this.config.maxRequests) {
        // Add current request with timestamp as score
        await redisClient.zAdd(key, {
          score: now,
          value: `${now}:${Math.random()}` // Unique value for each request
        });

        // Set expiration on the key (cleanup)
        await redisClient.expire(key, Math.ceil(this.config.windowMs / 1000));

        const remaining = this.config.maxRequests - currentCount - 1;
        return {
          allowed: true,
          remaining: Math.max(0, remaining),
          resetTime: now + this.config.windowMs
        };
      }

      // Rate limit exceeded
      // Calculate when the oldest entry will expire
      const oldestEntries = await redisClient.zRange(key, 0, 0);
      let resetTime = now + this.config.windowMs;
      
      if (oldestEntries.length > 0) {
        const oldestScore = await redisClient.zScore(key, oldestEntries[0]);
        if (oldestScore) {
          resetTime = oldestScore + this.config.windowMs;
        }
      }

      const retryAfter = Math.ceil((resetTime - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.max(1, retryAfter)
      };

    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open - allow request if Redis fails
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs
      };
    }
  }

  /**
   * Reset rate limit for a specific request
   * Useful for testing or manual intervention
   */
  async reset(req: Request): Promise<void> {
    const key = this.generateKey(req);
    
    try {
      if (redisClient.isOpen) {
        await redisClient.del(key);
      }
    } catch (error) {
      console.error('Error resetting rate limit:', error);
    }
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getStatus(req: Request): Promise<RateLimitResult> {
    const key = this.generateKey(req);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      if (!redisClient.isOpen) {
        return {
          allowed: true,
          remaining: this.config.maxRequests,
          resetTime: now + this.config.windowMs
        };
      }

      // Remove old entries
      await redisClient.zRemRangeByScore(key, 0, windowStart);

      // Count current entries
      const currentCount = await redisClient.zCard(key);
      const remaining = Math.max(0, this.config.maxRequests - currentCount);

      return {
        allowed: currentCount < this.config.maxRequests,
        remaining,
        resetTime: now + this.config.windowMs
      };

    } catch (error) {
      console.error('Error getting rate limit status:', error);
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs
      };
    }
  }
}

/**
 * Create a rate limiter with user-specific key generation
 */
export function createUserRateLimiter(config: Omit<RateLimitConfig, 'keyGenerator'>): RateLimiter {
  return new RateLimiter({
    ...config,
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.id || 'anonymous';
      const endpoint = req.path;
      return `user:${userId}:${endpoint}`;
    }
  });
}

/**
 * Create a rate limiter with endpoint-specific key generation
 */
export function createEndpointRateLimiter(config: Omit<RateLimitConfig, 'keyGenerator'>): RateLimiter {
  return new RateLimiter({
    ...config,
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.id || req.ip || 'anonymous';
      return `endpoint:${userId}`;
    }
  });
}

/**
 * Pre-configured rate limiters for different endpoint types
 */

// Portfolio endpoints: 100 requests per minute per user
export const portfolioRateLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  keyPrefix: 'ratelimit:portfolio'
});

// Market data endpoints: 300 requests per minute per user
export const marketDataRateLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 300,
  keyPrefix: 'ratelimit:market'
});

// Watchlist endpoints: 100 requests per minute per user
export const watchlistRateLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  keyPrefix: 'ratelimit:watchlist'
});

// Authentication endpoints: 5 requests per 15 minutes per IP
export const authRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  keyPrefix: 'ratelimit:auth',
  keyGenerator: (req: Request) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }
});

// General API: 1000 requests per minute per user
export const generalRateLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 1000,
  keyPrefix: 'ratelimit:general'
});
