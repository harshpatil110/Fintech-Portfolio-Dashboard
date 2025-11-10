import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Route parameter validation configuration
 */
interface RouteParamConfig {
  pattern: RegExp;
  errorMessage: string;
}

/**
 * Common route parameter patterns
 */
const PARAM_PATTERNS: Record<string, RouteParamConfig> = {
  userId: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    errorMessage: 'Invalid user ID format. Expected UUID.'
  },
  symbol: {
    pattern: /^[A-Z]{1,5}$/,
    errorMessage: 'Invalid stock symbol. Expected 1-5 uppercase letters.'
  },
  id: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    errorMessage: 'Invalid ID format. Expected UUID.'
  },
  positionId: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    errorMessage: 'Invalid position ID format. Expected UUID.'
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    errorMessage: 'Invalid email format.'
  }
};

/**
 * Redirect loop detection configuration
 */
interface RedirectLoopConfig {
  maxRedirects: number;
  trackingHeader: string;
}

const DEFAULT_REDIRECT_CONFIG: RedirectLoopConfig = {
  maxRedirects: 5,
  trackingHeader: 'X-Redirect-Count'
};

/**
 * Middleware to validate route parameters
 */
export function validateRouteParams(paramValidations?: Record<string, RouteParamConfig>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validations = paramValidations || PARAM_PATTERNS;
      
      // Validate each parameter in the route
      for (const [paramName, paramValue] of Object.entries(req.params)) {
        const validation = validations[paramName];
        
        if (validation) {
          if (!validation.pattern.test(paramValue)) {
            const requestId = Array.isArray(req.headers['x-request-id']) 
              ? req.headers['x-request-id'][0] 
              : req.headers['x-request-id'];
            
            logger.warn('Route parameter validation failed', {
              path: req.path,
              requestId
            }, {
              param: paramName,
              value: paramValue
            });
            
            return res.status(400).json({
              error: {
                code: 'INVALID_PARAMETER',
                message: validation.errorMessage,
                parameter: paramName,
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id']
              }
            });
          }
        }
      }
      
      next();
    } catch (error) {
      logger.error('Error in route parameter validation', error);
      next(error);
    }
  };
}

/**
 * Middleware to detect and prevent redirect loops
 */
export function detectRedirectLoop(config: Partial<RedirectLoopConfig> = {}) {
  const finalConfig = { ...DEFAULT_REDIRECT_CONFIG, ...config };
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Track redirect count
      const redirectCount = parseInt(req.headers[finalConfig.trackingHeader.toLowerCase()] as string || '0', 10);
      
      if (redirectCount >= finalConfig.maxRedirects) {
        const requestId = Array.isArray(req.headers['x-request-id']) 
          ? req.headers['x-request-id'][0] 
          : req.headers['x-request-id'];
        
        logger.error('Redirect loop detected', new Error('Too many redirects'), {
          path: req.path,
          requestId
        }, {
          redirectCount,
          maxRedirects: finalConfig.maxRedirects
        });
        
        return res.status(508).json({
          error: {
            code: 'REDIRECT_LOOP_DETECTED',
            message: `Too many redirects (${redirectCount}). Possible infinite loop detected.`,
            maxRedirects: finalConfig.maxRedirects,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id']
          }
        });
      }
      
      // Increment redirect count for next hop
      res.setHeader(finalConfig.trackingHeader, (redirectCount + 1).toString());
      
      // Override res.redirect to track redirects
      const originalRedirect = res.redirect.bind(res);
      (res as any).redirect = function(statusOrUrl: number | string, url?: string) {
        const newCount = redirectCount + 1;
        const requestId = Array.isArray(req.headers['x-request-id']) 
          ? req.headers['x-request-id'][0] 
          : req.headers['x-request-id'];
        
        if (newCount >= finalConfig.maxRedirects) {
          logger.error('Redirect loop prevented', new Error('Max redirects reached'), {
            path: req.path,
            requestId
          }, {
            redirectCount: newCount,
            maxRedirects: finalConfig.maxRedirects
          });
          
          return res.status(508).json({
            error: {
              code: 'REDIRECT_LOOP_PREVENTED',
              message: 'Redirect prevented to avoid infinite loop.',
              timestamp: new Date().toISOString(),
              requestId
            }
          });
        }
        
        // Set header for tracking
        res.setHeader(finalConfig.trackingHeader, newCount.toString());
        
        // Call original redirect
        if (typeof statusOrUrl === 'number') {
          return originalRedirect(statusOrUrl, url!);
        } else {
          return originalRedirect(statusOrUrl);
        }
      };
      
      next();
    } catch (error) {
      logger.error('Error in redirect loop detection', error);
      next(error);
    }
  };
}

/**
 * Enhanced 404 handler with helpful messages
 */
