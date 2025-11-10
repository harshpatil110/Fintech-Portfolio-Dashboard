/**
 * Vercel Edge Middleware
 * Runs on Vercel Edge Network before requests reach API functions
 * Optimized for <25ms execution time
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  edgeAuthMiddleware, 
  isPublicRoute, 
  optionalEdgeAuth 
} from './backend/src/middleware/edgeAuth';
import { 
  edgeRateLimitMiddleware, 
  edgeRateLimit,
  addRateLimitHeaders 
} from './backend/src/middleware/edgeRateLimiter';
import {
  withEdgeTimeout,
  handleEdgeMiddlewareError,
  validateEdgeRuntimeConstraints,
  EdgeTimeoutHandler
} from './backend/src/middleware/edgeErrorHandler';

/**
 * Paths that should be processed by edge middleware
 */
const API_PATHS = ['/api'];

/**
 * Paths that should skip middleware entirely
 */
const SKIP_PATHS = [
  '/_next',
  '/static',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml'
];

/**
 * Main edge middleware function
 * Executes authentication and rate limiting checks with error handling
 */
export async function middleware(request: NextRequest) {
  const startTime = Date.now();
  const { pathname } = request.nextUrl;
  const timeoutHandler = new EdgeTimeoutHandler(25);

  try {
    // Skip middleware for static assets and Next.js internals
    if (SKIP_PATHS.some(path => pathname.startsWith(path))) {
      return NextResponse.next();
    }

    // Only process API requests
    if (!API_PATHS.some(path => pathname.startsWith(path))) {
      return NextResponse.next();
    }

    // Validate edge runtime constraints
    try {
      validateEdgeRuntimeConstraints(request);
    } catch (error) {
      return handleEdgeMiddlewareError(error as Error, request);
    }

    // Wrap middleware execution with timeout protection
    return await withEdgeTimeout(
      async () => {
        // 1. Rate Limiting (always check, even for public routes)
        timeoutHandler.checkTimeout();
        const rateLimitResponse = await edgeRateLimitMiddleware(request);
        if (rateLimitResponse) {
          logMiddlewareExecution(pathname, Date.now() - startTime, 'rate_limited');
          return rateLimitResponse;
        }

        // 2. Authentication Check
        timeoutHandler.checkTimeout();
        let authHeaders = request.headers;
        
        if (isPublicRoute(pathname)) {
          // Optional auth for public routes
          authHeaders = await optionalEdgeAuth(request);
        } else {
          // Required auth for protected routes
          const authResponse = await edgeAuthMiddleware(request);
          if (authResponse) {
            logMiddlewareExecution(pathname, Date.now() - startTime, 'unauthorized');
            return authResponse;
          }
          authHeaders = await optionalEdgeAuth(request);
        }

        // 3. Create response with updated headers
        const response = NextResponse.next({
          request: {
            headers: authHeaders
          }
        });

        // Add rate limit info to response headers
        const rateLimitInfo = await edgeRateLimit(request);
        addRateLimitHeaders(response, rateLimitInfo);

        // Add execution time header
        const executionTime = Date.now() - startTime;
        response.headers.set('X-Edge-Execution-Time', `${executionTime}ms`);

        // Log slow middleware execution
        if (executionTime > 25) {
          console.warn(`⚠️ Edge middleware slow: ${pathname} - ${executionTime}ms (threshold: 25ms)`);
        }

        logMiddlewareExecution(pathname, executionTime, 'success');
        return response;
      },
      25, // 25ms timeout
      () => {
        // Fallback: allow request to proceed if timeout occurs
        console.warn(`⚠️ Edge middleware timeout on ${pathname}, using fallback`);
        const response = NextResponse.next();
        response.headers.set('X-Edge-Middleware-Timeout', 'true');
        response.headers.set('X-Edge-Execution-Time', `${Date.now() - startTime}ms`);
        logMiddlewareExecution(pathname, Date.now() - startTime, 'timeout');
        return response;
      }
    );

  } catch (error) {
    // Graceful fallback - allow request to proceed if middleware fails
    const executionTime = Date.now() - startTime;
    logMiddlewareExecution(pathname, executionTime, 'error');

    // Use error handler to determine response
    return handleEdgeMiddlewareError(error as Error, request);
  }
}

/**
 * Log middleware execution for monitoring
 */
function logMiddlewareExecution(
  pathname: string,
  executionTime: number,
  status: 'success' | 'rate_limited' | 'unauthorized' | 'error' | 'timeout'
): void {
  // Only log in development or if execution is slow/failed
  if (process.env.NODE_ENV === 'development' || executionTime > 25 || status !== 'success') {
    console.log({
      type: 'edge_middleware',
      pathname,
      executionTime: `${executionTime}ms`,
      status,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Middleware configuration
 * Specifies which paths should be processed by this middleware
 */
export const config = {
  matcher: [
    /*
     * Match all API routes
     * Exclude:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     */
    '/api/:path*'
  ]
};
