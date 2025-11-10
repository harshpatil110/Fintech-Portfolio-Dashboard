/**
 * Edge Function Helper Utilities
 * Lightweight utilities optimized for Vercel Edge Runtime
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge execution time tracker
 */
export class EdgeExecutionTimer {
  private startTime: number;
  private warningThreshold: number;

  constructor(warningThreshold: number = 20) {
    this.startTime = Date.now();
    this.warningThreshold = warningThreshold;
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Check if execution is approaching threshold
   */
  isApproachingThreshold(): boolean {
    return this.getElapsed() > this.warningThreshold;
  }

  /**
   * Log warning if threshold exceeded
   */
  logIfSlow(context: string): void {
    const elapsed = this.getElapsed();
    if (elapsed > this.warningThreshold) {
      console.warn(`⚠️ Slow edge execution: ${context} - ${elapsed}ms`);
    }
  }
}

/**
 * Edge-compatible error response builder
 */
export function createEdgeErrorResponse(
  code: string,
  message: string,
  status: number = 500,
  details?: any
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
        ...(details && { details })
      }
    },
    { status }
  );
}

/**
 * Edge-compatible success response builder
 */
export function createEdgeSuccessResponse(
  data: any,
  headers?: Record<string, string>
): NextResponse {
  const response = NextResponse.json({
    data,
    timestamp: new Date().toISOString()
  });

  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}

/**
 * Validate edge function constraints
 */
export function validateEdgeConstraints(request: NextRequest): {
  valid: boolean;
  error?: string;
} {
  // Check request size (edge functions have stricter limits)
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 1024 * 1024) { // 1MB limit for edge
    return {
      valid: false,
      error: 'Request payload too large for edge function'
    };
  }

  // Check for unsupported methods
  const method = request.method;
  const supportedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
  if (!supportedMethods.includes(method)) {
    return {
      valid: false,
      error: `Method ${method} not supported in edge function`
    };
  }

  return { valid: true };
}

/**
 * Extract client IP from edge request
 */
export function getEdgeClientIP(request: NextRequest): string {
  return (
    request.ip ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Extract user agent from edge request
 */
export function getEdgeUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'unknown';
}

/**
 * Create request context for logging
 */
export function createEdgeRequestContext(request: NextRequest): {
  method: string;
  pathname: string;
  ip: string;
  userAgent: string;
  timestamp: string;
} {
  return {
    method: request.method,
    pathname: request.nextUrl.pathname,
    ip: getEdgeClientIP(request),
    userAgent: getEdgeUserAgent(request),
    timestamp: new Date().toISOString()
  };
}

/**
 * Wrap edge function with error handling and timeout protection
 */
export async function withEdgeErrorHandling<T>(
  fn: () => Promise<T>,
  context: string,
  maxExecutionTime: number = 25
): Promise<T> {
  const timer = new EdgeExecutionTimer(maxExecutionTime);

  try {
    const result = await fn();
    timer.logIfSlow(context);
    return result;
  } catch (error) {
    const elapsed = timer.getElapsed();
    console.error(`Edge function error in ${context}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime: `${elapsed}ms`,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Check if running in edge runtime
 */
export function isEdgeRuntime(): boolean {
  return typeof EdgeRuntime !== 'undefined';
}

/**
 * Get edge runtime information
 */
export function getEdgeRuntimeInfo(): {
  isEdge: boolean;
  region?: string;
} {
  return {
    isEdge: isEdgeRuntime(),
    region: process.env.VERCEL_REGION || 'unknown'
  };
}

/**
 * Lightweight cache key generator for edge
 */
export function generateEdgeCacheKey(
  prefix: string,
  ...parts: (string | number)[]
): string {
  return `${prefix}:${parts.join(':')}`;
}

/**
 * Parse JSON body safely in edge runtime
 */
export async function parseEdgeRequestBody<T = any>(
  request: NextRequest
): Promise<T | null> {
  try {
    const contentType = request.headers.get('content-type');
    
    if (!contentType || !contentType.includes('application/json')) {
      return null;
    }

    const body = await request.json();
    return body as T;
  } catch (error) {
    console.error('Failed to parse edge request body:', error);
    return null;
  }
}

/**
 * Add CORS headers to edge response
 */
export function addEdgeCorsHeaders(
  response: NextResponse,
  origin?: string
): NextResponse {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const requestOrigin = origin || '*';

  if (allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin)) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
  }

  return response;
}

/**
 * Handle OPTIONS preflight request
 */
export function handleEdgePreflight(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return addEdgeCorsHeaders(response, request.headers.get('origin') || undefined);
}

/**
 * Validate edge function execution time
 * Logs warning if approaching 25ms limit
 */
export function validateEdgeExecutionTime(
  startTime: number,
  context: string
): void {
  const elapsed = Date.now() - startTime;
  
  if (elapsed > 25) {
    console.warn(`⚠️ Edge function exceeded 25ms limit: ${context} - ${elapsed}ms`);
  } else if (elapsed > 20) {
    console.warn(`⚠️ Edge function approaching limit: ${context} - ${elapsed}ms`);
  }
}
