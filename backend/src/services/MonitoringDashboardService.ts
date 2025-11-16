/**
 * Monitoring Dashboard Service
 * 
 * Aggregates metrics from error monitoring, circuit breakers, rate limiters,
 * and performance tracking to provide a comprehensive monitoring dashboard.
 * 
 * Requirements: 8.2, 8.3
 */

import { errorMonitoringService, ErrorStats } from './ErrorMonitoringService';
import { CircuitBreakerState } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

/**
 * System health status
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerMinute: number;
  totalRequests: number;
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  serviceName: string;
  state: string;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
}

/**
 * Rate limiter metrics
 */
export interface RateLimiterMetrics {
  totalRequests: number;
  blockedRequests: number;
  blockRate: number;
  topBlockedEndpoints: Array<{ endpoint: string; count: number }>;
}

/**
 * Timeout metrics
 */
export interface TimeoutMetrics {
  totalTimeouts: number;
  timeoutRate: number;
  avgExecutionTime: number;
  topSlowEndpoints: Array<{ endpoint: string; avgTime: number }>;
}

/**
 * Dashboard summary
 */
export interface DashboardSummary {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  errors: ErrorStats;
  performance: PerformanceMetrics;
  circuitBreakers: CircuitBreakerMetrics[];
  rateLimiter: RateLimiterMetrics;
  timeouts: TimeoutMetrics;
  alerts: Alert[];
}

/**
 * Alert definition
 */
export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  source: string;
  metadata?: Record<string, any>;
}

/**
 * Request tracking for performance metrics
 */
interface RequestMetric {
  endpoint: string;
  method: string;
  duration: number;
  statusCode: number;
  timestamp: number;
}

/**
 * Monitoring Dashboard Service
 */
export class MonitoringDashboardService {
  private startTime: number;
  private requestMetrics: RequestMetric[] = [];
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private rateLimiterStats = {
    totalRequests: 0,
    blockedRequests: 0,
    blockedByEndpoint: new Map<string, number>()
  };
  private timeoutStats = {
    totalTimeouts: 0,
    executionTimes: new Map<string, number[]>()
  };
  private alerts: Alert[] = [];
  private maxMetricsRetention = 3600000; // 1 hour
  private maxAlertsRetention = 100;

  constructor() {
    this.startTime = Date.now();
    
    // Clean up old metrics periodically
    setInterval(() => this.cleanupOldMetrics(), 60000); // Every minute
  }

  /**
   * Track a request for performance metrics
   */
  trackRequest(
    endpoint: string,
    method: string,
    duration: number,
    statusCode: number
  ): void {
    this.requestMetrics.push({
      endpoint,
      method,
      duration,
      statusCode,
      timestamp: Date.now()
    });

    // Track in Vercel Analytics
    this.trackInVercelAnalytics(endpoint, method, statusCode, duration);
  }

  /**
   * Track in Vercel Analytics
   */
  private async trackInVercelAnalytics(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number
  ): Promise<void> {
    try {
      const { trackApiCall } = await import('../integrations/vercel-analytics');
      await trackApiCall(endpoint, method, statusCode, duration);
    } catch (error) {
      // Silently fail if not available
    }
  }

  /**
   * Register a circuit breaker
   */
  registerCircuitBreaker(state: CircuitBreakerState): void {
    this.circuitBreakers.set(state.serviceName, state);
    
    // Create alert if circuit opened
    if (state.state === 'OPEN') {
      this.createAlert({
        severity: 'critical',
        message: `Circuit breaker opened for ${state.serviceName}`,
        source: 'circuit_breaker',
        metadata: { serviceName: state.serviceName, failureCount: state.failureCount }
      });
    }
  }

