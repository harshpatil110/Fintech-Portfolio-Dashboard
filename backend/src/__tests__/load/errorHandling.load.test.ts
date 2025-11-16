/**
 * Load Tests for Error Handling System
 * Tests system behavior under high load and stress conditions
 * 
 * Requirements: All requirements benefit from testing
 */

import request from 'supertest';
import express, { Express } from 'express';
import { CircuitBreaker } from '../../utils/circuitBreaker';
import { CacheManager } from '../../utils/cacheManager';
import { RateLimiter } from '../../utils/rateLimiter';
import { createRateLimitMiddleware } from '../../middleware/rateLimiter';
import redisClient from '../../config/redis';

describe('Error Handling Load Tests', () => {
  let app: Express;
  let testCache: CacheManager;

  beforeAll(async () => {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  });

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    testCache = new CacheManager('load-test:');
    await testCache.clear();
  });

  afterAll(async () => {
    await testCache.clear();
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  });

  describe('Rate Limiting Load Tests', () => {
    it('should handle 1000 concurrent requests with rate limiting', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 100,
        keyPrefix: 'load-test-1000'
      });

      const middleware = createRateLimitMiddleware(
        rateLimiter,
        'RATE_LIMIT',
        'Too many requests'
      );

      app.get('/api/load', middleware, (req, res) => {
        res.json({ success: true, timestamp: Date.now() });
      });

      const startTime = Date.now();
      
      // Create 1000 concurrent requests
      const promises = Array(1000).fill(null).map((_, i) =>
        request(app)
          .get('/api/load')
          .set('X-Forwarded-For', `192.168.1.${i % 10}`) // Simulate 10 different IPs
          .catch(err => ({ status: 500, body: { error: err.message } }))
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Analyze results
      const successful = results.filter(r => r.status === 200).length;
      const rateLimited = results.filter(r => r.status === 429).length;
      const errors = results.filter(r => r.status === 500).length;

      console.log(`Load Test Results (1000 requests in ${duration}ms):`);
      console.log(`  Successful: ${successful}`);
      console.log(`  Rate Limited: ${rateLimited}`);
      console.log(`  Errors: ${errors}`);

      // Assertions
      expect(successful + rateLimited + errors).toBe(1000);
      expect(errors).toBeLessThan(50); // Less than 5% errors
      expect(duration).toBeLessThan(10000); // Complete within 10 seconds
    });

    it('should maintain rate limit accuracy under burst traffic', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 10,
        keyPrefix: 'burst-test'
      });

      const middleware = createRateLimitMiddleware(
        rateLimiter,
        'RATE_LIMIT',
        'Too many requests'
      );

      app.get('/api/burst', middleware, (req, res) => {
        res.json({ success: true });
      });

      // Send 3 bursts of 20 requests each
      const bursts = [];
      for (let burst = 0; burst < 3; burst++) {
        const burstPromises = Array(20).fill(null).map(() =>
          request(app).get('/api/burst')
        );
        bursts.push(Promise.all(burstPromises));
        
        // Wait between bursts
        if (burst < 2) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }

      const allResults = (await Promise.all(bursts)).flat();

      // Each burst should allow ~10 requests
      const successfulPerBurst = bursts.map((_, i) => {
        const start = i * 20;
        const end = start + 20;
        return allResults.slice(start, end).filter(r => r.status === 200).length;
      });

      console.log('Successful requests per burst:', successfulPerBurst);

      // Each burst should have approximately 10 successful requests
      successfulPerBurst.forEach(count => {
        expect(count).toBeGreaterThanOrEqual(8);
        expect(count).toBeLessThanOrEqual(12);
      });
    });

    it('should handle rate limiting for multiple endpoints simultaneously', async () => {
      const portfolioLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'portfolio'
      });

      const marketLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 300,
        keyPrefix: 'market'
      });

      app.get('/api/portfolio', 
        createRateLimitMiddleware(portfolioLimiter, 'RATE_LIMIT', 'Too many requests'),
        (req, res) => res.json({ endpoint: 'portfolio' })
      );

      app.get('/api/market',
        createRateLimitMiddleware(marketLimiter, 'RATE_LIMIT', 'Too many requests'),
        (req, res) => res.json({ endpoint: 'market' })
      );

      // Make concurrent requests to both endpoints
      const portfolioRequests = Array(150).fill(null).map(() =>
        request(app).get('/api/portfolio')
      );

      const marketRequests = Array(400).fill(null).map(() =>
        request(app).get('/api/market')
      );

      const [portfolioResults, marketResults] = await Promise.all([
        Promise.all(portfolioRequests),
        Promise.all(marketRequests)
      ]);

      const portfolioSuccess = portfolioResults.filter(r => r.status === 200).length;
      const marketSuccess = marketResults.filter(r => r.status === 200).length;

      console.log(`Portfolio: ${portfolioSuccess}/150 successful`);
      console.log(`Market: ${marketSuccess}/400 successful`);

      // Portfolio should allow ~100 requests
      expect(portfolioSuccess).toBeGreaterThanOrEqual(90);
      expect(portfolioSuccess).toBeLessThanOrEqual(110);

      // Market should allow ~300 requests
      expect(marketSuccess).toBeGreaterThanOrEqual(280);
      expect(marketSuccess).toBeLessThanOrEqual(320);
    });
  });

  describe('Circuit Breaker Load Tests', () => {
    it('should handle high failure rate and protect system', async () => {
      let callCount = 0;
      const failingService = async () => {
        callCount++;
        // 80% failure rate
        if (Math.random() < 0.8) {
          throw new Error('Service failure');
        }
        return { data: 'success' };
      };

      const circuitBreaker = new CircuitBreaker('load-test-service', {
        failureThreshold: 5,
        resetTimeout: 2000,
        monitoringPeriod: 10000
      });

      app.get('/api/unreliable', async (req, res) => {
        try {
          const result = await circuitBreaker.execute(
            failingService,
            async () => ({ data: 'fallback' })
          );
          res.json(result);
        } catch (error) {
          res.status(500).json({ error: 'Service error' });
        }
      });

      // Make 100 requests
      const promises = Array(100).fill(null).map(() =>
        request(app).get('/api/unreliable')
      );

      const results = await Promise.all(promises);

      const successful = results.filter(r => r.status === 200).length;
      const fallbackResponses = results.filter(r => 
        r.status === 200 && r.body.data === 'fallback'
      ).length;

      console.log(`Circuit Breaker Load Test:`);
      console.log(`  Total requests: 100`);
      console.log(`  Successful: ${successful}`);
      console.log(`  Fallback responses: ${fallbackResponses}`);
      console.log(`  Service calls: ${callCount}`);
      console.log(`  Circuit state: ${circuitBreaker.getState().state}`);

      // All requests should complete successfully (with fallback)
      expect(successful).toBe(100);

      // Circuit breaker should have reduced service calls
      expect(callCount).toBeLessThan(100);

      // Should have used fallback for many requests
      expect(fallbackResponses).toBeGreaterThan(50);
    });

    it('should handle multiple circuit breakers under load', async () => {
      const services = ['service-a', 'service-b', 'service-c'].map(name => ({
        name,
        breaker: new CircuitBreaker(name, {
          failureThreshold: 3,
          resetTimeout: 1000,
          monitoringPeriod: 5000
        }),
        callCount: 0
      }));

      services.forEach(({ name, breaker }) => {
        app.get(`/api/${name}`, async (req, res) => {
          const service = services.find(s => s.name === name)!;
          service.callCount++;

          try {
            const result = await breaker.execute(
              async () => {
                // Random failures
                if (Math.random() < 0.5) {
                  throw new Error('Failure');
                }
                return { service: name, data: 'success' };
              },
              async () => ({ service: name, data: 'fallback' })
            );
            res.json(result);
          } catch (error) {
            res.status(500).json({ error: 'Service error' });
          }
        });
      });

      // Make concurrent requests to all services
      const allPromises = services.flatMap(({ name }) =>
        Array(50).fill(null).map(() =>
          request(app).get(`/api/${name}`)
        )
      );

      const results = await Promise.all(allPromises);

      console.log('Multiple Circuit Breakers Load Test:');
      services.forEach(({ name, breaker, callCount }) => {
        const serviceResults = results.filter(r => 
          r.body.service === name
        );
        const successful = serviceResults.filter(r => r.status === 200).length;
        
        console.log(`  ${name}:`);
        console.log(`    Requests: ${serviceResults.length}`);
        console.log(`    Successful: ${successful}`);
        console.log(`    Service calls: ${callCount}`);
        console.log(`    Circuit state: ${breaker.getState().state}`);
      });

      // All requests should complete
      expect(results.length).toBe(150);
      expect(results.every(r => r.status === 200 || r.status === 500)).toBe(true);
    });
  });

  describe('Cache Performance Load Tests', () => {
    it('should handle 1000 concurrent cache requests efficiently', async () => {
      let fetchCount = 0;
      const expensiveOperation = async (key: string) => {
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return { key, data: `result-${fetchCount}`, timestamp: Date.now() };
      };

      app.get('/api/cached/:key', async (req, res) => {
        const { key } = req.params;
        const result = await testCache.get(
          key,
          () => expensiveOperation(key),
          { ttl: 60, staleWhileRevalidate: 30 }
        );
        res.json(result);
      });

      const startTime = Date.now();

      // Make 1000 requests to 10 different keys
      const promises = Array(1000).fill(null).map((_, i) => {
        const key = `key-${i % 10}`;
        return request(app).get(`/api/cached/${key}`);
      });

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      console.log(`Cache Load Test (1000 requests):`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Fetch count: ${fetchCount}`);
      console.log(`  Cache hit rate: ${((1000 - fetchCount) / 1000 * 100).toFixed(2)}%`);

      // All requests should succeed
      expect(results.every(r => r.status === 200)).toBe(true);

      // Should have fetched only ~10 times (one per key)
      expect(fetchCount).toBeLessThan(20);

      // Should complete quickly due to caching
      expect(duration).toBeLessThan(5000);
    });

    it('should handle cache stampede gracefully', async () => {
      let fetchCount = 0;
      const slowOperation = async () => {
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 500));
        return { data: `result-${fetchCount}`, timestamp: Date.now() };
      };

      app.get('/api/stampede', async (req, res) => {
        const result = await testCache.get(
          'stampede-key',
          slowOperation,
          { ttl: 1, staleWhileRevalidate: 1 }
        );
        res.json(result);
      });

      // Clear cache to simulate cold start
      await testCache.delete('stampede-key');

      // Make 100 concurrent requests (cache stampede scenario)
      const promises = Array(100).fill(null).map(() =>
        request(app).get('/api/stampede')
      );

      const results = await Promise.all(promises);

      console.log(`Cache Stampede Test:`);
      console.log(`  Concurrent requests: 100`);
      console.log(`  Fetch count: ${fetchCount}`);
      console.log(`  All successful: ${results.every(r => r.status === 200)}`);

      // All requests should succeed
      expect(results.every(r => r.status === 200)).toBe(true);

      // Should have fetched only once or very few times (stampede protection)
      expect(fetchCount).toBeLessThan(5);
    });

    it('should maintain performance with stale-while-revalidate under load', async () => {
      let fetchCount = 0;
      const dataSource = async () => {
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 200));
        return { data: `version-${fetchCount}`, timestamp: Date.now() };
      };

      app.get('/api/swr', async (req, res) => {
        const result = await testCache.get(
          'swr-key',
          dataSource,
          { ttl: 1, staleWhileRevalidate: 2 }
        );
        res.json(result);
      });

      // Initial request to populate cache
      await request(app).get('/api/swr');
      expect(fetchCount).toBe(1);

      // Wait for data to become stale
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Make 50 concurrent requests while data is stale
      const promises = Array(50).fill(null).map(() =>
        request(app).get('/api/swr')
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      console.log(`Stale-While-Revalidate Load Test:`);
      console.log(`  Requests: 50`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Fetch count: ${fetchCount}`);
      console.log(`  Avg response time: ${(duration / 50).toFixed(2)}ms`);

      // All requests should succeed quickly (serving stale data)
      expect(results.every(r => r.status === 200)).toBe(true);
      expect(duration).toBeLessThan(1000); // Should be fast (not waiting for fetch)

      // Should have triggered background revalidation
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(fetchCount).toBeGreaterThan(1);
    });
  });

  describe('Combined System Load Tests', () => {
    it('should handle realistic production load scenario', async () => {
      // Setup realistic system with all components
      const circuitBreaker = new CircuitBreaker('prod-service', {
        failureThreshold: 5,
        resetTimeout: 5000,
        monitoringPeriod: 30000
      });

      const rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 200,
        keyPrefix: 'prod-test'
      });

      let serviceCallCount = 0;
      const service = async () => {
        serviceCallCount++;
        // Simulate 10% failure rate
        if (Math.random() < 0.1) {
          throw new Error('Service error');
        }
        await new Promise(resolve => setTimeout(resolve, 50));
        return { data: `result-${serviceCallCount}`, timestamp: Date.now() };
      };

      app.get('/api/production',
        createRateLimitMiddleware(rateLimiter, 'RATE_LIMIT', 'Too many requests'),
        async (req, res) => {
          try {
            const cacheKey = `prod-${Date.now() % 5}`; // 5 different cache keys
            const result = await testCache.get(
              cacheKey,
              async () => {
                return await circuitBreaker.execute(
                  service,
                  async () => ({ data: 'fallback', timestamp: Date.now() })
                );
              },
              { ttl: 5, staleWhileRevalidate: 2 }
            );
            res.json(result);
          } catch (error) {
            res.status(500).json({ error: 'Service unavailable' });
          }
        }
      );

      const startTime = Date.now();

      // Simulate realistic traffic pattern: 500 requests over time
      const waves = [];
      for (let wave = 0; wave < 5; wave++) {
        const wavePromises = Array(100).fill(null).map(() =>
          request(app).get('/api/production')
        );
        waves.push(Promise.all(wavePromises));
        
        // Small delay between waves
        if (wave < 4) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      const allResults = (await Promise.all(waves)).flat();
      const duration = Date.now() - startTime;

      // Analyze results
      const successful = allResults.filter(r => r.status === 200).length;
      const rateLimited = allResults.filter(r => r.status === 429).length;
      const errors = allResults.filter(r => r.status === 500).length;
      const fallbackResponses = allResults.filter(r =>
        r.status === 200 && r.body.data === 'fallback'
      ).length;

      console.log(`\nProduction Load Test Results:`);
      console.log(`  Total requests: 500`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Successful: ${successful} (${(successful/500*100).toFixed(1)}%)`);
      console.log(`  Rate limited: ${rateLimited} (${(rateLimited/500*100).toFixed(1)}%)`);
      console.log(`  Errors: ${errors} (${(errors/500*100).toFixed(1)}%)`);
      console.log(`  Fallback responses: ${fallbackResponses}`);
      console.log(`  Service calls: ${serviceCallCount}`);
      console.log(`  Cache efficiency: ${((500-serviceCallCount)/500*100).toFixed(1)}%`);
      console.log(`  Circuit state: ${circuitBreaker.getState().state}`);
      console.log(`  Avg response time: ${(duration/500).toFixed(2)}ms`);

      // Assertions for production-quality system
      expect(successful + rateLimited).toBeGreaterThan(450); // >90% success or rate limited
      expect(errors).toBeLessThan(50); // <10% errors
      expect(serviceCallCount).toBeLessThan(500); // Cache should reduce calls
      expect(duration).toBeLessThan(15000); // Complete within 15 seconds
    });
  });
});
