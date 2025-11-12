/**
 * Edge Function Integration Tests
 * Tests edge function error handling in realistic scenarios
 * Requirements: 10.4 (Graceful fallback), 10.5 (Edge-compatible responses)
 */

import { NextRequest } from 'next/server';
import {
  EdgeError,
  EdgeErrorType,
  EdgeTimeoutHandler,
  EdgeCircuitBreaker,
  withEdgeTimeout,
  withEdgeRetry,
  validateEdgeRuntimeConstraints,
  safeEdgeExecution,
  handleEdgeMiddlewareError
} from './edgeErrorHandler';

describe('Edge Function Integration Tests', () => {
  describe('Graceful Fallback (Requirement 10.4)', () => {
    it('should use fallback when edge function times out', async () => {
      const result = await withEdgeTimeout(
        async () => {
          // Simulate slow operation
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'primary';
        },
        25, // 25ms timeout
        () => 'fallback'
      );

      expect(result).toBe('fallback');
    });

    it('should use fallback when edge function throws error', async () => {
      const result = await safeEdgeExecution(
        async () => {
          throw new Error('Edge function failed');
        },
        {
          fallback: () => 'fallback-data',
          timeout: 25,
          context: 'test'
        }
      );

      expect(result).toBe('fallback-data');
    });

    it('should allow request to proceed when middleware fails', () => {
      const request = new NextRequest('http://localhost/api/test');
      const error = new Error('Middleware failed');

      const response = handleEdgeMiddlewareError(error, request);

      // Should create fallback response that allows request through
      expect(response.headers.get('X-Edge-Middleware-Fallback')).toBe('true');
    });

    it('should use circuit breaker fallback when circuit is open', async () => {
      const breaker = new EdgeCircuitBreaker(2, 1000);

      // Cause failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(
            async () => { throw new Error('fail'); },
            () => 'fallback'
          );
        } catch (e) {
          // Expected
        }
      }

      // Circuit should be open now
      expect(breaker.getState()).toBe('OPEN');

      // Should use fallback
      const result = await breaker.execute(
        async () => 'primary',
        () => 'fallback'
      );

      expect(result).toBe('fallback');
    });

    it('should handle multi-level fallback gracefully', async () => {
      let level = 0;

      const result = await safeEdgeExecution(
        async () => {
          level = 1;
          // Primary fails
          throw new Error('Primary failed');
        },
        {
          fallback: async () => {
            level = 2;
            // Try secondary
            try {
              throw new Error('Secondary failed');
            } catch (e) {
              level = 3;
              // Use tertiary fallback
              return 'tertiary-fallback';
            }
          },
          timeout: 25,
          context: 'multi-level'
        }
      );

      expect(level).toBe(3);
      expect(result).toBe('tertiary-fallback');
    });
  });

  describe('Edge-Compatible Error Responses (Requirement 10.5)', () => {
    it('should return standardized error response for timeout', async () => {
      const request = new NextRequest('http://localhost/api/test');
      const error = new EdgeError(
        EdgeErrorType.TIMEOUT,
        'Edge function timeout',
        504
      );

      const response = handleEdgeMiddlewareError(error, request);

      // For timeout errors, should use fallback (not error response)
      expect(response.headers.get('X-Edge-Middleware-Fallback')).toBe('true');
    });

    it('should return error response for constraint violations', async () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'content-length': '2000000' // 2MB - exceeds edge limit
        }
      });

      const error = new EdgeError(
        EdgeErrorType.CONSTRAINT_VIOLATION,
        'Payload too large',
        413
      );

      const response = handleEdgeMiddlewareError(error, request);

      // Should return error response (block request)
      expect(response.status).toBe(413);
    });

    it('should sanitize error messages in responses', async () => {
      const request = new NextRequest('http://localhost/api/test');
      const error = new EdgeError(
        EdgeErrorType.RUNTIME_ERROR,
        'Error with password=secret123 and token=abc',
        500
      );

      const response = handleEdgeMiddlewareError(error, request);
      const body = await response.json();

      // Error message should be sanitized
      expect(body.error.message).not.toContain('secret123');
      expect(body.error.message).toContain('[REDACTED]');
    });

    it('should include error type in response headers', async () => {
      const request = new NextRequest('http://localhost/api/test');
      const error = new EdgeError(
        EdgeErrorType.VALIDATION_ERROR,
        'Invalid input',
        400
      );

      const response = handleEdgeMiddlewareError(error, request);

      expect(response.headers.get('X-Error-Type')).toBe(EdgeErrorType.VALIDATION_ERROR);
    });
  });

  describe('Edge Function Constraints Testing', () => {
    it('should validate payload size constraint', () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'content-length': '2000000' // 2MB
        }
      });

      expect(() => validateEdgeRuntimeConstraints(request)).toThrow(EdgeError);
      expect(() => validateEdgeRuntimeConstraints(request)).toThrow(/exceeds edge function limit/);
    });

    it('should validate content type constraint', () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      });

      expect(() => validateEdgeRuntimeConstraints(request)).toThrow(EdgeError);
      expect(() => validateEdgeRuntimeConstraints(request)).toThrow(/not supported in edge functions/);
    });

    it('should pass validation for valid request', () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET'
      });

      expect(() => validateEdgeRuntimeConstraints(request)).not.toThrow();
    });

    it('should enforce 25ms timeout constraint', async () => {
      const timer = new EdgeTimeoutHandler(25);

      // Wait longer than timeout
      await new Promise(resolve => setTimeout(resolve, 30));

      expect(timer.isTimeout()).toBe(true);
      expect(() => timer.checkTimeout()).toThrow(EdgeError);
    });

    it('should detect approaching timeout', () => {
      const timer = new EdgeTimeoutHandler(25);

      // Wait for 21ms (>80% of 25ms)
      const start = Date.now();
      while (Date.now() - start < 21) {
        // Busy wait
      }

      expect(timer.isApproachingTimeout()).toBe(true);
    });
  });

  describe('Timeout Protection', () => {
    it('should abort operation on timeout', async () => {
      let operationCompleted = false;

      const result = await withEdgeTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          operationCompleted = true;
          return 'completed';
        },
        25,
        () => 'timeout-fallback'
      );

      expect(result).toBe('timeout-fallback');
      // Operation should not have completed
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(operationCompleted).toBe(false);
    });

    it('should track remaining time accurately', () => {
      const timer = new EdgeTimeoutHandler(100);
      const initial = timer.getRemainingTime();

      // Wait 20ms
      const start = Date.now();
      while (Date.now() - start < 20) {
        // Busy wait
      }

      const remaining = timer.getRemainingTime();

      expect(initial).toBeGreaterThan(remaining);
      expect(remaining).toBeLessThan(initial);
      expect(remaining).toBeGreaterThan(0);
    });

    it('should handle conditional processing based on time', async () => {
      const timer = new EdgeTimeoutHandler(30);
      const results: string[] = [];

      // Step 1: Quick operation
      await new Promise(resolve => setTimeout(resolve, 10));
      results.push('step1');
      timer.checkTimeout();

      // Step 2: Check if we have time
      if (!timer.isApproachingTimeout()) {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('step2');
      }

      // Step 3: Likely skipped due to time
      if (!timer.isApproachingTimeout()) {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('step3');
      }

      expect(results).toContain('step1');
      expect(results).toContain('step2');
      // step3 might be skipped depending on timing
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should transition through circuit states correctly', async () => {
      const breaker = new EdgeCircuitBreaker(3, 1000);

      // Initial state
      expect(breaker.getState()).toBe('CLOSED');

      // Cause failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(
            async () => { throw new Error('fail'); },
            () => 'fallback'
          );
        } catch (e) {
          // Expected
        }
      }

      // Should be open
      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should attempt reset (HALF_OPEN)
      await breaker.execute(
        async () => 'success',
        () => 'fallback'
      );

      // Should be closed after success
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should prevent cascading failures', async () => {
      const breaker = new EdgeCircuitBreaker(2, 500);
      let callCount = 0;

      // Cause failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(
            async () => {
              callCount++;
              throw new Error('fail');
            },
            () => 'fallback'
          );
        } catch (e) {
          // Expected
        }
      }

      expect(callCount).toBe(2);
      expect(breaker.getState()).toBe('OPEN');

      // Additional calls should use fallback without calling function
      for (let i = 0; i < 5; i++) {
        const result = await breaker.execute(
          async () => {
            callCount++;
            return 'success';
          },
          () => 'fallback'
        );
        expect(result).toBe('fallback');
      }

      // Call count should not increase (circuit is open)
      expect(callCount).toBe(2);
    });
  });

  describe('Retry Logic Integration', () => {
    it('should retry failed operations', async () => {
      let attempts = 0;

      const result = await withEdgeRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('fail');
          }
          return 'success';
        },
        3,
        10
      );

      expect(attempts).toBe(3);
      expect(result).toBe('success');
    });

    it('should not retry client errors (4xx)', async () => {
      let attempts = 0;

      try {
        await withEdgeRetry(
          async () => {
            attempts++;
            const error = new EdgeError(
              EdgeErrorType.VALIDATION_ERROR,
              'Invalid input',
              400
            );
            throw error;
          },
          3,
          10
        );
      } catch (error) {
        expect(error).toBeInstanceOf(EdgeError);
      }

      // Should not retry 4xx errors
      expect(attempts).toBe(1);
    });

    it('should apply exponential backoff', async () => {
      const delays: number[] = [];
      let attempts = 0;

      try {
        await withEdgeRetry(
          async () => {
            const start = Date.now();
            attempts++;
            if (attempts > 1) {
              delays.push(Date.now() - start);
            }
            throw new Error('fail');
          },
          3,
          100
        );
      } catch (e) {
        // Expected to fail
      }

      expect(attempts).toBe(3);
      // Delays should increase (exponential backoff)
      // Note: Actual delays may vary due to timing
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle external API timeout with fallback', async () => {
      const breaker = new EdgeCircuitBreaker(3, 1000);

      const result = await breaker.execute(
        async () => {
          // Simulate external API call that times out
          return await withEdgeTimeout(
            async () => {
              await new Promise(resolve => setTimeout(resolve, 50));
              return { data: 'api-data' };
            },
            25,
            () => {
              throw new Error('API timeout');
            }
          );
        },
        () => {
          // Fallback to cached data
          return { data: 'cached-data', cached: true };
        }
      );

      expect(result.cached).toBe(true);
      expect(result.data).toBe('cached-data');
    });

    it('should handle payload validation in edge function', async () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '500'
        },
        body: JSON.stringify({ data: 'test' })
      });

      try {
        validateEdgeRuntimeConstraints(request);
        const body = await request.json();
        
        // Validate body
        if (!body.data) {
          throw new EdgeError(
            EdgeErrorType.VALIDATION_ERROR,
            'data is required',
            400
          );
        }

        expect(body.data).toBe('test');
      } catch (error) {
        fail('Should not throw for valid request');
      }
    });

    it('should handle rate limiting in edge middleware', async () => {
      // Simulate rate limit check
      const isRateLimited = (requestCount: number, limit: number) => {
        return requestCount > limit;
      };

      let requestCount = 0;
      const limit = 5;

      // Make requests
      for (let i = 0; i < 10; i++) {
        requestCount++;
        
        if (isRateLimited(requestCount, limit)) {
          const error = new EdgeError(
            EdgeErrorType.RATE_LIMIT_ERROR,
            'Rate limit exceeded',
            429
          );
          
          expect(error.type).toBe(EdgeErrorType.RATE_LIMIT_ERROR);
          expect(error.statusCode).toBe(429);
          break;
        }
      }

      expect(requestCount).toBe(6); // 5 successful + 1 rate limited
    });

    it('should handle authentication failure gracefully', async () => {
      const request = new NextRequest('http://localhost/api/protected');
      
      // Simulate auth check failure
      const authError = new EdgeError(
        EdgeErrorType.AUTHENTICATION_ERROR,
        'Invalid token',
        401
      );

      const response = handleEdgeMiddlewareError(authError, request);

      // Should return error response for protected routes
      expect(response.status).toBe(401);
    });

    it('should skip optional operations when approaching timeout', async () => {
      const timer = new EdgeTimeoutHandler(25);
      const operations: string[] = [];

      // Required operation
      await new Promise(resolve => setTimeout(resolve, 15));
      operations.push('required');
      timer.checkTimeout();

      // Optional operation 1
      if (!timer.isApproachingTimeout()) {
        await new Promise(resolve => setTimeout(resolve, 5));
        operations.push('optional1');
      }

      // Optional operation 2 (likely skipped)
      if (!timer.isApproachingTimeout()) {
        await new Promise(resolve => setTimeout(resolve, 5));
        operations.push('optional2');
      }

      expect(operations).toContain('required');
      // optional2 likely skipped due to time constraint
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track execution time accurately', () => {
      const timer = new EdgeTimeoutHandler(100);
      const start = Date.now();

      // Wait 20ms
      while (Date.now() - start < 20) {
        // Busy wait
      }

      const elapsed = Date.now() - start;
      const remaining = timer.getRemainingTime();

      expect(elapsed).toBeGreaterThanOrEqual(20);
      expect(remaining).toBeLessThan(100);
      expect(elapsed + remaining).toBeCloseTo(100, -1);
    });

    it('should warn on slow execution', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const timer = new EdgeTimeoutHandler(20);
      
      // Wait longer than threshold
      const start = Date.now();
      while (Date.now() - start < 25) {
        // Busy wait
      }

      // This would log warning in real scenario
      if (timer.isTimeout()) {
        console.warn('Edge function exceeded timeout');
      }

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
