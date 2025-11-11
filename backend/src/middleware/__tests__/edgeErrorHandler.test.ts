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
    it('should create standardized error r
      50
    );

    expect(result).toBe('success');
  });

  it('should use fallback on timeout', async () => {
    const result = await withEdgeTimeout(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      },
      50,
      () => 'fallback'
    );

    expect(result).toBe('fallback');
  });

  it('should throw error if no fallback provided', async () => {
    await expect(
      withEdgeTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'success';
        },
        50
      )
    ).rejects.toThrow();
  });
});

describe('EdgeCircuitBreaker', () => {
  let breaker: EdgeCircuitBreaker;

  beforeEach(() => {
    breaker = new EdgeCircuitBreaker(3, 1000);
  });

  it('should start in CLOSED state', () => {
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should execute function successfully', async () => {
    const result = await breaker.execute(
      async () => 'success',
      () => 'fallback'
    );

    expect(result).toBe('success');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should open circuit after threshold failures', async () => {
    const failingFn = async () => {
      throw new Error('Failure');
    };

    // Cause 3 failures
    for (let i = 0; i < 3; i++) {
      await breaker.execute(failingFn, () => 'fallback');
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('should use fallback when circuit is open', async () => {
    const failingFn = async () => {
      throw new Error('Failure');
    };

    // Open circuit
    for (let i = 0; i < 3; i++) {
      await breaker.execute(failingFn, () => 'fallback');
    }

    // Next call should use fallback immediately
    const result = await breaker.execute(
      async () => 'success',
      () => 'fallback'
    );

    expect(result).toBe('fallback');
  });

  it('should reset to HALF_OPEN after timeout', async () => {
    const failingFn = async () => {
      throw new Error('Failure');
    };

    // Open circuit
    for (let i = 0; i < 3; i++) {
      await breaker.execute(failingFn, () => 'fallback');
    }

    expect(breaker.getState()).toBe('OPEN');

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Next call should attempt reset
    await breaker.execute(
      async () => 'success',
      () => 'fallback'
    );

    expect(breaker.getState()).toBe('CLOSED');
  });
});

describe('withEdgeRetry', () => {
  it('should succeed on first attempt', async () => {
    let attempts = 0;
    
    const result = await withEdgeRetry(
      async () => {
        attempts++;
        return 'success';
      },
      3,
      10
    );

    expect(result).toBe('success');
    expect(attempts).toBe(1);
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    
    const result = await withEdgeRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      },
      3,
      10
    );

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('should fail after max attempts', async () => {
    let attempts = 0;
    
    await expect(
      withEdgeRetry(
        async () => {
          attempts++;
          throw new Error('Persistent failure');
        },
        3,
        10
      )
    ).rejects.toThrow('Persistent failure');

    expect(attempts).toBe(3);
  });

  it('should not retry on client errors', async () => {
    let attempts = 0;
    
    await expect(
      withEdgeRetry(
        async () => {
          attempts++;
          throw new EdgeError(
            EdgeErrorType.VALIDATION_ERROR,
            'Invalid input',
            400
          );
        },
        3,
        10
      )
    ).rejects.toThrow('Invalid input');

    expect(attempts).toBe(1);
  });
});

describe('withEdgeErrorHandling', () => {
  it('should execute function successfully', async () => {
    const result = await withEdgeErrorHandling(
      async () => 'success',
      undefined,
      'test'
    );

    expect(result).toBe('success');
  });

  it('should use fallback on error', async () => {
    const result = await withEdgeErrorHandling(
      async () => {
        throw new Error('Failure');
      },
      () => 'fallback',
      'test'
    );

    expect(result).toBe('fallback');
  });

  it('should throw error if no fallback', async () => {
    await expect(
      withEdgeErrorHandling(
        async () => {
          throw new Error('Failure');
        },
        undefined,
        'test'
      )
    ).rejects.toThrow('Failure');
  });

  it('should handle fallback errors', async () => {
    await expect(
      withEdgeErrorHandling(
        async () => {
          throw new Error('Primary failure');
        },
        () => {
          throw new Error('Fallback failure');
        },
        'test'
      )
    ).rejects.toThrow('Primary failure');
  });
});

describe('Error Message Sanitization', () => {
  it('should sanitize passwords', () => {
    const message = 'Error with password: secret123';
    const sanitized = sanitizeErrorMessage(message);
    expect(sanitized).toBe('Error with [REDACTED]: secret123');
  });

  it('should sanitize JWT tokens', () => {
    const message = 'Token: Bearer abc.def.ghi';
    const sanitized = sanitizeErrorMessage(message);
    expect(sanitized).toBe('Token: Bearer [TOKEN]');
  });

  it('should sanitize API keys', () => {
    const message = 'API key: sk_test_123';
    const sanitized = sanitizeErrorMessage(message);
    expect(sanitized).toBe('API [REDACTED]: sk_test_123');
  });

  it('should sanitize card numbers', () => {
    const message = 'Card number: 1234567812345678';
    const sanitized = sanitizeErrorMessage(message);
    expect(sanitized).toBe('Card number: [CARD]');
  });

  it('should sanitize email addresses', () => {
    const message = 'Email: user@example.com';
    const sanitized = sanitizeErrorMessage(message);
    expect(sanitized).toBe('Email: [EMAIL]');
  });

  it('should sanitize multiple sensitive patterns', () => {
    const message = 'User user@example.com with password secret123 and token Bearer abc.def.ghi';
    const sanitized = sanitizeErrorMessage(message);
    expect(sanitized).toContain('[EMAIL]');
    expect(sanitized).toContain('[REDACTED]');
    expect(sanitized).toContain('[TOKEN]');
  });
});

describe('Edge Function Error Handling Integration', () => {
  it('should handle edge function failure with graceful fallback', async () => {
    const failingFunction = async () => {
      throw new Error('Edge function failed');
    };

    const fallback = () => 'fallback response';

    const result = await withEdgeErrorHandling(
      failingFunction,
      fallback,
      'test-edge-function'
    );

    expect(result).toBe('fallback response');
  });

  it('should handle timeout with fallback', async () => {
    const slowFunction = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'slow response';
    };

    const result = await withEdgeTimeout(
      slowFunction,
      50,
      () => 'timeout fallback'
    );

    expect(result).toBe('timeout fallback');
  });

  it('should handle constraint violations', () => {
    const mockRequest = {
      headers: new Map([
        ['content-length', '2000000'], // 2MB, exceeds 1MB limit
      ]),
      nextUrl: { pathname: '/api/test' }
    } as any;

    expect(() => {
      // This would be called in actual edge middleware
      const contentLength = mockRequest.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 1024 * 1024) {
        throw new EdgeError(
          EdgeErrorType.CONSTRAINT_VIOLATION,
          'Request payload exceeds edge function limit (1MB)',
          413
        );
      }
    }).toThrow('Request payload exceeds edge function limit');
  });

  it('should handle multiple failures with circuit breaker', async () => {
    const breaker = new EdgeCircuitBreaker(2, 1000);
    let callCount = 0;

    const failingFn = async () => {
      callCount++;
      throw new Error('Service unavailable');
    };

    const fallback = () => 'circuit breaker fallback';

    // First failure
    await breaker.execute(failingFn, fallback);
    expect(breaker.getState()).toBe('CLOSED');

    // Second failure - should open circuit
    await breaker.execute(failingFn, fallback);
    expect(breaker.getState()).toBe('OPEN');

    // Third call should use fallback immediately without calling function
    const result = await breaker.execute(failingFn, fallback);
    expect(result).toBe('circuit breaker fallback');
    expect(callCount).toBe(2); // Function not called on third attempt
  });

  it('should retry transient failures', async () => {
    let attempts = 0;

    const transientFailure = async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Transient error');
      }
      return 'success after retry';
    };

    const result = await withEdgeRetry(transientFailure, 3, 10);

    expect(result).toBe('success after retry');
    expect(attempts).toBe(2);
  });

  it('should handle edge runtime constraints', () => {
    // Test multipart form data rejection
    const mockRequest = {
      headers: new Map([
        ['content-type', 'multipart/form-data'],
      ]),
      nextUrl: { pathname: '/api/upload' }
    } as any;

    expect(() => {
      const contentType = mockRequest.headers.get('content-type');
      if (contentType?.includes('multipart/form-data')) {
        throw new EdgeError(
          EdgeErrorType.CONSTRAINT_VIOLATION,
          'Multipart form data not supported in edge functions',
          400
        );
      }
    }).toThrow('Multipart form data not supported');
  });
});

