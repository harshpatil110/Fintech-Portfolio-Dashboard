/**
 * Edge Error Handler Tests
 * Tests edge function error handling, fallbacks, and constraints
 * Requirements: 10.4, 10.5
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  EdgeError,
  EdgeErrorType,
  createEdgeErrorResponse,
  sanitizeErrorMessage,
  withEdgeErrorHandling,
  createFallbackResponse,
  validateEdgeRuntimeConstraints,
  EdgeTimeoutHandler,
  withEdgeTimeout,
  EdgeCircuitBreaker,
  withEdgeRetry,
  handleEdgeMiddlewareError,
  validateEdgeExecutionTime,
  safeEdgeExecution,
  EdgePerformanceMonitor
} from '../edgeErrorHandler';

describe('Edge Error Handler', () => {
  describe('EdgeError', () => {
    it('should create edge error with correct properties', () => {
      const error = new EdgeError(
        EdgeErrorType.TIMEOUT,
        'Function timeout',
        504,
        { maxTime: 25 }
      );

      expect(error.name).toBe('EdgeError');
      expect(error.type).toBe(EdgeErrorType.TIMEOUT);
      expect(error.message).toBe('Function timeout');
      expect(error.statusCode).toBe(504);
      expect(error.details).toEqual({ maxTime: 25 });
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should redact sensitive information', () => {
      const message = 'Error with password: secret123 and token: abc123';
      const sanitized = sanitizeErrorMessage(message);
      
      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('secret123');
    });

    it('should redact credit card numbers', () => {
      const message = 'Payment failed for card 1234567890123456';
      const sanitized = sanitizeErrorMessage(message);
      
      expect(sanitized).toContain('[CARD]');
      expect(sanitized).not.toContain('1234567890123456');
    });

    it('should redact email addresses', () => {
      const message = 'User test@example.com not found';
      const sanitized = sanitizeErrorMessage(message);
      
      expect(sanitized).toContain('[EMAIL]');
      expect(sanitized).not.toContain('test@example.com');
    });

    it('should redact bearer tokens', () => {
      const message = 'Invalid token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const sanitized = sanitizeErrorMessage(message);
      
      expect(sanitized).toContain('Bearer [TOKEN]');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });
  });

  describe('createEdgeErrorResponse', () => {
    it('should create standardized error response', () => {
      const error = new EdgeError(
        EdgeErrorType.TIMEOUT,
        'Function timeout',
        504
      );

      const request = new NextRequest('https://example.com/api/test');
      const response = createEdgeErrorResponse(error, request);

      expect(response.status).toBe(504);
      expect(response.headers.get('X-Edge-Error')).toBe('true');
      expect(response.headers.get('X-Error-Type')).toBe(EdgeErrorType.TIMEOUT);
    });

    it('should handle non-EdgeError instances', () => {
      const error = new Error('Generic error');
      const response = createEdgeErrorResponse(error);

      expect(response.status).toBe(500);
      expect(response.headers.get('X-Error-Type')).toBe(EdgeErrorType.UNKNOWN_ERROR);
    });
  });

  describe('withEdgeErrorHandling', () => {
    it('should execute function successfully', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withEdgeErrorHandling(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use fallback on error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));
      const fallback = jest.fn().mockReturnValue('fallback');
      
      const result = await withEdgeErrorHandling(fn, fallback, 'test');

      expect(result).toBe('fallback');
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('should throw error if no fallback provided', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));

      await expect(withEdgeErrorHandling(fn)).rejects.toThrow('Failed');
    });
  });

  describe('createFallbackResponse', () => {
    it('should create pass-through response with error indicators', () => {
      const request = new NextRequest('https://example.com/api/test');
      const error = new Error('Middleware failed');
      
      const response = createFallbackResponse(request, error);

      expect(response.headers.get('X-Edge-Middleware-Fallback')).toBe('true');
      expect(response.headers.get('X-Edge-Error-Type')).toBe(EdgeErrorType.UNKNOWN_ERROR);
    });

    it('should include EdgeError type in fallback response', () => {
      const request = new NextRequest('https://example.com/api/test');
      const error = new EdgeError(EdgeErrorType.TIMEOUT, 'Timeout', 504);
      
      const response = createFallbackResponse(request, error);

      expect(response.headers.get('X-Edge-Error-Type')).toBe(EdgeErrorType.TIMEOUT);
    });
  });

  describe('validateEdgeRuntimeConstraints', () => {
    it('should pass validation for valid requests', () => {
      const request = new NextRequest('https://example.com/api/test', {
        method: 'POST',
        headers: {
          'content-length': '1024',
          'content-type': 'application/json'
        }
      });

      expect(() => validateEdgeRuntimeConstraints(request)).not.toThrow();
    });

    it('should reject requests exceeding payload limit', () => {
      const request = new NextRequest('https://example.com/api/test', {
        method: 'POST',
        headers: {
          'content-length': String(2 * 1024 * 1024), // 2MB
          'content-type': 'application/json'
        }
      });

      expect(() => validateEdgeRuntimeConstraints(request)).toThrow(EdgeError);
      expect(() => validateEdgeRuntimeConstraints(request)).toThrow('exceeds edge function limit');
    });

    it('should reject multipart form data', () => {
      const request = new NextRequest('https://example.com/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data'
        }
      });

      expect(() => validateEdgeRuntimeConstraints(request)).toThrow(EdgeError);
      expect(() => validateEdgeRuntimeConstraints(request)).toThrow('not supported in edge functions');
    });
  });

  describe('EdgeTimeoutHandler', () => {
    it('should track execution time', () => {
      const handler = new EdgeTimeoutHandler(100);
      
      expect(handler.isTimeout()).toBe(false);
      expect(handler.getRemainingTime()).toBeGreaterThan(0);
    });

    it('should detect approaching timeout', async () => {
      const handler = new EdgeTimeoutHandler(100);
      
      // Wait for 85ms (85% of timeout)
      await new Promise(resolve => setTimeout(resolve, 85));
      
      expect(handler.isApproachingTimeout()).toBe(true);
    });

    it('should throw error on timeout', async () => {
      const handler = new EdgeTimeoutHandler(50);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(() => handler.checkTimeout()).toThrow(EdgeError);
      expect(() => handler.checkTimeout()).toThrow('timeout');
    });
  });

  describe('withEdgeTimeout', () => {
    it('should execute function within timeout', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withEdgeTimeout(fn, 100);

      expect(result).toBe('success');
    });

    it('should use fallback on timeout', async () => {
      const fn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('late'), 200))
      );
      const fallback = jest.fn().mockReturnValue('fallback');
      
      const result = await withEdgeTimeout(fn, 50, fallback);

      expect(result).toBe('fallback');
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('should throw timeout error if no fallback', async () => {
      const fn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('late'), 200))
      );

      await expect(withEdgeTimeout(fn, 50)).rejects.toThrow(EdgeError);
      await expect(withEdgeTimeout(fn, 50)).rejects.toThrow('timeout');
    });
  });

  describe('EdgeCircuitBreaker', () => {
    it('should execute function when circuit is closed', async () => {
      const breaker = new EdgeCircuitBreaker(3, 1000);
      const fn = jest.fn().mockResolvedValue('success');
      const fallback = jest.fn().mockReturnValue('fallback');

      const result = await breaker.execute(fn, fallback);

      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should open circuit after threshold failures', async () => {
      const breaker = new EdgeCircuitBreaker(3, 1000);
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));
      const fallback = jest.fn().mockReturnValue('fallback');

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        await breaker.execute(fn, fallback);
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should use fallback when circuit is open', async () => {
      const breaker = new EdgeCircuitBreaker(2, 1000);
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));
      const fallback = jest.fn().mockReturnValue('fallback');

      // Open circuit
      await breaker.execute(fn, fallback);
      await breaker.execute(fn, fallback);

      // Circuit should be open, fallback should be used without calling fn
      fn.mockClear();
      const result = await breaker.execute(fn, fallback);

      expect(result).toBe('fallback');
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('withEdgeRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withEdgeRetry(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const result = await withEdgeRetry(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on client errors', async () => {
      const fn = jest.fn().mockRejectedValue(
        new EdgeError(EdgeErrorType.VALIDATION_ERROR, 'Invalid', 400)
      );

      await expect(withEdgeRetry(fn, 3, 10)).rejects.toThrow(EdgeError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));

      await expect(withEdgeRetry(fn, 2, 10)).rejects.toThrow('Failed');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleEdgeMiddlewareError', () => {
    it('should return error response for constraint violations', () => {
      const error = new EdgeError(
        EdgeErrorType.CONSTRAINT_VIOLATION,
        'Payload too large',
        413
      );
      const request = new NextRequest('https://example.com/api/test');

      const response = handleEdgeMiddlewareError(error, request);

      expect(response.status).toBe(413);
      expect(response.headers.get('X-Edge-Error')).toBe('true');
    });

    it('should return error response for rate limit errors', () => {
      const error = new EdgeError(
        EdgeErrorType.RATE_LIMIT_ERROR,
        'Rate limit exceeded',
        429
      );
      const request = new NextRequest('https://example.com/api/test');

      const response = handleEdgeMiddlewareError(error, request);

      expect(response.status).toBe(429);
    });

    it('should use fallback for timeout errors', () => {
      const error = new EdgeError(
        EdgeErrorType.TIMEOUT,
        'Timeout',
        504
      );
      const request = new NextRequest('https://example.com/api/test');

      const response = handleEdgeMiddlewareError(error, request);

      expect(response.headers.get('X-Edge-Middleware-Fallback')).toBe('true');
    });

    it('should use fallback for runtime errors', () => {
      const error = new Error('Runtime error');
      const request = new NextRequest('https://example.com/api/test');

      const response = handleEdgeMiddlewareError(error, request);

      expect(response.headers.get('X-Edge-Middleware-Fallback')).toBe('true');
    });
  });

  describe('validateEdgeExecutionTime', () => {
    it('should pass for execution within time limit', () => {
      const startTime = Date.now();
      
      expect(() => validateEdgeExecutionTime(startTime, 100)).not.toThrow();
    });

    it('should throw error for execution exceeding time limit', async () => {
      const startTime = Date.now();
      
      // Wait to exceed limit
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(() => validateEdgeExecutionTime(startTime, 50)).toThrow(EdgeError);
      expect(() => validateEdgeExecutionTime(startTime, 50)).toThrow('execution time exceeded');
    });
  });

  describe('safeEdgeExecution', () => {
    it('should execute function successfully', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await safeEdgeExecution(fn);

      expect(result).toBe('success');
    });

    it('should use fallback on error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));
      const fallback = jest.fn().mockReturnValue('fallback');

      const result = await safeEdgeExecution(fn, { fallback });

      expect(result).toBe('fallback');
    });

    it('should retry on failure', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      const result = await safeEdgeExecution(fn, { retries: 1 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect timeout', async () => {
      const fn = jest.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve('late'), 200))
      );
      const fallback = jest.fn().mockReturnValue('fallback');

      const result = await safeEdgeExecution(fn, { timeout: 50, fallback });

      expect(result).toBe('fallback');
    });
  });

  describe('EdgePerformanceMonitor', () => {
    let monitor: EdgePerformanceMonitor;

    beforeEach(() => {
      monitor = new EdgePerformanceMonitor();
    });

    it('should record execution metrics', () => {
      monitor.record('test-function', 10);
      monitor.record('test-function', 20);

      const metrics = monitor.getMetrics('test-function');

      expect(metrics).not.toBeNull();
      expect(metrics!.count).toBe(2);
      expect(metrics!.avgTime).toBe(15);
      expect(metrics!.errorRate).toBe(0);
    });

    it('should track errors', () => {
      monitor.record('test-function', 10, false);
      monitor.record('test-function', 20, true);

      const metrics = monitor.getMetrics('test-function');

      expect(metrics!.errorRate).toBe(0.5);
    });

    it('should return all metrics', () => {
      monitor.record('function-1', 10);
      monitor.record('function-2', 20);

      const allMetrics = monitor.getAllMetrics();

      expect(Object.keys(allMetrics)).toHaveLength(2);
      expect(allMetrics['function-1']).toBeDefined();
      expect(allMetrics['function-2']).toBeDefined();
    });

    it('should clear metrics', () => {
      monitor.record('test-function', 10);
      monitor.clear();

      const metrics = monitor.getMetrics('test-function');

      expect(metrics).toBeNull();
    });
  });
});
