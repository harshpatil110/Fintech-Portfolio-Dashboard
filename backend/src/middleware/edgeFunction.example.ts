/**
 * Example Edge Function with Comprehensive Error Handling
 * Demonstrates best practices for edge function implementation
 * Requirements: 10.4 (Graceful fallback), 10.5 (Edge-compatible responses)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  safeEdgeExecution,
  EdgeTimeoutHandler,
  EdgeCircuitBreaker,
  withEdgeRetry,
  validateEdgeRuntimeConstraints,
  createEdgeErrorResponse,
  EdgeError,
  EdgeErrorType,
  edgePerformanceMonitor
} from './edgeErrorHandler';

// Export edge runtime configuration
export const runtime = 'edge';

/**
 * Circuit breaker for external API calls
 * Shared across requests to maintain state
 */
const externalApiCircuitBreaker = new EdgeCircuitBreaker(5, 30000);

/**
 * Example 1: Simple Edge Function with Error Handling
 * GET /api/edge/health
 */
export async function edgeHealthCheck(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Validate edge runtime constraints
    validateEdgeRuntimeConstraints(request);

    // Simple health check response
    const response = NextResponse.json({
      status: 'healthy',
      edge: true,
      timestamp: new Date().toISOString(),
      region: process.env.VERCEL_REGION || 'unknown'
    });

    // Track performance
    const executionTime = Date.now() - startTime;
    edgePerformanceMonitor.record('health-check', executionTime, false);

    return response;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    edgePerformanceMonitor.record('health-check', executionTime, true);
    
    return createEdgeErrorResponse(error as Error, request);
  }
}

/**
 * Example 2: Edge Function with Timeout Protection
 * GET /api/edge/data
 */
export async function edgeDataFetch(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  return safeEdgeExecution(
    async () => {
      const timer = new EdgeTimeoutHandler(25);

      // Validate constraints
      validateEdgeRuntimeConstraints(request);
      timer.checkTimeout();

      // Fetch data (simulated)
      const data = await fetchDataWithTimeout(timer);
      timer.checkTimeout();

      // Return response
      const response = NextResponse.json({
        data,
        cached: false,
        executionTime: Date.now() - startTime
      });

      edgePerformanceMonitor.record('data-fetch', Date.now() - startTime, false);
      return response;
    },
    {
      fallback: () => {
        // Fallback to cached data
        console.log('Using fallback for data fetch');
        const response = NextResponse.json({
          data: getCachedData(),
          cached: true,
          fallback: true
        });
        
        edgePerformanceMonitor.record('data-fetch', Date.now() - startTime, true);
        return response;
      },
      timeout: 25,
      context: 'edge-data-fetch'
    }
  );
}

/**
 * Example 3: Edge Function with Circuit Breaker
 * GET /api/edge/external
 */
export async function edgeExternalCall(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    validateEdgeRuntimeConstraints(request);

    // Use circuit breaker for external API call
    const result = await externalApiCircuitBreaker.execute(
      async () => {
        // Call external API with timeout
        return await withEdgeRetry(
          async () => {
            const response = await fetch('https://api.example.com/data', {
              signal: AbortSignal.timeout(5000)
            });
            
            if (!response.ok) {
              throw new Error(`External API error: ${response.status}`);
            }
            
            return await response.json();
          },
          2, // max attempts
          100 // delay
        );
      },
      () => {
        // Fallback when circuit is open or call fails
        console.log('Circuit breaker fallback for external call');
        return getCachedExternalData();
      }
    );

    const response = NextResponse.json({
      data: result,
      circuitState: externalApiCircuitBreaker.getState(),
      executionTime: Date.now() - startTime
    });

    edgePerformanceMonitor.record('external-call', Date.now() - startTime, false);
    return response;

  } catch (error) {
    edgePerformanceMonitor.record('external-call', Date.now() - startTime, true);
    return createEdgeErrorResponse(error as Error, request);
  }
}

/**
 * Example 4: Edge Function with Payload Validation
 * POST /api/edge/submit
 */
export async function edgeSubmit(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Validate constraints (includes payload size check)
    validateEdgeRuntimeConstraints(request);

    // Parse and validate body
    const body = await request.json();

    if (!body.userId) {
      throw new EdgeError(
        EdgeErrorType.VALIDATION_ERROR,
        'userId is required',
        400,
        { field: 'userId' }
      );
    }

    if (!body.data) {
      throw new EdgeError(
        EdgeErrorType.VALIDATION_ERROR,
        'data is required',
        400,
        { field: 'data' }
      );
    }

    // Check data size
    const dataSize = JSON.stringify(body.data).length;
    if (dataSize > 100000) { // 100KB limit for edge processing
      throw new EdgeError(
        EdgeErrorType.CONSTRAINT_VIOLATION,
        'Data too large for edge processing',
        413,
        { maxSize: 100000, actualSize: dataSize }
      );
    }

    // Process data (lightweight operation only)
    const result = await processDataLightweight(body);

    const response = NextResponse.json({
      success: true,
      result,
      executionTime: Date.now() - startTime
    });

    edgePerformanceMonitor.record('submit', Date.now() - startTime, false);
    return response;

  } catch (error) {
    edgePerformanceMonitor.record('submit', Date.now() - startTime, true);
    return createEdgeErrorResponse(error as Error, request);
  }
}

