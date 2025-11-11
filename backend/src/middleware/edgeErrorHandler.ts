/**
 * Edge Function Error Handler
 * Graceful error handling and fallback for edge runtime
 * Requirements: 10.4, 10.5
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge error types
 */
export enum EdgeErrorType {
  TIMEOUT = 'TIMEOUT',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Edge error class
 */
export class EdgeError extends Error {
  public readonly type: EdgeErrorType;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(
    type: EdgeErrorType,
    message: string,
    statusCode: number = 500,
    details?: any
  ) {
    super(message);
    this.name = 'EdgeError';
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Edge error response format
 */
interface EdgeErrorResponse {
  error: {
    code: string;
    message: string;
    type: EdgeErrorType;
    timestamp: string;
    requestId?: string;
    details?: any;
  };
}

/**
 * Create standardized edge error response
 */
export function createEdgeErrorResponse(
  error: EdgeError | Error,
  request?: NextRequest
): NextResponse {
  const isEdgeError = error instanceof EdgeError;
  
  const errorResponse: EdgeErrorResponse = {
    error: {
      code: isEdgeError ? error.type : EdgeErrorType.UNKNOWN_ERROR,
      message: sanitizeErrorMessage(error.message),
      type: isEdgeError ? error.type : EdgeErrorType.UNKNOWN_ERROR,
      timestamp: new Date().toISOString(),
      requestId: request?.headers.get('x-request-id') || undefined,
      details: isEdgeError && error.details ? error.details : undefined
    }
  };

  const statusCode = isEdgeError ? error.statusCode : 500;

  // Log error
  logEdgeError(error, request, statusCode);

  return NextResponse.json(errorResponse, { 
    status: statusCode,
    headers: {
      'X-Edge-Error': 'true',
      'X-Error-Type': errorResponse.error.type
    }
  });
}

/**
 * Sanitize error message to prevent information leakage
 */
export function sanitizeErrorMessage(message: string): string {
  // Remove sensitive patterns
  return message
    .replace(/password|token|secret|key|api[_-]?key/gi, '[REDACTED]')
    .replace(/\b\d{16}\b/g, '[CARD]')
    .replace(/Bearer\s+[\w-]+\.[\w-]+\.[\w-]+/gi, 'Bearer [TOKEN]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
}

/**
 * Log edge error for monitoring
 */
function logEdgeError(
  error: Error,
  request: NextRequest | undefined,
  statusCode: number
): void {
  const logEntry = {
    type: 'edge_error',
    error: {
      name: error.name,
      message: error.message,
      type: error instanceof EdgeError ? error.type : EdgeErrorType.UNKNOWN_ERROR,
      statusCode
    },
    request: request ? {
      method: request.method,
      pathname: request.nextUrl.pathname,
      ip: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown'
    } : undefined,
    timestamp: new Date().toISOString()
  };

  console.error('Edge function error:', logEntry);
}

/**
 * Wrap edge function with error handling
 */
export async function withEdgeErrorHandling<T>(
  fn: () => Promise<T>,
  fallback?: () => T | Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`Edge function error${context ? ` in ${context}` : ''}:`, error);

    // Use fallback if provided
    if (fallback) {
      try {
        return await Promise.resolve(fallback());
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        throw error; // Throw original error
      }
    }

    throw error;
  }
}

/**
 * Graceful fallback handler for edge middleware
 * Returns a pass-through response when middleware fails
 */
export function createFallbackResponse(
  request: NextRequest,
  error: Error
): NextResponse {
  console.warn('Edge middleware failed, using fallback:', {
    error: error.message,
    pathname: request.nextUrl.pathname,
    timestamp: new Date().toISOString()
  });

  // Create pass-through response with error indicator
  const response = NextResponse.next();
  response.headers.set('X-Edge-Middleware-Fallback', 'true');
  response.headers.set('X-Edge-Error-Type', 
    error instanceof EdgeError ? error.type : EdgeErrorType.UNKNOWN_ERROR
  );

  return response;
}

/**
 * Validate edge runtime constraints
 */
export function validateEdgeRuntimeConstraints(request: NextRequest): void {
  // Check payload size (1MB limit for edge)
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 1024 * 1024) {
    throw new EdgeError(
      EdgeErrorType.CONSTRAINT_VIOLATION,
      'Request payload exceeds edge function limit (1MB)',
      413,
      { maxSize: '1MB', actualSize: contentLength }
    );
  }

