import { Request, Response, NextFunction } from 'express';
import { TimeoutError } from '../utils/errorHandler';

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  maxExecutionTime: number; // milliseconds
  warningThreshold: number; // milliseconds
}

/**
 * Default timeout configuration based on Vercel limits
 */
const DEFAULT_CONFIG: TimeoutConfig = {
  maxExecutionTime: parseInt(process.env.FUNCTION_TIMEOUT_MS || '8000', 10), // 8 seconds (safe margin for 10s Vercel limit)
  warningThreshold: parseInt(process.env.FUNCTION_WARNING_THRESHOLD_MS || '6000', 10) // 6 seconds
};

/**
 * Timeout Handler class for managing function execution time
 */
export class TimeoutHandler {
  private startTime: number;
  private config: TimeoutConfig;

  constructor(config: TimeoutConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.startTime = Date.now();
  }

  /**
   * Check if timeout has been exceeded
   */
  checkTimeout(): boolean {
    const elapsed = Date.now() - this.startTime;
    return elapsed > this.config.maxExecutionTime;
  }

  /**
   * Get remaining execution time in milliseconds
   */
  getRemainingTime(): number {
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.config.maxExecutionTime - elapsed);
  }

  /**
   * Get elapsed execution time in milliseconds
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Check if approaching timeout warning threshold
   */
  isApproachingTimeout(): boolean {
    const elapsed = Date.now() - this.startTime;
    return elapsed > this.config.warningThreshold;
  }

  /**
   * Wrap a promise with timeout
   */
  async wrapWithTimeout<T>(
    fn: () => Promise<T>,
    fallback: () => T | Promise<T>
  ): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(`Operation timed out after ${this.config.maxExecutionTime}ms`));
      }, this.getRemainingTime());
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } catch (error: any) {
      if (error instanceof TimeoutError || error.name === 'TimeoutError') {
        console.warn(`⏱️  Timeout occurred, using fallback. Elapsed: ${this.getElapsedTime()}ms`);
        return await Promise.resolve(fallback());
      }
      throw error;
    }
  }

  /**
   * Log warning if approaching timeout
   */
  logWarningIfNeeded(context: string): void {
    if (this.isApproachingTimeout()) {
      const elapsed = this.getElapsedTime();
      const remaining = this.getRemainingTime();
      console.warn(`⚠️  ${context} - Approaching timeout. Elapsed: ${elapsed}ms, Remaining: ${remaining}ms`);
    }
  }
}

/**
 * Endpoint-specific timeout configurations
 */
export const ENDPOINT_TIMEOUT_CONFIGS: Record<string, TimeoutConfig> = {
  // Portfolio endpoints - longer timeout for complex calculations
  '/api/portfolio': {
    maxExecutionTime: 8000,
    warningThreshold: 6000
  },
  // Market data endpoints - shorter timeout for external API calls
  '/api/market': {
    maxExecutionTime: 6000,
    warningThreshold: 4500
  },
  // Watchlist endpoints - standard timeout
  '/api/watchlist': {
    maxExecutionTime: 7000,
    warningThreshold: 5000
  },
  // Auth endpoints - quick timeout
  '/api/auth': {
    maxExecutionTime: 5000,
    warningThreshold: 3500
  },
  // Default for all other endpoints
  'default': DEFAULT_CONFIG
};

/**
 * Get timeout configuration for a specific endpoint
 */
function getEndpointTimeoutConfig(path: string): TimeoutConfig {
  // Find matching endpoint configuration
  for (const [endpoint, config] of Object.entries(ENDPOINT_TIMEOUT_CONFIGS)) {
    if (path.startsWith(endpoint)) {
      return config;
    }
  }
  return ENDPOINT_TIMEOUT_CONFIGS['default'];
}

/**
 * Express middleware to add timeout tracking to requests
 */
export function timeoutMiddleware(config?: TimeoutConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Use endpoint-specific config if no config provided
    const effectiveConfig = config || getEndpointTimeoutConfig(req.path);
    
    // Attach timeout handler to request
    (req as any).timeoutHandler = new TimeoutHandler(effectiveConfig);

    // Set timeout for the request
    const timeout = effectiveConfig.maxExecutionTime;
    req.setTimeout(timeout, () => {
      if (!res.headersSent) {
        const error = new TimeoutError('Request processing timeout');
        next(error);
      }
    });

    // Track response time
    const startTime = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      res.setHeader('X-Response-Time', `${duration}ms`);
      
      // Log slow requests
      if (duration > effectiveConfig.warningThreshold) {
        console.warn(`🐌 Slow request: ${req.method} ${req.path} - ${duration}ms (threshold: ${effectiveConfig.warningThreshold}ms)`);
      }
    });

    next();
  };
}

/**
 * Middleware to check for approaching timeout and return early if needed
 * This should be used in long-running route handlers
 */
export function checkTimeoutMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeoutHandler = getTimeoutHandler(req);
    
    if (!timeoutHandler) {
      return next();
    }

    // Check if we're approaching timeout
    if (timeoutHandler.isApproachingTimeout()) {
      const remaining = timeoutHandler.getRemainingTime();
      console.warn(`⚠️  Approaching timeout on ${req.method} ${req.path}. Remaining: ${remaining}ms`);
      
      // If very close to timeout, return cached data or error
      if (remaining < 1000) {
        if (!res.headersSent) {
          res.status(504).json({
            error: {
              code: 'TIMEOUT_APPROACHING',
              message: 'Request is taking too long to process. Please try again.',
              timestamp: new Date().toISOString(),
              requestId: req.headers['x-request-id']
            }
          });
        }
        return;
      }
    }

    next();
  };
}

/**
 * Helper to get timeout handler from request
 */
export function getTimeoutHandler(req: Request): TimeoutHandler | undefined {
  return (req as any).timeoutHandler;
}

/**
 * Wrap an async route handler with timeout protection
 * Automatically returns cached/fallback data if timeout is approaching
 */
export function withTimeoutProtection<T = any>(
  handler: (req: Request, res: Response) => Promise<T>,
  fallbackHandler?: (req: Request, res: Response) => Promise<any> | any
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const timeoutHandler = getTimeoutHandler(req);
    
    if (!timeoutHandler) {
      // No timeout handler attached, proceed normally
      try {
        await handler(req, res);
      } catch (error) {
        next(error);
      }
      return;
    }

    try {
      // Execute handler with timeout protection
      await timeoutHandler.wrapWithTimeout(
        () => handler(req, res),
        async () => {
          // Timeout occurred, use fallback if provided
          if (fallbackHandler && !res.headersSent) {
            console.warn(`⏱️  Timeout on ${req.method} ${req.path}, using fallback handler`);
            return await fallbackHandler(req, res);
          }
          
          // No fallback, return timeout error
          if (!res.headersSent) {
            res.status(504).json({
              error: {
                code: 'TIMEOUT_ERROR',
                message: 'Request processing timeout. Please try again.',
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id']
              }
            });
          }
        }
      );
    } catch (error) {
      if (!res.headersSent) {
        next(error);
      }
    }
  };
}

/**
 * Create a timeout-aware async handler that checks for timeout before proceeding
 */
export function timeoutAwareHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const timeoutHandler = getTimeoutHandler(req);
    
    // Check if already timed out before starting
    if (timeoutHandler && timeoutHandler.checkTimeout()) {
      if (!res.headersSent) {
        res.status(504).json({
          error: {
            code: 'TIMEOUT_ERROR',
            message: 'Request timeout before processing',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id']
          }
        });
      }
      return;
    }

    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export default TimeoutHandler;
