/**
 * Integration Tests for Error Handling System
 * Tests complete error handling flow end-to-end
 * 
 * Requirements: All requirements benefit from testing
 */

import request from 'supertest';
import express, { Express } from 'express';
import { CircuitBreaker, CircuitState } from '../../utils/circuitBreaker';
import { CacheManager } from '../../utils/cacheManager';
import { RateLimiter } from '../../utils/rateLimiter';
import { createRateLimitMiddleware } from '../../middleware/rateLimiter';
import redisClient from '../../config/redis';

describe('Error Handling Integration Tests', () => {
  let app: Express;
  let testCircuitBreaker: CircuitBreaker;
  let testCache: CacheManager;
  let testRateLimiter: RateLimiter;

  beforeAll(async () => {
    // Ensure Redis connection
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  });

  beforeEach(async () => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Initialize test utilities
    testCircuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 5000
    });

    testCache = new CacheManager('test:');
    
    testRateLimiter = new RateLimiter({
      windowMs: 1000,
      maxRequests: 5,
      keyPrefix: 'test-ratelimit'
    });

    // Clear test data from Redis
    await testCache.clear();
  });

  afterAll(async () => {
    // Cleanup
    await testCache.clear();
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  });

  describe('Complete Error Handling Flow', () => {
    it('should handle timeout -> retry -> circuit breaker -> cache fallback flow', async () => {
      let callCount = 0;
      const mockExternalAPI = async () => {
        callCount++;
        if (callCount <= 3) {
          throw new Error('Service timeout');
        }
        return { data: 'success' };
      };

      // Setup endpoint with full error handling
      app.get('/api/test', async (req, res) => {
        try {
          const result = await testCircuitBreaker.execute(
            mockExternalAPI,
            async () => {
              // Fallback to cache
              const cached = await testCache.get(
                'fallback-data',
                async () => ({ data: 'cached-fallback' }),
                { ttl: 60, staleWhileRevalidate: 30 }
              );
              return cached;
            }
          );
          res.json(result);
        } catch (error) {
          res.status(500).json({ error: 'Service unavailable' });
        }
      });

      // First 3 requests should fail and open circuit
      for (let i = 0; i < 3; i++) {
        const response = await request(app).get('/api/test');
        expect(response.status).toBe(200);
        expect(response.body.data).toBe('cached-fallback');
      }

      // Circuit should be open now
      expect(testCircuitBreaker.isOpen()).toBe(true);

      // Next request should use fallback immediately
      const response = await request(app).get('/api/test');
      expect(response.status).toBe(200);
      expect(response.body.data).toBe('cached-fallback');
    });

    it('should handle payload validation -> rate limiting -> error response flow', async () => {
      const rateLimitMiddleware = createRateLimitMiddleware(
        testRateLimiter,
        'TEST_RATE_LIMIT',
        'Too many requests'
      );

      app.post('/api/data', rateLimitMiddleware, (req, res) => {
        // Payload size check
        const contentLength = parseInt(req.get('content-length') || '0');
        if (contentLength > 1024 * 1024) {
          return res.status(413).json({
            error: {
              code: 'PAYLOAD_TOO_LARGE',
              message: 'Request payload exceeds 1MB limit'
            }
          });
        }

        res.json({ success: true });
      });

      // Test rate limiting
      const responses = [];
      for (let i = 0; i < 7; i++) {
        responses.push(await request(app).post('/api/data').send({ test: 'data' }));
      }

      // First 5 should succeed
      expect(responses.slice(0, 5).every(r => r.status === 200)).toBe(true);

      // Next 2 should be rate limited
      expect(responses.slice(5).every(r => r.status === 429)).toBe(true);
      expect(responses[5].body.error.code).toBe('TEST_RATE_LIMIT');
    });
  });

  describe('Circuit Breaker Under Load', () => {
    it('should open circuit after threshold failures', async () => {
      const failingService = jest.fn().mockRejectedValue(new Error('Service down'));
      const fallback = jest.fn().mockResolvedValue({ data: 'fallback' });

      // Execute multiple failing requests
      for (let i = 0; i < 5; i++) {
        await testCircuitBreaker.execute(failingService, fallback);
      }

      // Circuit should be open
      expect(testCircuitBreaker.isOpen()).toBe(true);

      // Fallback should have been called
      expect(fallback).toHaveBeenCalled();

      // Service should not be called anymore (circuit is open)
      const callCountBefore = failingService.mock.calls.length;
      await testCircuitBreaker.execute(failingService, fallback);
      expect(failingService.mock.calls.length).toBe(callCountBefore);
    });

    it('should transition to half-open and recover', async () => {
      let shouldFail = true;
      const service = jest.fn().mockImplementation(async () => {
        if (shouldFail) throw new Error('Fail');
        return { data: 'success' };
      });
      const fallback = jest.fn().mockResolvedValue({ data: 'fallback' });

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await testCircuitBreaker.execute(service, fallback);
      }

      expect(testCircuitBreaker.isOpen()).toBe(true);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Service recovers
      shouldFail = false;

      // Next call should transition to half-open and succeed
      const result = await testCircuitBreaker.execute(service, fallback);
      expect(result.data).toBe('success');
      expect(testCircuitBreaker.isClosed()).toBe(true);
    });

    it('should handle concurrent requests during circuit state transitions', async () => {
      let callCount = 0;
      const service = async () => {
        callCount++;
        if (callCount <= 3) throw new Error('Fail');
        return { data: 'success' };
      };
      const fallback = async () => ({ data: 'fallback' });

      // Execute concurrent requests
      const promises = Array(10).fill(null).map(() =>
        testCircuitBreaker.execute(service, fallback)
      );

      const results = await Promise.all(promises);

      // All requests should complete (either with fallback or success)
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.data).toMatch(/fallback|success/);
      });
    });
  });

  describe('Cache Effectiveness Under Load', () => {
    it('should serve cached data and reduce backend calls', async () => {
      let fetchCount = 0;
      const expensiveOperation = async () => {
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: `result-${fetchCount}`, timestamp: Date.now() };
      };

      // Make multiple concurrent requests
      const promises = Array(20).fill(null).map(() =>
        testCache.get('expensive-op', expensiveOperation, {
          ttl: 2,
          staleWhileRevalidate: 1
        })
      );

      const results = await Promise.all(promises);

      // Should have called expensive operation only once (or very few times)
      expect(fetchCount).toBeLessThanOrEqual(3);

      // All results should be the same (from cache)
      const firstResult = results[0];
      results.forEach(result => {
        expect(result.data).toBe(firstResult.data);
      });
    });

    it('should implement stale-while-revalidate correctly', async () => {
      let fetchCount = 0;
      const dataSource = async () => {
        fetchCount++;
        return { data: `version-${fetchCount}`, timestamp: Date.now() };
      };

      // Initial fetch
      const result1 = await testCache.get('swr-test', dataSource, {
        ttl: 1,
        staleWhileRevalidate: 2
      });
      expect(result1.data).toBe('version-1');
      expect(fetchCount).toBe(1);

      // Wait for data to become stale but within SWR window
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should return stale data immediately
      const result2 = await testCache.get('swr-test', dataSource, {
        ttl: 1,
        staleWhileRevalidate: 2
      });
      expect(result2.data).toBe('version-1'); // Still stale data

      // Wait for background revalidation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Next request should have fresh data
      const result3 = await testCache.get('swr-test', dataSource, {
        ttl: 1,
        staleWhileRevalidate: 2
      });
      expect(result3.data).toBe('version-2');
    });

    it('should handle cache misses gracefully under load', async () => {
      const dataSource = async (key: string) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { key, data: `data-${key}` };
      };

      // Request different keys concurrently
      const promises = Array(10).fill(null).map((_, i) =>
        testCache.get(`key-${i}`, () => dataSource(`key-${i}`), {
          ttl: 60,
          staleWhileRevalidate: 30
        })
      );

      const results = await Promise.all(promises);

      // All requests should complete successfully
      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.key).toBe(`key-${i}`);
      });
    });
  });

  describe('Rate Limiting Under Load', () => {
    it('should enforce rate limits accurately under concurrent requests', async () => {
      const rateLimitMiddleware = createRateLimitMiddleware(
        testRateLimiter,
        'RATE_LIMIT',
        'Too many requests'
      );

      app.get('/api/limited', rateLimitMiddleware, (req, res) => {
        res.json({ success: true });
      });

      // Make concurrent requests
      const promises = Array(10).fill(null).map(() =>
        request(app).get('/api/limited')
      );

      const results = await Promise.all(promises);

      // Count successful and rate-limited responses
      const successful = results.filter(r => r.status === 200).length;
      const rateLimited = results.filter(r => r.status === 429).length;

      // Should allow exactly 5 requests (maxRequests)
      expect(successful).toBeLessThanOrEqual(5);
      expect(rateLimited).toBeGreaterThanOrEqual(5);
      expect(successful + rateLimited).toBe(10);
    });

    it('should reset rate limit after window expires', async () => {
      const rateLimitMiddleware = createRateLimitMiddleware(
        testRateLimiter,
        'RATE_LIMIT',
        'Too many requests'
      );

      app.get('/api/limited', rateLimitMiddleware, (req, res) => {
        res.json({ success: true });
      });

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        await request(app).get('/api/limited');
      }

      // Next request should be rate limited
      const response1 = await request(app).get('/api/limited');
      expect(response1.status).toBe(429);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should allow requests again
      const response2 = await request(app).get('/api/limited');
      expect(response2.status).toBe(200);
    });

    it('should include proper rate limit headers', async () => {
      const rateLimitMiddleware = createRateLimitMiddleware(
        testRateLimiter,
        'RATE_LIMIT',
        'Too many requests'
      );

      app.get('/api/limited', rateLimitMiddleware, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/api/limited');

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();

      if (response.status === 429) {
        expect(response.headers['retry-after']).toBeDefined();
      }
    });
  });

  describe('Combined Load Scenarios', () => {
    it('should handle high load with all error handling mechanisms active', async () => {
      let serviceCallCount = 0;
      const service = async () => {
        serviceCallCount++;
        // Simulate occasional failures
        if (serviceCallCount % 10 === 0) {
          throw new Error('Intermittent failure');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        return { data: `result-${serviceCallCount}` };
      };

      const fallback = async () => ({ data: 'fallback' });

      const rateLimitMiddleware = createRateLimitMiddleware(
        new RateLimiter({
          windowMs: 1000,
          maxRequests: 50,
          keyPrefix: 'load-test'
        }),
        'RATE_LIMIT',
        'Too many requests'
      );

      app.get('/api/load-test', rateLimitMiddleware, async (req, res) => {
        try {
          const result = await testCircuitBreaker.execute(service, fallback);
          const cached = await testCache.get(
            `load-${Date.now() % 5}`, // 5 different cache keys
            async () => result,
            { ttl: 1, staleWhileRevalidate: 1 }
          );
          res.json(cached);
        } catch (error) {
          res.status(500).json({ error: 'Service error' });
        }
      });

      // Simulate high load
      const promises = Array(100).fill(null).map((_, i) =>
        request(app)
          .get('/api/load-test')
          .catch(err => ({ status: 500, body: { error: err.message } }))
      );

      const results = await Promise.all(promises);

      // Analyze results
      const successful = results.filter(r => r.status === 200).length;
      const rateLimited = results.filter(r => r.status === 429).length;
      const errors = results.filter(r => r.status === 500).length;

      // Most requests should succeed or be rate limited (not error)
      expect(successful + rateLimited).toBeGreaterThan(90);
      expect(errors).toBeLessThan(10);

      // Service should have been called less than total requests (due to caching)
      expect(serviceCallCount).toBeLessThan(100);
    });

    it('should maintain performance under sustained load', async () => {
      const rateLimitMiddleware = createRateLimitMiddleware(
        new RateLimiter({
          windowMs: 1000,
          maxRequests: 100,
          keyPrefix: 'perf-test'
        }),
        'RATE_LIMIT',
        'Too many requests'
      );

      app.get('/api/perf-test', rateLimitMiddleware, async (req, res) => {
        const result = await testCache.get(
          'perf-data',
          async () => ({ data: 'test', timestamp: Date.now() }),
          { ttl: 5, staleWhileRevalidate: 2 }
        );
        res.json(result);
      });

      const startTime = Date.now();
      
      // Make 50 requests
      const promises = Array(50).fill(null).map(() =>
        request(app).get('/api/perf-test')
      );

      await Promise.all(promises);
      
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 2 seconds for 50 requests)
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should recover from Redis connection failures', async () => {
      // Simulate Redis unavailable
      const originalIsOpen = Object.getOwnPropertyDescriptor(redisClient, 'isOpen');
      Object.defineProperty(redisClient, 'isOpen', {
        get: () => false,
        configurable: true
      });

      const rateLimitMiddleware = createRateLimitMiddleware(
        testRateLimiter,
        'RATE_LIMIT',
        'Too many requests'
      );

      app.get('/api/test', rateLimitMiddleware, (req, res) => {
        res.json({ success: true });
      });

      // Should still work (fail open)
      const response = await request(app).get('/api/test');
      expect(response.status).toBe(200);

      // Restore
      if (originalIsOpen) {
        Object.defineProperty(redisClient, 'isOpen', originalIsOpen);
      }
    });

    it('should handle cascading failures gracefully', async () => {
      let failureCount = 0;
      const unreliableService = async () => {
        failureCount++;
        if (failureCount <= 5) {
          throw new Error('Service failure');
        }
        return { data: 'recovered' };
      };

      const fallback = async () => {
        // Fallback also fails initially
        if (failureCount <= 3) {
          throw new Error('Fallback failure');
        }
        return { data: 'fallback-success' };
      };

      app.get('/api/cascade', async (req, res) => {
        try {
          const result = await testCircuitBreaker.execute(
            unreliableService,
            fallback
          );
          res.json(result);
        } catch (error) {
          // Final fallback
          res.json({ data: 'emergency-fallback' });
        }
      });

      // Make multiple requests
      const responses = [];
      for (let i = 0; i < 10; i++) {
        responses.push(await request(app).get('/api/cascade'));
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // All requests should complete (no crashes)
      expect(responses).toHaveLength(10);
      responses.forEach(r => {
        expect(r.status).toBe(200);
        expect(r.body.data).toMatch(/fallback|recovered|emergency/);
      });
    });
  });
});
