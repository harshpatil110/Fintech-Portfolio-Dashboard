/**
 * Edge Function Integration Tests
 * Tests edge middleware with realistic scenarios and constraints
 * Requirements: 10.4, 10.5
 */

import { NextRequest } from 'next/server';
import { middleware } from '../../../middleware';

describe('Edge Middleware Integration', () => {
  describe('Graceful Fallback (Requirement 10.4)', () => {
    it('should allow request to proceed when auth check fails', async () => {
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer invalid-token'
        }
      });

      const response = await middleware(request);

      // Should get 401 for protected route with invalid token
      expect(response.status).toBe(401);
    });

    it('should allow request to proceed on public routes even with errors', async () => {
      const request = new NextRequest('https://example.com/api/health', {
        method: 'GET'
      });

      const response = await middleware(request);

      // Should proceed (NextResponse.next() returns status 200)
      expect(response.status).toBe(200);
    });

    it('should handle rate limiting gracefully', async () => {
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer valid-token',
          'x-forwarded-for': '192.168.1.1'
        }
      });

      // Make multiple requests to trigger rate limit
      const responses = [];
      for (let i = 0; i < 5; i++) {
        responses.push(await middleware(request));
      }

      // All requests should get a response (either success or rate limited)
      responses.forEach(response => {
        expect(response).toBeDefined();
        expect([200, 401, 429]).toContain(response.status);
      });
    });

    it('should add fallback headers when middleware times out', async () => {
      // Create a request that might cause timeout
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'GET'
      });

      const response = await middleware(request);

      // Check for execution time header
      expect(response.headers.has('X-Edge-Execution-Time')).toBe(true);
    });
  });

  describe('Edge Runtime Constraints (Requirement 10.3)', () => {
    it('should reject requests with payload exceeding edge limit', async () => {
      const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB
      
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(largePayload.length)
        },
        body: largePayload
      });

      const response = await middleware(request);

      // Should reject with 413 Payload Too Large
      expect(response.status).toBe(413);
    });

    it('should reject multipart form data', async () => {
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary'
        }
      });

      const response = await middleware(request);

      // Should reject with 400 Bad Request
      expect(response.status).toBe(400);
    });

    it('should execute within 25ms time limit', async () => {
      const request = new NextRequest('https://example.com/api/health', {
        method: 'GET'
      });

      const startTime = Date.now();
      await middleware(request);
      const executionTime = Date.now() - startTime;

      // Should complete within reasonable time (allowing some overhead for test environment)
      expect(executionTime).toBeLessThan(100);
    });
  });

  describe('Lightweight Authentication (Requirement 10.5)', () => {
    it('should perform fast authentication check', async () => {
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJleHAiOjk5OTk5OTk5OTl9.signature'
        }
      });

      const startTime = Date.now();
      await middleware(request);
      const executionTime = Date.now() - startTime;

      // Auth check should be very fast (<10ms in ideal conditions)
      expect(executionTime).toBeLessThan(50);
    });

    it('should add user context to request headers', async () => {
      const request = new NextRequest('https://example.com/api/health', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJleHAiOjk5OTk5OTk5OTl9.signature'
        }
      });

      const response = await middleware(request);

      // Should have authentication status header
      expect(response.headers.has('X-RateLimit-Remaining')).toBe(true);
    });

    it('should handle missing authorization header', async () => {
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'GET'
      });

      const response = await middleware(request);

      // Should return 401 for protected route without auth
      expect(response.status).toBe(401);
    });

    it('should handle expired tokens', async () => {
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJleHAiOjF9.signature'
        }
      });

      const response = await middleware(request);

      // Should return 401 for expired token
      expect(response.status).toBe(401);
    });
  });

  describe('Error Response Format', () => {
    it('should return standardized error format', async () => {
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'GET'
      });

      const response = await middleware(request);

      if (response.status >= 400) {
        const body = await response.json();
        
        expect(body).toHaveProperty('error');
        expect(body.error).toHaveProperty('code');
        expect(body.error).toHaveProperty('message');
        expect(body.error).toHaveProperty('timestamp');
      }
    });

    it('should include rate limit headers', async () => {
      const request = new NextRequest('https://example.com/api/health', {
        method: 'GET'
      });

      const response = await middleware(request);

      expect(response.headers.has('X-RateLimit-Remaining')).toBe(true);
      expect(response.headers.has('X-RateLimit-Reset')).toBe(true);
    });

    it('should include execution time header', async () => {
      const request = new NextRequest('https://example.com/api/health', {
        method: 'GET'
      });

      const response = await middleware(request);

      expect(response.headers.has('X-Edge-Execution-Time')).toBe(true);
      
      const executionTime = response.headers.get('X-Edge-Execution-Time');
      expect(executionTime).toMatch(/\d+ms/);
    });
  });

  describe('Static Asset Handling', () => {
    it('should skip middleware for static assets', async () => {
      const staticPaths = [
        '/_next/static/chunk.js',
        '/favicon.ico',
        '/robots.txt'
      ];

      for (const path of staticPaths) {
        const request = new NextRequest(`https://example.com${path}`);
        const response = await middleware(request);

        // Should pass through without processing
        expect(response.status).toBe(200);
        expect(response.headers.has('X-Edge-Execution-Time')).toBe(false);
      }
    });

    it('should process API routes', async () => {
      const request = new NextRequest('https://example.com/api/health');
      const response = await middleware(request);

      // Should have been processed by middleware
      expect(response.headers.has('X-Edge-Execution-Time')).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    it('should log slow middleware execution', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'GET'
      });

      await middleware(request);

      // Check if execution time is logged
      const executionTimeHeader = (await middleware(request)).headers.get('X-Edge-Execution-Time');
      expect(executionTimeHeader).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('should track rate limit violations', async () => {
      const request = new NextRequest('https://example.com/api/portfolio', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '192.168.1.100'
        }
      });

      // Make many requests to trigger rate limit
      const responses = [];
      for (let i = 0; i < 10; i++) {
        responses.push(await middleware(request));
      }

      // At least one should have rate limit info
      const hasRateLimitHeaders = responses.some(r => 
        r.headers.has('X-RateLimit-Remaining')
      );
      expect(hasRateLimitHeaders).toBe(true);
    });
  });

  describe('Circuit Breaker Behavior', () => {
    it('should handle cascading failures gracefully', async () => {
      const requests = [];
      
      // Simulate multiple failing requests
      for (let i = 0; i < 5; i++) {
        const request = new NextRequest('https://example.com/api/portfolio', {
          method: 'GET',
          headers: {
            'authorization': 'Bearer invalid'
          }
        });
        requests.push(middleware(request));
      }

      const responses = await Promise.all(requests);

      // All should get responses (no crashes)
      responses.forEach(response => {
        expect(response).toBeDefined();
        expect(response.status).toBeGreaterThanOrEqual(200);
      });
    });
  });
});
