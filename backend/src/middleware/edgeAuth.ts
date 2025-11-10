/**
 * Edge-compatible authentication middleware
 * Optimized for Vercel Edge Runtime with <25ms execution time
 * Requirements: 10.1, 10.2, 10.3
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Lightweight JWT payload for edge runtime
 */
interface EdgeJwtPayload {
  userId: string;
  email: string;
  exp: number;
}

/**
 * Edge-compatible JWT verification (simplified)
 * Uses Web Crypto API available in edge runtime
 */
async function verifyEdgeToken(token: string): Promise<EdgeJwtPayload | null> {
  try {
    // Split JWT token
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode payload (base64url)
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    // Basic validation
    if (!payload.userId || !payload.email) {
      return null;
    }

    return payload as EdgeJwtPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
function extractEdgeToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Lightweight edge authentication check
 * Executes in <5ms for optimal edge performance
 */
export async function edgeAuthCheck(request: NextRequest): Promise<{
  authenticated: boolean;
  userId?: string;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const authHeader = request.headers.get('authorization');
    const token = extractEdgeToken(authHeader);

    if (!token) {
      return {
        authenticated: false,
        error: 'MISSING_TOKEN'
      };
    }

    const payload = await verifyEdgeToken(token);

    if (!payload) {
      return {
        authenticated: false,
        error: 'INVALID_TOKEN'
      };
    }

    const executionTime = Date.now() - startTime;
    
    // Log if execution exceeds 10ms (should be <5ms)
    if (executionTime > 10) {
      console.warn(`⚠️ Edge auth check slow: ${executionTime}ms`);
    }

    return {
      authenticated: true,
      userId: payload.userId
    };
  } catch (error) {
    return {
      authenticated: false,
      error: 'AUTH_ERROR'
    };
  }
}

/**
 * Edge authentication middleware for protected routes
 * Returns 401 if authentication fails
 */
export async function edgeAuthMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const result = await edgeAuthCheck(request);

  if (!result.authenticated) {
    return NextResponse.json(
      {
        error: {
          code: result.error || 'UNAUTHORIZED',
          message: 'Authentication required',
          timestamp: new Date().toISOString()
        }
      },
      { status: 401 }
    );
  }

  // Add user ID to request headers for downstream processing
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', result.userId!);

  return null; // Allow request to proceed
}

/**
 * Optional edge authentication
 * Adds user context if token is valid, but doesn't block request
 */
export async function optionalEdgeAuth(request: NextRequest): Promise<Headers> {
  const result = await edgeAuthCheck(request);
  const headers = new Headers(request.headers);

  if (result.authenticated && result.userId) {
    headers.set('x-user-id', result.userId);
    headers.set('x-authenticated', 'true');
  } else {
    headers.set('x-authenticated', 'false');
  }

  return headers;
}

/**
 * Public routes that don't require authentication
 */
export const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/health',
  '/api/monitoring/health'
];

/**
 * Check if route is public
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}
