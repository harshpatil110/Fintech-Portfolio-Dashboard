/**
 * Edge Function Health Check API
 * Demonstrates edge function error handling with graceful fallback
 * Requirements: 10.4 (Graceful fallback), 10.5 (Edge-compatible responses)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  safeEdgeExecution,
  validateEdgeRuntimeConstraints,
  createEdgeErrorResponse,
  EdgeTimeoutHandler,
  edgePerformanceMonitor
} from '../middleware/edgeErrorHandler';

// Configure this function to run on the edge
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET /api/edge/health
 * Health check endpoint that runs on edge with error handling
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  return safeEdgeExecution(
    async () => {
      const timer = new EdgeTimeoutHandler(25);

      // Validate edge runtime constraints
      validateEdgeRuntimeConstraints(request);
      timer.checkTimeout();

      // Perform health check
      const health = {
        status: 'healthy',
        edge: true,
        timestamp: new Date().toISOString(),
        region: process.env.VERCEL_REGION || 'unknown',
        executionTime: Date.now() - startTime
      };

      // Track performance
      edgePerformanceMonitor.record('edge-health', Date.now() - startTime, false);

      return NextResponse.json(health, {
        headers: {
          'X-Edge-Function': 'true',
          'X-Execution-Time': `${Date.now() - startTime}ms`
        }
      });
    },
    {
      fallback: () => {
        // Graceful fallback when edge function fails
        console.warn('Edge health check failed, using fallback');
        
        edgePerformanceMonitor.record('edge-health', Date.now() - startTime, true);

        return NextResponse.json({
          status: 'degraded',
          edge: true,
          fallback: true,
          timestamp: new Date().toISOString(),
          region: process.env.VERCEL_REGION || 'unknown',
          executionTime: Date.now() - startTime
        }, {
          status: 200,
          headers: {
            'X-Edge-Function': 'true',
            'X-Edge-Fallback': 'true',
            'X-Execution-Time': `${Date.now() - startTime}ms`
          }
        });
      },
      timeout: 25,
      context: 'edge-health-check'
    }
  );
}
