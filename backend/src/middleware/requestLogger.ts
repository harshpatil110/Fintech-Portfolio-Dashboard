import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * Generate a simple request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Middleware to add request ID to all requests
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID or generate new one
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

/**
 * Middleware to log all HTTP requests
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Log request start
  const context = logger.extractRequestContext(req);
  logger.info(`Incoming request: ${req.method} ${req.path}`, context);

  // Capture response
  const originalSend = res.send;
  res.send = function (data: any): Response {
    const executionTime = Date.now() - startTime;
    
    // Log request completion
    logger.logRequest(req, res.statusCode, executionTime);
    
    // Log slow requests
    if (executionTime > 5000) {
      logger.warn(`Slow request detected: ${req.method} ${req.path}`, context, {
        executionTime,
        threshold: 5000
      });
    }
    
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Combined request logging middleware
 */
export function requestLogging() {
  return [requestIdMiddleware, requestLoggerMiddleware];
}

export default requestLogging;
