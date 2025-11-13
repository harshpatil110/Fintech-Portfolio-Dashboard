/**
 * Edge Function Metrics API
 * Provides performance metrics for edge functions with error handling
 * Requirements: 10.4 (Graceful fallback), 10.5 (Edge-compatible responses)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  safeEdgeExecution,
  validateEdgeRuntimeConstraints,
  createEdgeErrorResponse,
  EdgeTimeoutHandler,
  edgePerformanceMonitor,
  EdgeError,
  EdgeErrorType
} from '../middleware/edgeErrorHandler';

// Configure this function to run on the edge
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * GET /api/edge/metrics
 * Returns performance metrics for edge functions
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  return safeEdgeExecution(
    async () => {
      const timer = new EdgeTimeoutHandler(25);

      // Validate edge runtime constraints
      validateEdgeRuntimeConstraints(request);
      timer.checkTimeout();

      // Get all performance metrics
      const metrics = edgePerformanceMonitor.getAllMetrics();

      // Check if we have time to add more details
      let detailedMetrics = null;
      if (!timer.isApproachingTimeout()) {
        detailedMetrics = {
          totalFunctions: Object.keys(metrics).length,
          totalCalls: Object.values(metrics).reduce((sum, m) => sum + m.count, 0),
          avgErrorRate: Object.values(metrics).reduce((sum, m) => sum + m.errorRate, 0) / Object.keys(metrics).length || 0
        };
      }

      const response = {
        metrics,
        summary: detailedMetrics,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime
      };

      edgePerformanceMonitor.record('edge-metrics', Date.now() - startTime, false);

      return NextResponse.json(response, {
        headers: {
          'X-Edge-Function': 'true',
          'X-Execution-Time': `${Date.now() - startTime}ms`,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    },
    {
      fallback: () => {
        // Graceful fallback: return empty metrics
        console.warn('Edge metrics fetch failed, using fallback');
        
        edgePerformanceMonitor.record('edge-metrics', Date.now() - startTime, true);

        return NextResponse.json({
          metrics: {},
          summary: null,
          fallback: true,
          timestamp: new Date().toISOString(),
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
      context: 'edge-metrics'
    }
  );
}

/**
 * DELETE /api/edge/metrics
 * Clear performance metrics (admin only)
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const timer = new EdgeTimeoutHandler(25);

    // Validate edge runtime constraints
    validateEdgeRuntimeConstraints(request);
    timer.checkTimeout();

    // Check authorization (simplified for edge)
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new EdgeError(
        EdgeErrorType.AUTHENTICATION_ERROR,
        'Authorization required',
        401
      );
    }

    // Clear metrics
    edgePerformanceMonitor.clear();

    return NextResponse.json({
      success: true,
      message: 'Metrics cleared',
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'X-Edge-Function': 'true',
        'X-Execution-Time': `${Date.now() - startTime}ms`
      }
    });

  } catch (error) {
    return createEdgeErrorResponse(error as Error, request);
  }
}
