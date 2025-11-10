import { Request, Response, NextFunction } from 'express';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    timestamp: string;
    requestId?: string;
    details?: any;
  };
}

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Specific error types
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class TimeoutError extends AppError {
  constructor(message: string = 'Request timeout') {
    super(message, 504, 'TIMEOUT_ERROR');
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string = 'Payload too large') {
    super(message, 413, 'PAYLOAD_TOO_LARGE');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string = 'External service error') {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR');
  }
}

/**
 * Error Handler utility class
 */
export class ErrorHandler {
  /**
   * Handle errors and return standardized response
   */
  static handle(error: any, req: Request): ErrorResponse {
    const errorResponse = this.buildErrorResponse(error, req);
    
    // Log error
    this.logError(error, req, errorResponse);
    
    return errorResponse;
  }

  /**
   * Build standardized error response
   */
  private static buildErrorResponse(error: any, req: Request): ErrorResponse {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return {
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: this.sanitizeMessage(error.message || 'An unexpected error occurred'),
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || undefined,
        details: isDevelopment ? {
          stack: error.stack,
          name: error.name
        } : undefined
      }
    };
  }

  /**
   * Sanitize error messages to prevent information leakage
   */
  private static sanitizeMessage(message: string): string {
    // Remove sensitive information from error messages
    return message
      .replace(/password|token|secret|key|authorization/gi, '[REDACTED]')
      .replace(/\b\d{16}\b/g, '[CARD]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  }

  /**
   * Get appropriate status code for error
   */
  static getStatusCode(error: any): number {
    if (error.statusCode) return error.statusCode;
    if (error instanceof AppError) return error.statusCode;
    if (error.name === 'ValidationError') return 400;
    if (error.name === 'UnauthorizedError') return 401;
    if (error.name === 'ForbiddenError') return 403;
    if (error.name === 'NotFoundError') return 404;
    if (error.name === 'TimeoutError') return 504;
    if (error.name === 'PayloadTooLargeError') return 413;
    if (error.name === 'RateLimitError') return 429;
    return 500;
  }

  /**
   * Log error with context
   */
  private static logError(error: any, req: Request, response: ErrorResponse): void {
    const logData = {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
        statusCode: this.getStatusCode(error)
      },
      request: {
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
          'x-request-id': req.headers['x-request-id']
        },
        ip: req.ip,
        requestId: response.error.requestId
      },
      timestamp: response.error.timestamp
    };

    // Log based on severity
    if (this.getStatusCode(error) >= 500) {
      console.error('❌ Server Error:', JSON.stringify(logData, null, 2));
    } else if (this.getStatusCode(error) >= 400) {
      console.warn('⚠️  Client Error:', JSON.stringify(logData, null, 2));
    } else {
      console.log('ℹ️  Error:', JSON.stringify(logData, null, 2));
    }
  }

  /**
   * Express error handling middleware
   */
  static middleware() {
    return (error: any, req: Request, res: Response, next: NextFunction) => {
      const errorResponse = ErrorHandler.handle(error, req);
      const statusCode = ErrorHandler.getStatusCode(error);
      
      res.status(statusCode).json(errorResponse);
    };
  }

  /**
   * Async handler wrapper to catch errors in async route handlers
   */
  static asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

/**
 * Helper function to wrap async route handlers
 */
export const asyncHandler = ErrorHandler.asyncHandler;

export default ErrorHandler;
