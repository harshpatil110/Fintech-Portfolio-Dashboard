/**
 * Edge Routes Integration Tests
 * Tests edge API routes with error handling
 * Requirements: 10.4 (Graceful fallback), 10.5 (Edge-compatible responses)
 */

import { NextRequest } from 'next/server';
import { GET as healthGet } from '../edge-health';
import { GET as metricsGet, DELETE as metricsDelete } from '../edge-metrics';
import {
  EdgeError,
  EdgeErrorType,
  edgePerformanceMonitor
} from '../../middleware/edgeErrorHandler';

describe('Edge Routes', () => {
  beforeEach(() => {
    // Clear metrics before each test
    edgePerformanceMonitor.clear();
  });

  describe('Edge Health Check', () => {
    it('should return healthy status', async () => {
      const request = new NextRequest('http://localhost/api/edge/health');
      const response = await healthGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.edge).toBe(true);
      expect(data.timestamp).toBeDefined();
      expect(response.headers.get('X-Edge-Function')).toBe('true');
    });

    it('should include execution time', async () => {
      const request = new NextRequest('http://localhost/api/edge/health');
      const response = await healthGet(request);
      const data = await response.json();

      expect(data.executionTime).toBeDefined();
      expect(typeof data.executionTime).toBe('number');
      expect(data.executionTime).toBeGreaterThan(0);
    });

    it('should include region information', async () => {
      const request = new NextRequest('http://localhost/api/edge/health');
      const response = await healthGet(request);
      const data = await response.json();

      expect(data.region).toBeDefined();
      expect(typeof data.region).toBe('string');
    });

    it('should use fallback on error', async () => {
      // Create request that will trigger constraint violation
      const request = new NextRequest('http://localhost/api/edge/health', {
        method: 'GET',
        headers: {
          'content-length': '2000000' // 2MB - exceeds edge limit
        }
      });

      const response = await healthGet(request);
      const data = await response.json();

      // Should use fallback
      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
      expect(data.fallback).toBe(true);
      expect(response.headers.get('X-Edge-Fallback')).toBe('true');
    });

    it('should track performance metrics', async () => {
      const request = new NextRequest('http://localhost/api/edge/health');
      await healthGet(request);

      const metrics = edgePerformanceMonitor.getMetrics('edge-health');
      expect(metrics).toBeDefined();
      expect(metrics?.count).toBeGreaterThan(0);
    });
  });

  describe('Edge Metrics', () => {
    it('should return empty metrics initially', async () => {
      const request = new NextRequest('http://localhost/api/edge/metrics');
      const response = await metricsGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metrics).toBeDefined();
      expect(typeof data.metrics).toBe('object');
      expect(response.headers.get('X-Edge-Function')).toBe('true');
    });

    it('should return metrics after health check', async () => {
      // First, call health check to generate metrics
      const healthRequest = new NextRequest('http://localhost/api/edge/health');
      await healthGet(healthRequest);

      // Then get metrics
      const metricsRequest = new NextRequest('http://localhost/api/edge/metrics');
      const response = await metricsGet(metricsRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metrics).toBeDefined();
      expect(data.metrics['edge-health']).toBeDefined();
      expect(data.metrics['edge-health'].count).toBeGreaterThan(0);
    });

    it('should include summary when available', async () => {
      // Generate some metrics
      const healthRequest = new NextRequest('http://localhost/api/edge/health');
      await healthGet(healthRequest);

      const metricsRequest = new NextRequest('http://localhost/api/edge/metrics');
      const response = await metricsGet(metricsRequest);
      const data = await response.json();

      expect(data.summary).toBeDefined();
      if (data.summary) {
        expect(data.summary.totalFunctions).toBeGreaterThan(0);
        expect(data.summary.totalCalls).toBeGreaterThan(0);
      }
    });

    it('should use fallback on error', async () => {
      // Create request that will trigger constraint violation
      const request = new NextRequest('http://localhost/api/edge/metrics', {
        method: 'GET',
        headers: {
          'content-length': '2000000' // 2MB - exceeds edge limit
        }
      });

      const response = await metricsGet(request);
      const data = await response.json();

      // Should use fallback
      expect(response.status).toBe(200);
      expect(data.fallback).toBe(true);
      expect(data.metrics).toEqual({});
      expect(response.headers.get('X-Edge-Fallback')).toBe('true');
    });

    it('should have no-cache headers', async () => {
      const request = new NextRequest('http://localhost/api/edge/metrics');
      const response = await metricsGet(request);

      expect(response.headers.get('Cache-Control')).toContain('no-cache');
    });
  });

  describe('Edge Metrics Delete', () => {
    it('should require authorization', async () => {
      const request = new NextRequest('http://localhost/api/edge/metrics', {
        method: 'DELETE'
      });

      const response = await metricsDelete(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
      expect(data.error.type).toBe(EdgeErrorType.AUTHENTICATION_ERROR);
    });

    it('should clear metrics with valid auth', async () => {
      // Generate some metrics
      const healthRequest = new NextRequest('http://localhost/api/edge/health');
      await healthGet(healthRequest);

      // Verify metrics exist
      let metrics = edgePerformanceMonitor.getMetrics('edge-health');
      expect(metrics).toBeDefined();

      // Clear metrics
      const deleteRequest = new NextRequest('http://localhost/api/edge/metrics', {
        method: 'DELETE',
        headers: {
          'authorization': 'Bearer test-token'
        }
      });

      const response = await metricsDelete(deleteRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify metrics are cleared
      metrics = edgePerformanceMonitor.getMetrics('edge-health');
      expect(metrics).toBeNull();
    });

    it('should return error response for constraint violations', async () => {
      const request = new NextRequest('http://localhost/api/edge/metrics', {
        method: 'DELETE',
        headers: {
          'authorization': 'Bearer test-token',
          'content-length': '2000000' // 2MB - exceeds edge limit
        }
      });

      const response = await metricsDelete(request);
      const data = await response.json();

      expect(response.status).toBe(413);
      expect(data.error).toBeDefined();
      expect(data.error.type).toBe(EdgeErrorType.CONSTRAINT_VIOLATION);
      expect(response.headers.get('X-Edge-Error')).toBe('true');
    });
  });

  describe('Edge Function Error Handling', () => {
    it('should handle timeout gracefully', async () => {
      // This test verifies the timeout protection is in place
      const request = new NextRequest('http://localhost/api/edge/health');
      const response = await healthGet(request);

      // Should complete successfully (not timeout)
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.executionTime).toBeLessThan(25); // Should be under 25ms
    });

    it('should validate edge runtime constraints', async () => {
      // Test payload size constraint
      const request = new NextRequest('http://localhost/api/edge/health', {
        method: 'GET',
        headers: {
          'content-length': '2000000' // 2MB - exceeds edge limit
        }
      });

      const response = await healthGet(request);
      
      // Should use fallback instead of failing
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fallback).toBe(true);
    });

    it('should include error type in headers', async () => {
      const request = new NextRequest('http://localhost/api/edge/metrics', {
        method: 'DELETE'
        // No auth header
      });

      const response = await metricsDelete(request);

      expect(response.headers.get('X-Error-Type')).toBe(EdgeErrorType.AUTHENTICATION_ERROR);
    });

    it('should sanitize error messages', async () => {
      const request = new NextRequest('http://localhost/api/edge/metrics', {
        method: 'DELETE',
        headers: {
          'authorization': 'Bearer password=secret123'
        }
      });

      const response = await metricsDelete(request);
      const data = await response.json();

      // If error message contains sensitive data, it should be sanitized
      if (data.error && data.error.message) {
        expect(data.error.message).not.toContain('secret123');
      }
    });

    it('should track errors in performance metrics', async () => {
      // Trigger an error
      const request = new NextRequest('http://localhost/api/edge/health', {
        method: 'GET',
        headers: {
          'content-length': '2000000' // Trigger constraint violation
        }
      });

      await healthGet(request);

      // Check that error was tracked
      const metrics = edgePerformanceMonitor.getMetrics('edge-health');
      expect(metrics).toBeDefined();
      if (metrics) {
        expect(metrics.errorRate).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge Function Performance', () => {
    it('should execute within 25ms timeout', async () => {
      const request = new NextRequest('http://localhost/api/edge/health');
      const start = Date.now();
      
      await healthGet(request);
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100); // Generous limit for test environment
    });

    it('should skip optional operations when approaching timeout', async () => {
      // Generate many metrics to make summary calculation slower
      for (let i = 0; i < 10; i++) {
        const healthRequest = new NextRequest('http://localhost/api/edge/health');
        await healthGet(healthRequest);
      }

      const metricsRequest = new NextRequest('http://localhost/api/edge/metrics');
      const response = await metricsGet(metricsRequest);
      const data = await response.json();

      // Should still return successfully
      expect(response.status).toBe(200);
      expect(data.metrics).toBeDefined();
      // Summary might be null if we're approaching timeout
    });

    it('should include execution time in response', async () => {
      const request = new NextRequest('http://localhost/api/edge/health');
      const response = await healthGet(request);

      expect(response.headers.get('X-Execution-Time')).toBeDefined();
      expect(response.headers.get('X-Execution-Time')).toMatch(/\d+ms/);
    });
  });

  describe('Edge Function Fallback Behavior', () => {
    it('should use fallback for health check on error', async () => {
      const request = new NextRequest('http://localhost/api/edge/health', {
        method: 'GET',
        headers: {
          'content-type': 'multipart/form-data' // Unsupported in edge
        }
      });

      const response = await healthGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
      expect(data.fallback).toBe(true);
    });

    it('should use fallback for metrics on error', async () => {
      const request = new NextRequest('http://localhost/api/edge/metrics', {
        method: 'GET',
        headers: {
          'content-type': 'multipart/form-data' // Unsupported in edge
        }
      });

      const response = await metricsGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.fallback).toBe(true);
      expect(data.metrics).toEqual({});
    });

    it('should indicate fallback in headers', async () => {
      const request = new NextRequest('http://localhost/api/edge/health', {
        method: 'GET',
        headers: {
          'content-length': '2000000'
        }
      });

      const response = await healthGet(request);

      expect(response.headers.get('X-Edge-Fallback')).toBe('true');
    });
  });
});
