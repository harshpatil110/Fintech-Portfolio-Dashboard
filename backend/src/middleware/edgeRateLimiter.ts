/**
 * Edge-compatible rate limiting middleware
 * Optimized for Vercel Edge Runtime with minimal latency
 * Requirements: 10.1, 10.2, 10.3
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * In-memory rate limit store for edge runtime
 * Uses Map with automatic cleanup
 */
class EdgeRateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: number = 60000; // 1 minute
  private lastCleanup: number = Date.now();

  /**
   * Increment counter for a key
   */
  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    this.cleanupIfNeeded();

    const now = Date.now();
    const existing = this.store.get(key);

    if (existing && existing.resetTime > now) {
      // Within window, increment
      existing.count++;
      return existing;
    }

    // New window
    const resetTime = now + windowMs;
    const entry = { count: 1, resetTime };
    this.store.set(key, entry);
    return entry;
  }

  /**
   * Clean up expired entries
   */
  private cleanupIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) {
      return;
    }

    this.lastCleanup = now;
    for (const [key, value] of this.store.entries()) {
      if (value.resetTime <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get current count for a key
   */
  get(key: string): { count: number; resetTime: number } | null {
    const entry = this.store.get(key);
    if (!entry || entry.resetTime <= Date.now()) {
      return null;
    }
    return entry;
  }
}

// Global store instance for edge runtime
const edgeStore = new EdgeRateLimitStore();

/**
 * Edge rate limit configuration
 */
interface EdgeRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

/**
 * Rate limit configurations for different endpoint types
 */
export const EDGE_RATE_LIMITS: Record<string, EdgeRateLimitConfig> = {
  // Portfolio endpoints - 100 req/min
  portfolio: {
    windowMs: 60000,
    maxRequests: 100,
    keyPrefix: 'edge:portfolio'
  },
  // Market data endpoints - 300 req/min
  market: {
    windowMs: 60000,
    maxRequests: 300,
    keyPrefix: 'edge:market'
  },
  // Auth endpoints - 20 req/min (more lenient than backend)
  auth: {
    windowMs: 60000,
    maxRequests: 20,
    keyPrefix: 'edge:auth'
  },
  // General API - 500 req/min
  general: {
    windowMs: 60000,
    maxRequests: 500,
    keyPrefix: 'edge:general'
  }
};

/**
 * Generate rate limit key from request
 */
function generateRateLimitKey(
  request: NextRequest,
  config: EdgeRateLimitConfig
): string {
  // Try to get user ID from header (set by auth middleware)
  const userId = request.headers.get('x-user-id');
  if (userId) {
    return `${config.keyPrefix}:user:${userId}`;
  }

  // Fall back to IP address
  const ip = request.ip || 
             request.headers.get('x-forwarded-for')?.split(',')[0] ||
             request.headers.get('x-real-ip') ||
             'unknown';
  
  return `${config.keyPrefix}:ip:${ip}`;
}

/**
 * Get rate limit config for a path
 */
function getRateLimitConfig(pathname: string): EdgeRateLimitConfig {
  if (pathname.startsWith('/api/portfolio')) {
    return EDGE_RATE_LIMITS.portfolio;
  }
  if (pathname.startsWith('/api/market')) {
    return EDGE_RATE_LIMITS.market;
  }
  if (pathname.startsWith('/api/auth')) {
    return EDGE_RATE_LIMITS.auth;
  }
  return EDGE_RATE_LIMITS.general;
}

/**
 * Lightweight edge rate limiter
 * Executes in <5ms for optimal edge performance
 */
export async function edgeRateLimit(request: NextRequest): Promise<{
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}> {
  const startTime = Date.now();

  try {
    const config = getRateLimitConfig(request.nextUrl.pathname);
    const key = generateRateLimitKey(request, config);

    const result = edgeStore.increment(key, config.windowMs);
    const allowed = result.count <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - result.count);

    const executionTime = Date.now() - startTime;
    
    // Log if execution exceeds 5ms
    if (executionTime > 5) {
      console.warn(`⚠️ Edge rate limit check slow: ${executionTime}ms`);
    }

    return {
      allowed,
      remaining,
      resetTime: result.resetTime,
      retryAfter: allowed ? undefined : Math.ceil((result.resetTime - Date.now()) / 1000)
    };
  } catch (error) {
    console.error('Edge rate limit error:', error);
    // Fail open - allow request if rate limiting fails
    return {
      allowed: true,
      remaining: 0,
      resetTime: Date.now() + 60000
    };
  }
}

/**
 * Edge rate limiting middleware
 * Returns 429 if rate limit is exceeded
 */
export async function edgeRateLimitMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const result = await edgeRateLimit(request);

  // Add rate limit headers
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', String(result.remaining + (result.allowed ? 1 : 0)));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

  if (!result.allowed) {
    if (result.retryAfter) {
      headers.set('Retry-After', String(result.retryAfter));
    }

    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          retryAfter: result.retryAfter ? `${result.retryAfter} seconds` : 'later',
          resetTime: new Date(result.resetTime).toISOString(),
          timestamp: new Date().toISOString()
        }
      },
      { status: 429, headers }
    );
  }

  return null; // Allow request to proceed
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: { remaining: number; resetTime: number }
): NextResponse {
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
  return response;
}