  /**
   * Track rate limiter event
   */
  trackRateLimitEvent(endpoint: string, blocked: boolean): void {
    this.rateLimiterStats.totalRequests++;
    
    if (blocked) {
      this.rateLimiterStats.blockedRequests++;
      const count = this.rateLimiterStats.blockedByEndpoint.get(endpoint) || 0;
      this.rateLimiterStats.blockedByEndpoint.set(endpoint, count + 1);
      
      // Create alert if block rate is high
      const blockRate = this.rateLimiterStats.blockedRequests / this.rateLimiterStats.totalRequests;
      if (blockRate > 0.1) { // More than 10% blocked
        this.createAlert({
          severity: 'warning',
          message: `High rate limit block rate: ${(blockRate * 100).toFixed(2)}%`,
          source: 'rate_limiter',
          metadata: { blockRate, endpoint }
        });
      }
    }
  }

  /**
   * Track timeout event
   */
  trackTimeout(endpoint: string, executionTime: number, timedOut: boolean): void {
    if (timedOut) {
      this.timeoutStats.totalTimeouts++;
      
      this.createAlert({
        severity: 'warning',
        message: `Timeout occurred on ${endpoint}`,
        source: 'timeout',
        metadata: { endpoint, executionTime }
      });
    }
    
    // Track execution time
    const times = this.timeoutStats.executionTimes.get(endpoint) || [];
    times.push(executionTime);
    this.timeoutStats.executionTimes.set(endpoint, times);
  }

  /**
   * Create an alert
   */
  private createAlert(alert: Omit<Alert, 'id' | 'timestamp'>): void {
    const newAlert: Alert = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...alert
    };
    
    this.alerts.unshift(newAlert);
    
    // Keep only recent alerts
    if (this.alerts.length > this.maxAlertsRetention) {
      this.alerts = this.alerts.slice(0, this.maxAlertsRetention);
    }
    
