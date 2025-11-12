/**
 * Edge Error Handler Tests
 * Tests for edge function error handling and fallback mechanisms
 * Requirements: 10.4, 10.5
 */

import { NextRequest } from 'next/server';
import {
  EdgeError,
  EdgeErrorType,
  createEdgeErrorResponse,
  sanitizeErrorMessage,
  withEdgeErrorHandling,
  withEdgeTimeout,
  EdgeTimeoutHandler,
  EdgeCircuitBreaker,
  withEdgeRetry,
  validateEdgeRuntimeConstraints,
  handleEdgeMiddlewareError,
  createFallbackResponse
} from './edgeErrorHandler';

describe('Edge Error Handler', () => {
  describe('EdgeError', () => {
    it('should create edge error with correct properties', () => {
      const error = new EdgeError(
        EdgeErrorType.TIMEOUT,
        'Test timeout',
        504,
        { detail: 'test' }
      );

      expect(error.type).toBe(EdgeErrorType.TIMEOUT);
      expect(error.message).toBe('Test timeout');
      expect(error.statusCode).toBe(504);
      expect(error.details).toEqual({ detail: 'test' });
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should redact sensitive information', () => {
      const message = 'Error with password=secret123 and token=abc123';
      const sanitized = sanitizeErrorMessage(message);
      
      expect(sanitized).not.toContain('secret123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should redact email addresses', () => {
      const message = 'User test@example.com not found';
      const sanitized = sanitizeErrorMessage(message);
      
      expect(sanitized).not.toContain('test@example.com');
      expect(sanitized).toContain('[EMAIL]');
    });
  });

  describe('withEdgeErrorHandling', () => {
    it('should return result on success', async () => {
      const result = await withEdgeErrorHandling(
        async () => 'success',
        async () => 'fallback'
      );

      expect(result).toBe('success');
    });

    it('should use fallback on error', async () => {
      const result = await withEdgeErrorHandling(
        async () => { throw new Error('fail'); },
        async () => 'fallback'
      );

      expect(result).toBe('fallback');
    });
  });

  describe('EdgeTimeoutHandler', () => {
    it('should track execution time', () => {
      const handler = new EdgeTimeoutHandler(100);
      
      expect(handler.isTimeout()).toBe(false);
      expect(handler.getRemainingTime()).toBeGreaterThan(0);
    });

    it('should detect timeout', async () => {
      const handler = new EdgeTimeoutHandler(10);
      
      await new Promise(resolve => setTimeout(resolve, 15));
      
      expect(handler.isTimeout()).toBe(true);
    });
  });

  describe('withEdgeTimeout', () => {
    it('should return result within timeout', async () => {
      const result = await withEdgeTimeout(
        async () => 'success',
        100
      );

      expect(result).toBe('success');
    });

    it('should use fallback on timeout', async () => {
      const result = await withEdgeTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'success';
        },
        10,
        () => 'fallback'
      );

      expect(result).toBe('fallback');
    });
  });

  describe('EdgeCircuitBreaker', () => {
    it('should start in CLOSED state', () => {
      const breaker = new EdgeCircuitBreaker(3, 1000);
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should open after threshold failures', async () => {
      const breaker = new EdgeCircuitBreaker(3, 1000);

      // Cause 3 failures
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

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should use fallback when open', async () => {
      const breaker = new EdgeCircuitBreaker(2, 1000);

      // Open the circuit
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

      // Should use fallback now
      const result = await breaker.execute(
        async () => 'success',
        () => 'fallback'
      );

      expect(result).toBe('fallback');
    });
  });

  describe('withEdgeRetry', () => {
    it('should succeed on first attempt', async () => {
      const result = await withEdgeRetry(
        async () => 'success',
        3,
        10
      );

      expect(result).toBe('success');
    });

    it('should retry on failure', async () => {
      let attempts = 0;

      const result = await withEdgeRetry(
        async () => {
          attempts++;
          if (attempts < 2) throw new Error('fail');
          return 'success';
        },
        3,
        10
      );

      expect(attempts).toBe(2);
      expect(result).toBe('success');
    });
  });

  describe('validateEdgeRuntimeConstraints', () => {
    it('should pass for valid request', () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET'
      });

      expect(() => validateEdgeRuntimeConstraints(request)).not.toThrow();
    });

    it('should throw for large payload', () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'content-length': '2000000' // 2MB
        }
      });

      expect(() => validateEdgeRuntimeConstraints(request)).toThrow(EdgeError);
    });
  });

  describe('handleEdgeMiddlewareError', () => {
    it('should return error response for constraint violations', () => {
      const request = new NextRequest('http://localhost/api/test');
      const error = new EdgeError(
        EdgeErrorType.CONSTRAINT_VIOLATION,
        'Constraint violated',
        413
      );

      const response = handleEdgeMiddlewareError(error, request);

      expect(response.status).toBe(413);
    });

    it('should return fallback for timeout errors', () => {
      const request = new NextRequest('http://localhost/api/test');
      const error = new EdgeError(
        EdgeErrorType.TIMEOUT,
        'Timeout',
        504
      );

      const response = handleEdgeMiddlewareError(error, request);

      expect(response.headers.get('X-Edge-Middleware-Fallback')).toBe('true');
    });
  });

  describe('createFallbackResponse', () => {
    it('should create pass-through response', () => {
      const request = new NextRequest('http://localhost/api/test');
      const error = new Error('Test error');

      const response = createFallbackResponse(request, error);

      expect(response.headers.get('X-Edge-Middleware-Fallback')).toBe('true');
    });
  });
});