  // Check for unsupported features
  const contentType = request.headers.get('content-type');
  if (contentType?.includes('multipart/form-data')) {
    throw new EdgeError(
      EdgeErrorType.CONSTRAINT_VIOLATION,
      'Multipart form data not supported in edge functions',
      400
    );
  }
}

/**
 * Edge timeout handler
 */
export class EdgeTimeoutHandler {
  private startTime: number;
  private maxExecutionTime: number;

  constructor(maxExecutionTime: number = 25) {
    this.startTime = Date.now();
    this.maxExecutionTime = maxExecutionTime;
  }

  /**
   * Check if approaching timeout
   */
  isApproachingTimeout(): boolean {
    const elapsed = Date.now() - this.startTime;
    return elapsed > this.maxExecutionTime * 0.8; // 80% threshold
  }

  /**
   * Check if timeout exceeded
   */
  isTimeout(): boolean {
    const elapsed = Date.now() - this.startTime;
    return elapsed > this.maxExecutionTime;
  }

  /**
   * Get remaining time
   */
  getRemainingTime(): number {
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.maxExecutionTime - elapsed);
  }

  /**
   * Throw timeout error if exceeded
   */
  checkTimeout(): void {
    if (this.isTimeout()) {
      throw new EdgeError(
        EdgeErrorType.TIMEOUT,
        `Edge function timeout (${this.maxExecutionTime}ms exceeded)`,
        504,
        { maxExecutionTime: this.maxExecutionTime }
      );
    }
  }
}

/**
 * Wrap edge function with timeout protection
 */
export async function withEdgeTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 25,
  fallback?: () => T | Promise<T>
): Promise<T> {
  const timer = new EdgeTimeoutHandler(timeoutMs);

  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new EdgeError(
        EdgeErrorType.TIMEOUT,
        `Edge function timeout after ${timeoutMs}ms`,
        504
      ));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } catch (error) {
    if (error instanceof EdgeError && error.type === EdgeErrorType.TIMEOUT) {
      console.warn('Edge function timeout, using fallback');
      if (fallback) {
        return await Promise.resolve(fallback());
      }
    }
    throw error;
  }
}

/**
 * Circuit breaker for edge functions
 * Prevents cascading failures
 */
export class EdgeCircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly threshold: number;
  private readonly resetTimeout: number;

  constructor(threshold: number = 5, resetTimeout: number = 30000) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback: () => T | Promise<T>
  ): Promise<T> {
    // Check if circuit should be reset
    if (this.state === 'OPEN' && this.shouldReset()) {
      this.state = 'HALF_OPEN';
      this.failures = 0;
    }

    // If circuit is open, use fallback
    if (this.state === 'OPEN') {
      console.warn('Circuit breaker OPEN, using fallback');
      return await Promise.resolve(fallback());
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      // Use fallback if circuit is now open
      if (this.state === 'OPEN') {
        console.warn('Circuit breaker opened after failure, using fallback');
        return await Promise.resolve(fallback());
      }
      
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      console.warn(`Circuit breaker OPEN after ${this.failures} failures`);
    }
  }

  private shouldReset(): boolean {
    return Date.now() - this.lastFailureTime > this.resetTimeout;
  }

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }
}

/**
 * Retry handler for edge functions
 */
export async function withEdgeRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 2,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on client errors (4xx)
      if (error instanceof EdgeError && error.statusCode >= 400 && error.statusCode < 500) {
        throw error;
      }

      // Wait before retry (except on last attempt)
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

/**
 * Health check for edge functions
 */
export function createEdgeHealthCheck(): NextResponse {
  return NextResponse.json({
    status: 'healthy',
    edge: true,
    timestamp: new Date().toISOString(),
    region: process.env.VERCEL_REGION || 'unknown'
  });
}

/**
 * Validate edge function execution constraints
 * Requirement 10.2: Avoid heavy computations in edge functions
 */
export function validateEdgeExecutionTime(
  startTime: number,
  maxTime: number = 25,
  context?: string
): void {
  const elapsed = Date.now() - startTime;
  
  if (elapsed > maxTime) {
    console.warn(`⚠️ Edge function exceeded time limit: ${elapsed}ms (max: ${maxTime}ms)${context ? ` in ${context}` : ''}`);
    
    throw new EdgeError(
      EdgeErrorType.TIMEOUT,
      `Edge function execution time exceeded (${elapsed}ms > ${maxTime}ms)`,
      504,
      { elapsed, maxTime, context }
    );
  }
}

