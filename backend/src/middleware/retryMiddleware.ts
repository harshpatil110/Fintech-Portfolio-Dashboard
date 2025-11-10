/**
 * Retry Middleware
 * 
 * Applies retry logic to API route handlers with configurable settings per endpoint type.
 * Includes retry logging and monitoring.
 * 
 * Requirements: 3.1, 3.4, 3.5
 */

import { Request, Response, NextFunction } from 'express';
import { RetryHandler, isRetryableError, RetryConfig } from '../utils/retryHandler';
import { errorHandlingConfig } from '../config/errorHandling';

/**
 * Retry configuration for different endpoint types
 */
export const ENDPOINT_RETRY_CONFIGS: Record<string, Partial<RetryConfig>> = {
  // Portfolio endpoints - moderate retry (Req 3.1)
  portfolio: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
  },
  
  // Market data endpoints - aggressive retry due to external API (Req 3.1)
  marketData: {
    maxAttempts: 3,
    initialDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  },
  
  // Watchlist endpoints - moderate retry
  watchlist: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
  },
  
  // Auth endpoints - minimal retry (security sensitive)
  auth: {
    maxAttempts: 2,
    initialDelay: 500,
    maxDelay: 2000,
    backoffMultiplier: 2,
  },
  
  // Default configuration
  default: errorHandlingConfig.retry,
};

/**
 * Retry statistics tracker
 */
class RetryStatsTracker {
  private stats: Map<string, {
    totalRequests: number;
    retriedRequests: number;
    successfulRetries: number;
    failedRetries: number;
    averageAttempts: number;
  }> = new Map();

  recordRequest(endpoint: string, attempts: number, success: boolean): void {
    const current = this.stats.get(endpoint) || {
      totalRequests: 0,
      retriedRequests: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
    };

    current.totalRequests++;
    
    if (attempts > 1) {
      current.retriedRequests++;
      if (success) {
        current.successfulRetries++;
      } else {
        current.failedRetries++;
      }
    }

    // Update average attempts
    current.averageAttempts = 
      (current.averageAttempts * (current.totalRequests - 1) + attempts) / current.totalRequests;

    this.stats.set(endpoint, current);
  }

  getStats(endpoint?: string) {
    if (endpoint) {
      return this.stats.get(endpoint);
    }
    return Object.fromEntries(this.stats);
  }

  reset(endpoint?: string): void {
    if (endpoint) {
      this.stats.delete(endpoint);
    } else {
      this.stats.clear();
    }
  }
}

// Global retry stats tracker
export const retryStatsTracker = new RetryStatsTracker();

/**
 * Create retry middleware for specific endpoint type
 * @param endpointType - Type of endpoint (portfolio, marketData, watchlist, auth, default)
 * @returns Express middleware function
 */
export function createRetryMiddleware(endpointType: string = 'default') {
  const config = ENDPOINT_RETRY_CONFIGS[endpointType] || ENDPOINT_RETRY_CONFIGS.default;
  const retryHandler = new RetryHandler(config);

  return (req: Request, res: Response, next: NextFunction) => {
    // Attach retry handler to request for use in route handlers
    (req as any).retryHandler = retryHandler;
    (req as any).retryConfig = config;
    (req as any).endpointType = endpointType;
    
    next();
  };
}

/**
 * Wrap an async route handler with retry logic
 * @param handler - The async route handler function
 * @param endpointType - Type of endpoint for configuration
 * @returns Wrapped handler with retry logic
 */
