import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Security middleware for CSRF protection, security headers, and request logging
 */

// CSRF token storage (in production, use Redis or database)
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();

/**
 * Generate CSRF token
 */
export const generateCsrfToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * CSRF token generation endpoint middleware
 */
export const getCsrfToken = (req: Request, res: Response): void => {
  const token = generateCsrfToken();
  const userId = (req as any).user?.userId || req.ip || 'anonymous';
  
  // Store token with 1 hour expiration
  csrfTokens.set(userId, {
    token,
    expiresAt: Date.now() + 60 * 60 * 1000 // 1 hour
  });
  
  res.json({
    csrfToken: token,
    expiresIn: 3600
  });
};

/**
 * CSRF protection middleware
 * Validates CSRF token for state-changing operations (POST, PUT, DELETE, PATCH)
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF check for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Skip CSRF check for auth endpoints (they use other protection mechanisms)
  if (req.path.startsWith('/api/auth/')) {
    next();
    return;
  }

  const userId = (req as any).user?.userId || req.ip || 'anonymous';
  const token = req.headers['x-csrf-token'] as string;

  if (!token) {
    res.status(403).json({
      error: {
        code: 'CSRF_TOKEN_MISSING',
        message: 'CSRF token is required for this operation',
        timestamp: new Date()
      }
    });
    return;
  }

  const storedTokenData = csrfTokens.get(userId);

  if (!storedTokenData) {
    res.status(403).json({
      error: {
        code: 'CSRF_TOKEN_INVALID',
        message: 'Invalid or expired CSRF token',
        timestamp: new Date()
      }
    });
    return;
  }

  // Check if token is expired
  if (Date.now() > storedTokenData.expiresAt) {
    csrfTokens.delete(userId);
    res.status(403).json({
      error: {
        code: 'CSRF_TOKEN_EXPIRED',
        message: 'CSRF token has expired',
        timestamp: new Date()
      }
    });
    return;
  }

  // Validate token
  if (token !== storedTokenData.token) {
    res.status(403).json({
      error: {
        code: 'CSRF_TOKEN_INVALID',
        message: 'Invalid CSRF token',
        timestamp: new Date()
      }
    });
    return;
  }

  next();
};

/**
 * Enhanced security headers middleware
 * Adds comprehensive security headers to all responses
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' wss: ws:; " +
    "frame-ancestors 'none';"
  );

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=()'
  );

  // Strict Transport Security (HSTS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Remove powered by header
  res.removeHeader('X-Powered-By');

  next();
};

/**
 * Request logging middleware for security monitoring
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  // Add request ID to request object
  (req as any).requestId = requestId;

  // Log request details
  const logData = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: (req as any).user?.userId || 'anonymous'
  };

  console.log('[REQUEST]', JSON.stringify(logData));

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const responseLog = {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as any).user?.userId || 'anonymous'
    };

    // Log errors separately
    if (res.statusCode >= 400) {
      console.error('[RESPONSE_ERROR]', JSON.stringify(responseLog));
    } else {
      console.log('[RESPONSE]', JSON.stringify(responseLog));
    }
  });

  next();
};

/**
 * Error response handler with proper error sanitization
 */
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  const requestId = (req as any).requestId || 'unknown';
  
  // Log the full error for debugging
  console.error('[ERROR]', {
    requestId,
    timestamp: new Date().toISOString(),
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.userId || 'anonymous'
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Sanitize error message for production
  let errorMessage = 'An unexpected error occurred';
  let errorCode = 'INTERNAL_SERVER_ERROR';

  if (process.env.NODE_ENV === 'development') {
    errorMessage = err.message || errorMessage;
    errorCode = err.code || errorCode;
  } else {
    // In production, only expose safe error messages
    if (statusCode < 500) {
      errorMessage = err.message || errorMessage;
      errorCode = err.code || errorCode;
    }
  }

  // Send error response
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: errorMessage,
      requestId,
      timestamp: new Date()
    }
  });
};

/**
 * Validate request origin middleware
 */
export const validateOrigin = (req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000').split(',');

  // Allow requests without origin (e.g., same-origin, Postman, curl)
  if (!origin) {
    next();
    return;
  }

  // Check if origin is allowed
  if (allowedOrigins.includes(origin)) {
    next();
    return;
  }

  // Log suspicious request
  console.warn('[SECURITY]', {
    type: 'INVALID_ORIGIN',
    origin,
    ip: req.ip,
    path: req.path,
    timestamp: new Date().toISOString()
  });

  res.status(403).json({
    error: {
      code: 'INVALID_ORIGIN',
      message: 'Request origin is not allowed',
      timestamp: new Date()
    }
  });
};

/**
 * Prevent parameter pollution
 */
export const preventParameterPollution = (req: Request, res: Response, next: NextFunction): void => {
  // Check for duplicate query parameters
  const queryKeys = Object.keys(req.query);
  const uniqueKeys = new Set(queryKeys);

  if (queryKeys.length !== uniqueKeys.size) {
    res.status(400).json({
      error: {
        code: 'PARAMETER_POLLUTION',
        message: 'Duplicate query parameters are not allowed',
        timestamp: new Date()
      }
    });
    return;
  }

  next();
};

/**
 * Clean up expired CSRF tokens periodically
 */
export const cleanupCsrfTokens = (): void => {
  const now = Date.now();
  for (const [userId, tokenData] of csrfTokens.entries()) {
    if (now > tokenData.expiresAt) {
      csrfTokens.delete(userId);
    }
  }
};

// Run cleanup every 10 minutes
setInterval(cleanupCsrfTokens, 10 * 60 * 1000);
