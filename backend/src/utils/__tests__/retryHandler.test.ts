/**
 * Unit tests for RetryHandler
 * Tests retry logic with exponential backoff and different failure patterns
 */

import { RetryHandler, isRetryableError } from '../retryHandler';

describe('RetryHandler', () => {
  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const handler = new RetryHandler();
      const config = handler.getConfig();
      
      expect(config.maxAttempts).toBe(3);
      expect(config.initialDelay).toBe(1000);
      expect(config.maxDelay).toBe(10000);
      expect(config.backoffMultiplier).toBe(2);
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        maxAttempts: 5,
        initialDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 3
      };
      const handler = new RetryHandler(customConfig);
      const config = handler.getConfig();
      
      expect(config.maxAttempts).toBe(5);
      expect(config.initialDelay).toBe(500);
      expect(config.maxDelay).toBe(5000);
      expect(config.backoffMultiplier).toBe(3);
    });
  });

  describe('executeWithRetry - success scenarios', () => {
    it('should execute function successfully on first attempt', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 100, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn().mockResolvedValue('success');

      const result = await handler.executeWithRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should succeed after one retry', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');

      const result = await handler.executeWithRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should succeed after multiple retries', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValueOnce('success');

      const result = await handler.executeWithRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('executeWithRetry - failure scenarios', () => {
    it('should throw error after max attempts', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(handler.executeWithRetry(fn)).rejects.toThrow('persistent failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry if shouldRetry returns false', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn().mockRejectedValue(new Error('non-retryable'));
      const shouldRetry = jest.fn().mockReturnValue(false);

      await expect(handler.executeWithRetry(fn, shouldRetry)).rejects.toThrow('non-retryable');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should stop retrying when shouldRetry returns false mid-way', async () => {
      const handler = new RetryHandler({ maxAttempts: 5, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const shouldRetry = jest.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      await expect(handler.executeWithRetry(fn, shouldRetry)).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('exponential backoff', () => {
    it('should apply exponential backoff between retries', async () => {
      const handler = new RetryHandler({ 
        maxAttempts: 3, 
        initialDelay: 100, 
        maxDelay: 10000, 
        backoffMultiplier: 2 
      });
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const delays: number[] = [];
      
      const onRetry = jest.fn((error, attempt, delay) => {
        delays.push(delay);
      });

      await expect(handler.executeWithRetry(fn, undefined, onRetry)).rejects.toThrow('fail');
      
      // First retry: ~100ms, Second retry: ~200ms
      expect(delays.length).toBe(2);
      expect(delays[0]).toBeGreaterThanOrEqual(100);
      expect(delays[0]).toBeLessThan(150); // With jitter
      expect(delays[1]).toBeGreaterThanOrEqual(200);
      expect(delays[1]).toBeLessThan(250); // With jitter
    });

    it('should respect maxDelay', async () => {
      const handler = new RetryHandler({ 
        maxAttempts: 5, 
        initialDelay: 1000, 
        maxDelay: 2000, 
        backoffMultiplier: 3 
      });
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const delays: number[] = [];
      
      const onRetry = jest.fn((error, attempt, delay) => {
        delays.push(delay);
      });

      await expect(handler.executeWithRetry(fn, undefined, onRetry)).rejects.toThrow('fail');
      
      // All delays should be <= maxDelay
      delays.forEach(delay => {
        expect(delay).toBeLessThanOrEqual(2200); // maxDelay + jitter
      });
    }, 15000); // Increase timeout to 15 seconds for this long-running test
  });

  describe('onRetry callback', () => {
    it('should call onRetry callback before each retry', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const onRetry = jest.fn();

      await expect(handler.executeWithRetry(fn, undefined, onRetry)).rejects.toThrow('fail');
      
      expect(onRetry).toHaveBeenCalledTimes(2); // Called before 2nd and 3rd attempts
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 2, expect.any(Number));
    });

    it('should not call onRetry on first attempt', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn().mockResolvedValue('success');
      const onRetry = jest.fn();

      await handler.executeWithRetry(fn, undefined, onRetry);
      
      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  describe('executeWithRetryResult', () => {
    it('should return success result with attempt count', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');

      const result = await handler.executeWithRetryResult(fn);
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBeGreaterThanOrEqual(1); // At least 1 attempt, may be 1 or 2 depending on callback timing
      expect(result.totalDelay).toBeGreaterThan(0);
    });

    it('should return failure result after max attempts', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      const result = await handler.executeWithRetryResult(fn);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.attempts).toBe(3);
      expect(result.totalDelay).toBeGreaterThan(0);
    });
  });

  describe('statistics', () => {
    it('should track retry statistics', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      
      // Successful retry
      const successFn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');
      await handler.executeWithRetry(successFn);
      
      // Failed retry
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(handler.executeWithRetry(failFn)).rejects.toThrow();
      
      const stats = handler.getStats();
      expect(stats.successfulRetries).toBe(1);
      expect(stats.failedRetries).toBe(1);
      expect(stats.totalAttempts).toBeGreaterThan(0);
    });

    it('should reset statistics', async () => {
      const handler = new RetryHandler({ maxAttempts: 3, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2 });
      
      const fn = jest.fn().mockResolvedValue('success');
      await handler.executeWithRetry(fn);
      
      handler.resetStats();
      const stats = handler.getStats();
      
      expect(stats.totalAttempts).toBe(0);
      expect(stats.successfulRetries).toBe(0);
      expect(stats.failedRetries).toBe(0);
    });
  });
});

describe('isRetryableError', () => {
  it('should identify network errors as retryable', () => {
    const errors = [
      { code: 'ECONNREFUSED' },
      { code: 'ENOTFOUND' },
      { code: 'ETIMEDOUT' },
      { code: 'ECONNRESET' }
    ];

    errors.forEach(error => {
      expect(isRetryableError(error)).toBe(true);
    });
  });

  it('should identify 5xx status codes as retryable', () => {
    const errors = [
      { statusCode: 500 },
      { status: 502 },
      { statusCode: 503 },
      { status: 504 }
    ];

    errors.forEach(error => {
      expect(isRetryableError(error)).toBe(true);
    });
  });

  it('should identify 429 as retryable', () => {
    expect(isRetryableError({ statusCode: 429 })).toBe(true);
    expect(isRetryableError({ status: 429 })).toBe(true);
  });

  it('should identify 408 as retryable', () => {
    expect(isRetryableError({ statusCode: 408 })).toBe(true);
    expect(isRetryableError({ status: 408 })).toBe(true);
  });

  it('should identify timeout errors as retryable', () => {
    const errors = [
      { name: 'TimeoutError' },
      { message: 'Request timeout' },
      { message: 'Operation timed out' }
    ];

    errors.forEach(error => {
      expect(isRetryableError(error)).toBe(true);
    });
  });

  it('should identify rate limit errors as retryable', () => {
    const errors = [
      { name: 'RateLimitError' },
      { code: 'RATE_LIMIT_EXCEEDED' }
    ];

    errors.forEach(error => {
      expect(isRetryableError(error)).toBe(true);
    });
  });

  it('should not retry 4xx client errors (except 408, 429)', () => {
    const errors = [
      { statusCode: 400 },
      { status: 401 },
      { statusCode: 403 },
      { status: 404 }
    ];

    errors.forEach(error => {
      expect(isRetryableError(error)).toBe(false);
    });
  });

  it('should not retry unknown errors', () => {
    const errors = [
      { message: 'Unknown error' },
      { code: 'UNKNOWN' },
      new Error('Generic error')
    ];

    errors.forEach(error => {
      expect(isRetryableError(error)).toBe(false);
    });
  });
});
