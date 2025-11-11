/**
 * Edge Error Handler Tests
 * Tests for edge function error handling and fallback mechanisms
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EdgeError,
  EdgeErrorType,
  EdgeTimeoutHandler,
  EdgeCircuitBreaker,
  withEdgeTimeout,
  withEdgeRetry,
  withEdgeErrorHandling,
  sanitizeErrorMessage
} from '../edgeErrorHandler';

describe('EdgeError', () => {
  it('should create edge error with correct properties', () => {
    const error = new EdgeError(
      EdgeErrorType.TIMEOUT,
      'Operation timeout',
      504,
      { maxTime: 25 }
    );

    expect(error.type).toBe(EdgeErrorType.TIMEOUT);
    expect(error.message).toBe('Operation timeout');
    expect(error.statusCode).toBe(504);
    expect(error.details).toEqual({ maxTime: 25 });
    expect(error.name).toBe('EdgeError');
  });
});

describe('EdgeTimeoutHandler', () => {
  it('should track execution time', async () => {
    const handler = new EdgeTimeoutHandler(100);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(handler.isTimeout()).toBe(false);
    expect(handler.getRemainingTime()).toBeLessThan(100);
    expect(handler.getRemainingTime()).toBeGreaterThan(0);
  });

  it('should detect timeout', async () => {
    const handler = new EdgeTimeoutHandler(50);
    
    await new Promise(resolve => setTimeout(resolve, 60));
    
    expect(handler.isTimeout()).toBe(true);
    expect(handler.getRemainingTime()).toBe(0);
  });

  it('should detect approaching timeout', async () => {
    const handler = new EdgeTimeoutHandler(100);
    
    await new Promise(resolve => setTimeout(resolve, 85));
    
    expect(handler.isApproachingTimeout()).toBe(true);
  });

  it('should throw timeout error when checking', async () => {
    const handler = new EdgeTimeoutHandler(50);
    
    await new Promise(resolve => setTimeout(resolve, 60));
    
    expect(() => handler.checkTimeout()).toThrow(EdgeError);
    expect(() => handler.checkTimeout()).toThrow('timeout');
  });
});

describe('withEdgeTimeout', () => {
  it('should execute function within timeout', async () => {
    const result = await withEdgeTimeout(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      },
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