export function notFoundHandler(req: Request, res: Response) {
  const path = req.path;
  const method = req.method;
  
  // Provide helpful suggestions based on the path
  const suggestions = generateSuggestions(path, method);
  
  const requestId = Array.isArray(req.headers['x-request-id']) 
    ? req.headers['x-request-id'][0] 
    : req.headers['x-request-id'];
  
  const userAgent = Array.isArray(req.headers['user-agent']) 
    ? req.headers['user-agent'][0] 
    : req.headers['user-agent'];
  
  logger.warn('Route not found', {
    method,
    path,
    query: req.query,
    requestId,
    userAgent
  });
  
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${method} ${path}`,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      availableEndpoints: suggestions.length === 0 ? getAvailableEndpoints() : undefined,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id']
    }
  });
}

/**
 * Generate helpful suggestions for similar routes
 */
function generateSuggestions(path: string, method: string): string[] {
  const suggestions: string[] = [];
  
  // Common API routes
  const apiRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/users/profile',
    '/api/market/quote/:symbol',
    '/api/market/search',
    '/api/portfolio/:userId',
    '/api/watchlist/:userId',
    '/api/monitoring/health'
  ];
  
  // Check for common mistakes
  if (path.startsWith('/auth') && !path.startsWith('/api/auth')) {
    suggestions.push('Did you mean /api/auth/* ?');
  }
  
  if (path.startsWith('/users') && !path.startsWith('/api/users')) {
    suggestions.push('Did you mean /api/users/* ?');
  }
  
  if (path.startsWith('/market') && !path.startsWith('/api/market')) {
    suggestions.push('Did you mean /api/market/* ?');
  }
  
  if (path.startsWith('/portfolio') && !path.startsWith('/api/portfolio')) {
    suggestions.push('Did you mean /api/portfolio/* ?');
  }
  
  if (path.startsWith('/watchlist') && !path.startsWith('/api/watchlist')) {
    suggestions.push('Did you mean /api/watchlist/* ?');
  }
  
  // Check for typos in common endpoints
  if (path.includes('/login') && method === 'POST') {
    suggestions.push('POST /api/auth/login');
  }
  
  if (path.includes('/register') && method === 'POST') {
    suggestions.push('POST /api/auth/register');
  }
  
  if (path.includes('/profile') && method === 'GET') {
    suggestions.push('GET /api/users/profile');
  }
  
  if (path.includes('/quote') && method === 'GET') {
    suggestions.push('GET /api/market/quote/:symbol');
  }
  
  // Check for missing trailing slash or extra trailing slash
  if (path.endsWith('/')) {
    const withoutSlash = path.slice(0, -1);
    suggestions.push(`Try without trailing slash: ${method} ${withoutSlash}`);
  } else {
    const withSlash = path + '/';
    suggestions.push(`Try with trailing slash: ${method} ${withSlash}`);
  }
  
  return suggestions.slice(0, 3); // Limit to 3 suggestions
}

/**
 * Get available API endpoints
 */
function getAvailableEndpoints(): Record<string, string[]> {
  return {
    auth: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/change-password'
    ],
    users: [
      'GET /api/users/profile',
      'PUT /api/users/profile',
      'GET /api/users/preferences',
      'PUT /api/users/preferences'
    ],
    market: [
      'GET /api/market/quote/:symbol',
      'POST /api/market/quotes',
      'GET /api/market/search',
      'GET /api/market/history/:symbol'
    ],
    portfolio: [
      'GET /api/portfolio/:userId',
      'POST /api/portfolio/position',
      'PUT /api/portfolio/position/:id',
      'DELETE /api/portfolio/position/:id'
    ],
    watchlist: [
      'GET /api/watchlist/:userId',
      'POST /api/watchlist',
      'DELETE /api/watchlist/:userId/:symbol'
    ],
    monitoring: [
      'GET /api/monitoring/health',
      'GET /api/monitoring/stats'
    ]
  };
}

/**
 * Validate specific route parameters with custom patterns
 */
export function validateParam(paramName: string, pattern: RegExp, errorMessage: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const paramValue = req.params[paramName];
    
    if (!paramValue) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PARAMETER',
          message: `Missing required parameter: ${paramName}`,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id']
        }
      });
    }
    
    if (!pattern.test(paramValue)) {
      const requestId = Array.isArray(req.headers['x-request-id']) 
        ? req.headers['x-request-id'][0] 
        : req.headers['x-request-id'];
      
      logger.warn('Parameter validation failed', {
        path: req.path,
        requestId
      }, {
        param: paramName,
        value: paramValue
      });
      
      return res.status(400).json({
        error: {
          code: 'INVALID_PARAMETER',
          message: errorMessage,
          parameter: paramName,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id']
        }
      });
    }
    
    next();
  };
}

export default {
  validateRouteParams,
  detectRedirectLoop,
  notFoundHandler,
  validateParam,
  PARAM_PATTERNS
};