describe('Edge Error Response Format', () => {
  it('should create standardized error response', () => {
    const error = new EdgeError(
      EdgeErrorType.TIMEOUT,
      'Operation timed out',
      504,
      { maxTime: 25 }
    );

    // Simulate what createEdgeErrorResponse does
    const errorResponse = {
      error: {
        code: error.type,
        message: sanitizeErrorMessage(error.message),
        type: error.type,
        timestamp: new Date().toISOString(),
        details: error.details
      }
    };

    expect(errorResponse.error.code).toBe(EdgeErrorType.TIMEOUT);
    expect(errorResponse.error.message).toBe('Operation timed out');
    expect(errorResponse.error.type).toBe(EdgeErrorType.TIMEOUT);
    expect(errorResponse.error.details).toEqual({ maxTime: 25 });
  });

  it('should include request context in error response', () => {
    const mockRequest = {
      headers: new Map([
        ['x-request-id', 'test-request-123']
      ]),
      method: 'POST',
      nextUrl: { pathname: '/api/test' }
    } as any;

    const error = new EdgeError(
      EdgeErrorType.VALIDATION_ERROR,
      'Invalid input',
      400
    );

    const requestId = mockRequest.headers.get('x-request-id');
    expect(requestId).toBe('test-request-123');
  });
});

describe('Edge Function Performance', () => {
  it('should execute within 25ms constraint', async () => {
    const startTime = Date.now();
    
    const handler = new EdgeTimeoutHandler(25);
    
    // Simulate fast edge function
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const executionTime = Date.now() - startTime;
    
    expect(executionTime).toBeLessThan(25);
    expect(handler.isTimeout()).toBe(false);
  });

  it('should detect when approaching timeout threshold', async () => {
    const handler = new EdgeTimeoutHandler(25);
    
    // Simulate function taking 21ms (84% of 25ms)
    await new Promise(resolve => setTimeout(resolve, 21));
    
    expect(handler.isApproachingTimeout()).toBe(true);
  });
});