    // Log alert
    logger.warn(`Alert: ${newAlert.message}`, undefined, {
      alertId: newAlert.id,
      severity: newAlert.severity,
      source: newAlert.source
    });
  }

  /**
   * Get performance metrics
   */
  private getPerformanceMetrics(): PerformanceMetrics {
    if (this.requestMetrics.length === 0) {
      return {
        avgResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        requestsPerMinute: 0,
        totalRequests: 0
      };
    }

    const durations = this.requestMetrics.map(m => m.duration).sort((a, b) => a - b);
    const avgResponseTime = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    
    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentRequests = this.requestMetrics.filter(m => m.timestamp > oneMinuteAgo);
    
    return {
      avgResponseTime: Math.round(avgResponseTime),
      p50ResponseTime: durations[p50Index] || 0,
      p95ResponseTime: durations[p95Index] || 0,
      p99ResponseTime: durations[p99Index] || 0,
      requestsPerMinute: recentRequests.length,
      totalRequests: this.requestMetrics.length
    };
  }

  /**
   * Get circuit breaker metrics
   */
  private getCircuitBreakerMetrics(): CircuitBreakerMetrics[] {
    return Array.from(this.circuitBreakers.values()).map(cb => ({
      serviceName: cb.serviceName,
      state: cb.state,
      failureCount: cb.failureCount,
      successCount: 0, // Would need to track this separately
      lastFailureTime: cb.lastFailureTime || null,
      lastSuccessTime: cb.lastSuccessTime || null
    }));
  }

  /**
   * Get rate limiter metrics
   */
  private getRateLimiterMetrics(): RateLimiterMetrics {
    const topBlocked = Array.from(this.rateLimiterStats.blockedByEndpoint.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    const blockRate = this.rateLimiterStats.totalRequests > 0
      ? this.rateLimiterStats.blockedRequests / this.rateLimiterStats.totalRequests
      : 0;
    
    return {
      totalRequests: this.rateLimiterStats.totalRequests,
      blockedRequests: this.rateLimiterStats.blockedRequests,
      blockRate: Math.round(blockRate * 10000) / 100, // Percentage with 2 decimals
      topBlockedEndpoints: topBlocked
    };
  }

  /**
   * Get timeout metrics
   */
  private getTimeoutMetrics(): TimeoutMetrics {
    const allTimes: number[] = [];
    const avgByEndpoint: Array<{ endpoint: string; avgTime: number }> = [];
    
    for (const [endpoint, times] of this.timeoutStats.executionTimes.entries()) {
      allTimes.push(...times);
      const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
      avgByEndpoint.push({ endpoint, avgTime: Math.round(avg) });
    }
    
    const avgExecutionTime = allTimes.length > 0
      ? Math.round(allTimes.reduce((sum, t) => sum + t, 0) / allTimes.length)
      : 0;
    
    const timeoutRate = this.requestMetrics.length > 0
      ? this.timeoutStats.totalTimeouts / this.requestMetrics.length
      : 0;
    
    const topSlow = avgByEndpoint
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);
    
    return {
      totalTimeouts: this.timeoutStats.totalTimeouts,
      timeoutRate: Math.round(timeoutRate * 10000) / 100, // Percentage
      avgExecutionTime,
      topSlowEndpoints: topSlow
    };
  }

  /**
   * Determine overall health status
   */
  private determineHealthStatus(): HealthStatus {
    const errorStats = errorMonitoringService.getStats();
    const errorRateThreshold = parseInt(process.env.ERROR_RATE_THRESHOLD || '10', 10);
    
    // Check for critical conditions
    const hasOpenCircuits = Array.from(this.circuitBreakers.values())
      .some(cb => cb.state === 'OPEN');
    const highErrorRate = errorStats.errorRate > errorRateThreshold;
    const highTimeoutRate = this.timeoutStats.totalTimeouts / Math.max(this.requestMetrics.length, 1) > 0.05;
    
    if (hasOpenCircuits || highErrorRate || highTimeoutRate) {
      return HealthStatus.UNHEALTHY;
    }
    
    // Check for warning conditions
    const moderateErrorRate = errorStats.errorRate > errorRateThreshold * 0.5;
    const highBlockRate = this.rateLimiterStats.blockedRequests / Math.max(this.rateLimiterStats.totalRequests, 1) > 0.1;
    
    if (moderateErrorRate || highBlockRate) {
      return HealthStatus.DEGRADED;
    }
    
    return HealthStatus.HEALTHY;
  }

  /**
   * Get dashboard summary
   */
  getDashboardSummary(): DashboardSummary {
    const status = this.determineHealthStatus();
    const uptime = Date.now() - this.startTime;
    
    return {
      status,
      timestamp: new Date().toISOString(),
      uptime,
      errors: errorMonitoringService.getStats(),
      performance: this.getPerformanceMetrics(),
      circuitBreakers: this.getCircuitBreakerMetrics(),
      rateLimiter: this.getRateLimiterMetrics(),
      timeouts: this.getTimeoutMetrics(),
      alerts: this.alerts.slice(0, 20) // Return last 20 alerts
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 50): Alert[] {
    return this.alerts.slice(0, limit);
  }

  /**
   * Clear an alert
   */
  clearAlert(alertId: string): boolean {
    const index = this.alerts.findIndex(a => a.id === alertId);
    if (index !== -1) {
      this.alerts.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all alerts
   */
  clearAllAlerts(): void {
    this.alerts = [];
  }

  /**
   * Clean up old metrics
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - this.maxMetricsRetention;
    
    // Clean up request metrics
    this.requestMetrics = this.requestMetrics.filter(
      m => m.timestamp > cutoffTime
    );
    
    // Clean up execution times
    for (const [endpoint, times] of this.timeoutStats.executionTimes.entries()) {
      if (times.length > 1000) {
        // Keep only recent 1000 entries per endpoint
        this.timeoutStats.executionTimes.set(endpoint, times.slice(-1000));
      }
    }
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.requestMetrics = [];
    this.circuitBreakers.clear();
    this.rateLimiterStats = {
      totalRequests: 0,
      blockedRequests: 0,
      blockedByEndpoint: new Map()
    };
    this.timeoutStats = {
      totalTimeouts: 0,
      executionTimes: new Map()
    };
    this.alerts = [];
    errorMonitoringService.resetStats();
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

/**
 * Default monitoring dashboard service instance
 */
export const monitoringDashboardService = new MonitoringDashboardService();

export default monitoringDashboardService;
