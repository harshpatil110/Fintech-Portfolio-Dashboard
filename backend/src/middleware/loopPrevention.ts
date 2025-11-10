import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Loop prevention configuration
 */
interface LoopPreventionConfig {
  maxDepth: number;
  maxExecutionTime: number; // milliseconds
  trackingKey: string;
}

const DEFAULT_LOOP_CONFIG: LoopPreventionConfig = {
  maxDepth: 10,
  maxExecutionTime: 1000, // 1 second for middleware chain
  trackingKey: '_middlewareDepth'
};

/**
 * Request depth tracking to prevent infinite loops
 */
export function requestDepthTracking(config: Partial<LoopPreventionConfig> = {}) {
  const finalConfig = { ...DEFAULT_LOOP_CONFIG, ...config };
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Initialize or increment depth counter
      const depth = ((req as any)[finalConfig.trackingKey] || 0) + 1;
      (req as any)[finalConfig.trackingKey] = depth;
      
      // Check if depth exceeds maximum
      if (depth > finalConfig.maxDepth) {
        logger.error('Middleware depth limit exceeded', new Error('Infinite loop detected'), {
          depth,
          maxDepth: finalConfig.maxDepth,
          path: req.path,
          method: req.method,
          requestId: Array.isArray(req.headers['x-request-id']) 
            ? req.headers['x-request-id'][0] 
            : req.headers['x-request-id']
        });
        
        return res.status(508).json({
          error: {
            code: 'INFINITE_LOOP_DETECTED',
            message: 'Request processing depth limit exceeded. Possible infinite loop in middleware.',
            depth,
            maxDepth: finalConfig.maxDepth,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id']
          }
        });
      }
      
      // Log warning if approaching limit
      if (depth > finalConfig.maxDepth * 0.7) {
        logger.warn('High middleware depth detected', undefined, {
          depth,
          maxDepth: finalConfig.maxDepth,
          path: req.path,
          requestId: Array.isArray(req.headers['x-request-id']) 
            ? req.headers['x-request-id'][0] 
            : req.headers['x-request-id']
        });
      }
      
      next();
    } catch (error) {
      logger.error('Error in request depth tracking', error);
      next(error);
    }
  };
}

/**
 * Circular redirect prevention
 */
export function circularRedirectPrevention() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Track visited paths to detect circular redirects
      const visitedPaths = (req as any)._visitedPaths || new Set<string>();
      const currentPath = `${req.method}:${req.path}`;
      
      if (visitedPaths.has(currentPath)) {
        logger.error('Circular redirect detected', new Error('Same path visited twice'), {
          path: req.path,
          method: req.method,
          visitedPaths: Array.from(visitedPaths),
          requestId: req.headers['x-request-id']
        });
        
        return res.status(508).json({
          error: {
            code: 'CIRCULAR_REDIRECT',
            message: 'Circular redirect detected. The same path was visited multiple times.',
            path: currentPath,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id']
          }
        });
      }
      
      // Add current path to visited set
      visitedPaths.add(currentPath);
      (req as any)._visitedPaths = visitedPaths;
      
      // Override res.redirect to track redirects
      const originalRedirect = res.redirect.bind(res);
      (res as any).redirect = function(statusOrUrl: number | string, url?: string) {
        const targetUrl = typeof statusOrUrl === 'string' ? statusOrUrl : url;
        
        if (targetUrl) {
          // Extract path from URL
          const targetPath = targetUrl.startsWith('http') 
            ? new URL(targetUrl).pathname 
            : targetUrl.split('?')[0];
          
          const targetKey = `${req.method}:${targetPath}`;
          
          if (visitedPaths.has(targetKey)) {
            const requestId = Array.isArray(req.headers['x-request-id']) 
              ? req.headers['x-request-id'][0] 
              : req.headers['x-request-id'];
            
            logger.error('Circular redirect prevented', new Error('Redirect to visited path'), {
              from: currentPath,
              to: targetKey,
              visitedPaths: Array.from(visitedPaths),
              requestId
            });
            
            return res.status(508).json({
              error: {
                code: 'CIRCULAR_REDIRECT_PREVENTED',
                message: 'Redirect prevented to avoid circular loop.',
                from: currentPath,
                to: targetKey,
                timestamp: new Date().toISOString(),
                requestId
              }
            });
          }
        }
        
        // Call original redirect
        if (typeof statusOrUrl === 'number') {
          return originalRedirect(statusOrUrl, url!);
        } else {
          return originalRedirect(statusOrUrl);
        }
      };
      
      next();
    } catch (error) {
      logger.error('Error in circular redirect prevention', error);
      next(error);
    }
  };
}

/**
 * Middleware execution time limit
 */
export function middlewareExecutionTimeLimit(config: Partial<LoopPreventionConfig> = {}) {
  const finalConfig = { ...DEFAULT_LOOP_CONFIG, ...config };
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Track middleware start time
      const startTime = (req as any)._middlewareStartTime || Date.now();
      (req as any)._middlewareStartTime = startTime;
      
      const elapsed = Date.now() - startTime;
      
      // Check if execution time exceeds limit
      if (elapsed > finalConfig.maxExecutionTime) {
        logger.error('Middleware execution time limit exceeded', new Error('Timeout'), {
          elapsed,
          maxExecutionTime: finalConfig.maxExecutionTime,
          path: req.path,
          method: req.method,
          requestId: Array.isArray(req.headers['x-request-id']) 
            ? req.headers['x-request-id'][0] 
            : req.headers['x-request-id']
        });
        
        return res.status(508).json({
          error: {
            code: 'MIDDLEWARE_TIMEOUT',
            message: 'Middleware execution time limit exceeded. Possible infinite loop.',
            elapsed,
            maxExecutionTime: finalConfig.maxExecutionTime,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id']
          }
        });
      }
      
      // Log warning if approaching limit
      if (elapsed > finalConfig.maxExecutionTime * 0.8) {
        logger.warn('High middleware execution time', undefined, {
          elapsed,
          maxExecutionTime: finalConfig.maxExecutionTime,
          path: req.path,
          requestId: req.headers['x-request-id']
        });
      }
      
      next();
    } catch (error) {
      logger.error('Error in middleware execution time limit', error);
      next(error);
    }
  };
}

/**
 * Combined loop prevention middleware
 * Applies all loop prevention mechanisms
 */
export function loopPreventionMiddleware(config: Partial<LoopPreventionConfig> = {}) {
  const finalConfig = { ...DEFAULT_LOOP_CONFIG, ...config };
  
  return [
    requestDepthTracking(finalConfig),
    circularRedirectPrevention(),
    middlewareExecutionTimeLimit(finalConfig)
  ];
}

/**
 * Reset loop tracking for a request
 * Useful for testing or specific scenarios
 */
export function resetLoopTracking(req: Request): void {
  const config = DEFAULT_LOOP_CONFIG;
  delete (req as any)[config.trackingKey];
  delete (req as any)._visitedPaths;
  delete (req as any)._middlewareStartTime;
}

export default {
  requestDepthTracking,
  circularRedirectPrevention,
  middlewareExecutionTimeLimit,
  loopPreventionMiddleware,
  resetLoopTracking
};