export function withRetry(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  endpointType: string = 'default'
) {
  const config = ENDPOINT_RETRY_CONFIGS[endpointType] || ENDPOINT_RETRY_CONFIGS.default;
  const retryHandler = new RetryHandler(config);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: any;

    try {
      // Execute handler with retry logic (Req 3.2, 3.3)
      await retryHandler.executeWithRetry(
        async () => {
          attempts++;
          return handler(req, res, next);
        },
        (error, attempt) => {
          // Check if error is retryable (Req 3.4)
          const shouldRetry = isRetryableError(error);
          
          // Log retry attempt (Req 3.5)
          if (shouldRetry) {
            console.warn(`🔄 Retry attempt ${attempt}/${config.maxAttempts} for ${req.method} ${req.path}`, {
              error: error.message,
              endpoint: endpointType,
              requestId: req.headers['x-request-id'],
              userId: (req as any).user?.userId,
            });
          } else {
            console.warn(`❌ Non-retryable error for ${req.method} ${req.path}:`, error.message);
          }
          
          return shouldRetry;
        },
        (error, attempt, delay) => {
          // Log before each retry (Req 3.5)
          console.log(`⏳ Waiting ${delay}ms before retry ${attempt}/${config.maxAttempts} for ${req.method} ${req.path}`);
        }
      );

      // Record successful request
      const duration = Date.now() - startTime;
      retryStatsTracker.recordRequest(endpointType, attempts, true);
      
      // Log successful retry if it took multiple attempts (Req 3.5)
      if (attempts > 1) {
        console.log(`✅ Request succeeded after ${attempts} attempt(s) in ${duration}ms for ${req.method} ${req.path}`);
      }

    } catch (error) {
      lastError = error;
      const duration = Date.now() - startTime;
      
      // Record failed request
      retryStatsTracker.recordRequest(endpointType, attempts, false);
      
      // Log final failure (Req 3.5)
      console.error(`❌ Request failed after ${attempts} attempt(s) in ${duration}ms for ${req.method} ${req.path}`, {
        error: error instanceof Error ? error.message : error,
        endpoint: endpointType,
        requestId: req.headers['x-request-id'],
        userId: (req as any).user?.userId,
      });

      // Pass error to error handling middleware
      next(error);
    }
  };
}

/**
 * Wrap an async function with retry logic (for use in services/repositories)
 * @param fn - The async function to wrap
 * @param config - Optional retry configuration
 * @param context - Optional context for logging
 * @returns Wrapped function with retry logic
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
  context?: { operation?: string; service?: string }
): Promise<T> {
  const retryHandler = new RetryHandler(config);
  const operation = context?.operation || 'operation';
  const service = context?.service || 'service';

  return retryHandler.executeWithRetry(
    fn,
    (error, attempt) => {
      const shouldRetry = isRetryableError(error);
      
      // Log retry attempt (Req 3.5)
      if (shouldRetry) {
        console.warn(`🔄 Retry attempt ${attempt} for ${service}.${operation}:`, error.message);
      }
      
      return shouldRetry;
    },
    (error, attempt, delay) => {
      // Log before each retry (Req 3.5)
      console.log(`⏳ Waiting ${delay}ms before retry ${attempt} for ${service}.${operation}`);
    }
  );
}

/**
 * Get retry statistics for monitoring
 * @param endpoint - Optional endpoint type to get stats for
 * @returns Retry statistics
 */
export function getRetryStats(endpoint?: string) {
  return retryStatsTracker.getStats(endpoint);
}

/**
 * Reset retry statistics
 * @param endpoint - Optional endpoint type to reset stats for
 */
export function resetRetryStats(endpoint?: string): void {
  retryStatsTracker.reset(endpoint);
}

/**
 * Middleware to add retry statistics to response headers (for monitoring)
 */
export function retryStatsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const endpointType = (req as any).endpointType || 'default';
    const stats = retryStatsTracker.getStats(endpointType);
    
    if (stats && typeof stats === 'object' && 'totalRequests' in stats) {
      res.setHeader('X-Retry-Stats-Total', stats.totalRequests.toString());
      res.setHeader('X-Retry-Stats-Retried', stats.retriedRequests.toString());
      res.setHeader('X-Retry-Stats-Success-Rate', 
        ((stats.successfulRetries / Math.max(stats.retriedRequests, 1)) * 100).toFixed(2));
    }
    
    next();
  };
}

export default {
  createRetryMiddleware,
  withRetry,
  retryAsync,
  getRetryStats,
  resetRetryStats,
  retryStatsMiddleware,
};