/**
 * Safe edge function wrapper with comprehensive error handling
 * Requirement 10.4: Graceful fallback when edge function fails
 * Requirement 10.5: Lightweight authentication checks
 */
export async function safeEdgeExecution<T>(
  fn: () => Promise<T>,
  options: {
    fallback?: () => T | Promise<T>;
    timeout?: number;
    context?: string;
    retries?: number;
  } = {}
): Promise<T> {
  const {
    fallback,
    timeout = 25,
    context,
    retries = 0
  } = options;

  try {
    // Wrap with timeout protection
    const result = await withEdgeTimeout(fn, timeout, fallback);
    return result;
  } catch (error) {
    console.error(`Edge function error${context ? ` in ${context}` : ''}:`, error);

    // Try fallback if available
    if (fallback) {
      try {
        console.log(`Using fallback${context ? ` for ${context}` : ''}`);
        return await Promise.resolve(fallback());
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }

    // Retry if configured
    if (retries > 0) {
      console.log(`Retrying${context ? ` ${context}` : ''} (${retries} attempts remaining)`);
      return safeEdgeExecution(fn, {
        ...options,
        retries: retries - 1
      });
    }

    throw error;
  }
}

/**
 * Monitor edge function performance
 */
export class EdgePerformanceMonitor {
  private metrics: Map<string, { count: number; totalTime: number; errors: number }> = new Map();

  /**
   * Record execution time for a function
   */
  record(name: string, executionTime: number, error: boolean = false): void {
    const existing = this.metrics.get(name) || { count: 0, totalTime: 0, errors: 0 };
    
    existing.count++;
    existing.totalTime += executionTime;
    if (error) {
      existing.errors++;
    }

    this.metrics.set(name, existing);

    // Log warning if average time exceeds threshold
    const avgTime = existing.totalTime / existing.count;
    if (avgTime > 20) {
      console.warn(`⚠️ Edge function ${name} average time: ${avgTime.toFixed(2)}ms (threshold: 20ms)`);
    }

    // Log warning if error rate is high
    const errorRate = existing.errors / existing.count;
    if (errorRate > 0.05) {
      console.warn(`⚠️ Edge function ${name} error rate: ${(errorRate * 100).toFixed(2)}% (threshold: 5%)`);
    }
  }

  /**
   * Get metrics for a function
   */
  getMetrics(name: string): { count: number; avgTime: number; errorRate: number } | null {
    const metrics = this.metrics.get(name);
    if (!metrics) return null;

    return {
      count: metrics.count,
      avgTime: metrics.totalTime / metrics.count,
      errorRate: metrics.errors / metrics.count
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, { count: number; avgTime: number; errorRate: number }> {
    const result: Record<string, { count: number; avgTime: number; errorRate: number }> = {};
    
    for (const [name, metrics] of this.metrics.entries()) {
      result[name] = {
        count: metrics.count,
        avgTime: metrics.totalTime / metrics.count,
        errorRate: metrics.errors / metrics.count
      };
    }

    return result;
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.metrics.clear();
  }
}

// Global performance monitor instance
export const edgePerformanceMonitor = new EdgePerformanceMonitor();

/**
 * Handle edge function errors in middleware
 * Requirement 10.4: Allow request to proceed when edge function fails
 */
export function handleEdgeMiddlewareError(
  error: Error,
  request: NextRequest
): NextResponse {
  // For critical errors that should block the request, return error response
  if (error instanceof EdgeError) {
    // Constraint violations (payload too large, unsupported features)
    if (error.type === EdgeErrorType.CONSTRAINT_VIOLATION) {
      return createEdgeErrorResponse(error, request);
    }
    
    // Authentication errors on protected routes
    if (error.type === EdgeErrorType.AUTHENTICATION_ERROR && !isPublicRoute(request.nextUrl.pathname)) {
      return createEdgeErrorResponse(error, request);
    }
    
    // Rate limit errors should be enforced
    if (error.type === EdgeErrorType.RATE_LIMIT_ERROR) {
      return createEdgeErrorResponse(error, request);
    }
  }

  // For non-critical errors (timeouts, runtime errors), fail open with fallback
  // This ensures the application remains available even if edge middleware fails
  return createFallbackResponse(request, error);
}

/**
 * Check if route is public (doesn't require authentication)
 */
function isPublicRoute(pathname: string): boolean {
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/health',
    '/api/monitoring/health'
  ];
  return publicRoutes.some(route => pathname.startsWith(route));
}