/**
 * Example 5: Edge Function with Multi-Level Fallback
 * GET /api/edge/resilient
 */
export async function edgeResilientFetch(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  return safeEdgeExecution(
    async () => {
      const timer = new EdgeTimeoutHandler(25);

      // Level 1: Try primary source
      try {
        const data = await fetchPrimarySource(timer);
        return NextResponse.json({
          data,
          source: 'primary',
          executionTime: Date.now() - startTime
        });
      } catch (primaryError) {
        console.log('Primary source failed, trying secondary');
        
        // Level 2: Try secondary source
        timer.checkTimeout();
        try {
          const data = await fetchSecondarySource(timer);
          return NextResponse.json({
            data,
            source: 'secondary',
            executionTime: Date.now() - startTime
          });
        } catch (secondaryError) {
          console.log('Secondary source failed, using cache');
          
          // Level 3: Use cached data
          timer.checkTimeout();
          const data = getCachedData();
          return NextResponse.json({
            data,
            source: 'cache',
            executionTime: Date.now() - startTime
          });
        }
      }
    },
    {
      fallback: () => {
        // Level 4: Static fallback
        console.log('All sources failed, using static fallback');
        return NextResponse.json({
          data: getStaticFallback(),
          source: 'static',
          fallback: true,
          executionTime: Date.now() - startTime
        });
      },
      timeout: 25,
      context: 'resilient-fetch'
    }
  );
}

/**
 * Example 6: Edge Function with Performance Monitoring
 * GET /api/edge/metrics
 */
export async function edgeMetrics(request: NextRequest): Promise<NextResponse> {
  try {
    validateEdgeRuntimeConstraints(request);

    // Get all performance metrics
    const metrics = edgePerformanceMonitor.getAllMetrics();

    return NextResponse.json({
      metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return createEdgeErrorResponse(error as Error, request);
  }
}

/**
 * Example 7: Edge Function with Conditional Processing
 * GET /api/edge/conditional
 */
export async function edgeConditionalProcessing(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const timer = new EdgeTimeoutHandler(25);

  try {
    validateEdgeRuntimeConstraints(request);

    // Step 1: Required operation
    const step1 = await quickOperation();
    timer.checkTimeout();

    // Step 2: Optional operation (skip if running out of time)
    let step2 = null;
    if (!timer.isApproachingTimeout()) {
      step2 = await optionalOperation();
      timer.checkTimeout();
    } else {
      console.log('Skipping optional operation due to time constraint');
    }

    // Step 3: Another optional operation
    let step3 = null;
    if (!timer.isApproachingTimeout()) {
      step3 = await anotherOptionalOperation();
    } else {
      console.log('Skipping another optional operation due to time constraint');
    }

    return NextResponse.json({
      step1,
      step2,
      step3,
      partial: step2 === null || step3 === null,
      executionTime: Date.now() - startTime
    });

  } catch (error) {
    return createEdgeErrorResponse(error as Error, request);
  }
}

// ============================================================================
// Helper Functions (Simulated)
// ============================================================================

async function fetchDataWithTimeout(timer: EdgeTimeoutHandler): Promise<any> {
  // Simulate data fetch
  await new Promise(resolve => setTimeout(resolve, 10));
  timer.checkTimeout();
  return { value: 'data' };
}

function getCachedData(): any {
  return { value: 'cached-data', cached: true };
}

function getCachedExternalData(): any {
  return { value: 'cached-external-data', cached: true };
}

async function processDataLightweight(body: any): Promise<any> {
  // Simulate lightweight processing
  return { processed: true, userId: body.userId };
}

async function fetchPrimarySource(timer: EdgeTimeoutHandler): Promise<any> {
  timer.checkTimeout();
  // Simulate fetch that might fail
  if (Math.random() > 0.7) {
    throw new Error('Primary source unavailable');
  }
  return { value: 'primary-data' };
}

async function fetchSecondarySource(timer: EdgeTimeoutHandler): Promise<any> {
  timer.checkTimeout();
  // Simulate fetch that might fail
  if (Math.random() > 0.8) {
    throw new Error('Secondary source unavailable');
  }
  return { value: 'secondary-data' };
}

function getStaticFallback(): any {
  return { value: 'static-fallback', static: true };
}

async function quickOperation(): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 5));
  return { quick: true };
}

async function optionalOperation(): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 8));
  return { optional: true };
}

async function anotherOptionalOperation(): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 7));
  return { anotherOptional: true };
}

/**
 * Export all example functions for testing
 */
export const edgeFunctionExamples = {
  edgeHealthCheck,
  edgeDataFetch,
  edgeExternalCall,
  edgeSubmit,
  edgeResilientFetch,
  edgeMetrics,
  edgeConditionalProcessing
};
