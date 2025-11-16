import { Request } from 'express';
import { logger, LogContext } from '../utils/logger';

/**
 * Error statistics for monitoring
 */
export interface ErrorStats {
  totalErrors: number;
  errorsByType: Map<string, number>;
  errorsByEndpoint: Map<string, number>;
  errorRate: number;
  lastErrorTime: Date | null;
  windowStart: Date;
}

/**
 * Error event for tracking
 */
export interface ErrorEvent {
  timestamp: Date;
  errorCode: string;
  errorType: string;
  endpoint: string;
  statusCode: number;
  userId?: string;
  requestId?: string;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  errorRateThreshold: number; // errors per minute
  windowMs: number; // time window for rate calculation
  alertCooldownMs: number; // minimum time between alerts
  enableAlerts: boolean;
}

/**
 * Monitoring service configuration
 */
export interface MonitoringConfig {
  serviceName: string;
  environment: string;
  enableTracking: boolean;
  alertConfig: AlertConfig;
}

/**
 * Error monitoring and alerting service
 */
export class ErrorMonitoringService {
  private config: MonitoringConfig;
  private errorEvents: ErrorEvent[] = [];
  private lastAlertTime: Date | null = null;
  private stats: ErrorStats;

  constructor(config?: Partial<MonitoringConfig>) {
    this.config = {
      serviceName: process.env.SERVICE_NAME || 'fintech-portfolio-api',
      environment: process.env.NODE_ENV || 'development',
      enableTracking: process.env.ERROR_MONITORING_ENABLED === 'true',
      alertConfig: {
        errorRateThreshold: parseInt(process.env.ERROR_RATE_THRESHOLD || '10', 10),
        windowMs: parseInt(process.env.ERROR_RATE_WINDOW_MS || '60000', 10),
        alertCooldownMs: parseInt(process.env.ALERT_COOLDOWN_MS || '300000', 10),
        enableAlerts: process.env.ENABLE_ERROR_ALERTS === 'true'
      },
      ...config
    };

    this.stats = this.initializeStats();
    
    // Clean up old events periodically
    setInterval(() => this.cleanupOldEvents(), 60000); // Every minute
  }

  /**
   * Initialize error statistics
   */
  private initializeStats(): ErrorStats {
    return {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsByEndpoint: new Map(),
      errorRate: 0,
      lastErrorTime: null,
      windowStart: new Date()
    };
  }

  /**
   * Track an error event
   */
  trackError(
    error: any,
    req?: Request,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enableTracking) return;

    const errorEvent: ErrorEvent = {
      timestamp: new Date(),
      errorCode: error.code || 'UNKNOWN_ERROR',
      errorType: error.name || 'Error',
      endpoint: req?.path || 'unknown',
      statusCode: error.statusCode || 500,
      userId: (req as any)?.user?.id,
      requestId: req?.headers['x-request-id'] as string
    };

    // Add to events array
    this.errorEvents.push(errorEvent);

    // Update statistics
    this.updateStats(errorEvent);

    // Log the error
    logger.logError(error, req, metadata);

    // Check if we should trigger an alert
    this.checkAlertThreshold();

    // Send to external monitoring service if configured
    this.sendToMonitoringService(errorEvent, error, req);
  }

  /**
   * Update error statistics
   */
  private updateStats(event: ErrorEvent): void {
    this.stats.totalErrors++;
    this.stats.lastErrorTime = event.timestamp;

    // Update error type counts
    const typeCount = this.stats.errorsByType.get(event.errorType) || 0;
    this.stats.errorsByType.set(event.errorType, typeCount + 1);

    // Update endpoint counts
    const endpointCount = this.stats.errorsByEndpoint.get(event.endpoint) || 0;
    this.stats.errorsByEndpoint.set(event.endpoint, endpointCount + 1);

    // Calculate error rate
    this.calculateErrorRate();
  }

  /**
   * Calculate current error rate
   */
  private calculateErrorRate(): void {
    const now = Date.now();
    const windowStart = now - this.config.alertConfig.windowMs;
    
    const recentErrors = this.errorEvents.filter(
      event => event.timestamp.getTime() > windowStart
    );

    // Errors per minute
    this.stats.errorRate = (recentErrors.length / this.config.alertConfig.windowMs) * 60000;
  }

  /**
   * Clean up old error events outside the monitoring window
   */
  private cleanupOldEvents(): void {
    const cutoffTime = Date.now() - (this.config.alertConfig.windowMs * 2);
    this.errorEvents = this.errorEvents.filter(
      event => event.timestamp.getTime() > cutoffTime
    );
  }

  /**
   * Check if error rate exceeds threshold and trigger alert
   */
  private checkAlertThreshold(): void {
    if (!this.config.alertConfig.enableAlerts) return;

    const { errorRateThreshold, alertCooldownMs } = this.config.alertConfig;

    // Check if we're in cooldown period
    if (this.lastAlertTime) {
      const timeSinceLastAlert = Date.now() - this.lastAlertTime.getTime();
      if (timeSinceLastAlert < alertCooldownMs) {
        return;
      }
    }

    // Check if error rate exceeds threshold
    if (this.stats.errorRate > errorRateThreshold) {
      this.triggerAlert();
      this.lastAlertTime = new Date();
    }
  }

  /**
   * Trigger an alert for high error rate
   */
  private triggerAlert(): void {
    const alertMessage = `High error rate detected: ${this.stats.errorRate.toFixed(2)} errors/min (threshold: ${this.config.alertConfig.errorRateThreshold})`;
    
    logger.fatal(alertMessage, undefined, undefined, {
      service: this.config.serviceName,
      environment: this.config.environment,
      errorRate: this.stats.errorRate,
      threshold: this.config.alertConfig.errorRateThreshold,
      totalErrors: this.stats.totalErrors,
      topErrors: this.getTopErrors(5)
    });

    // Here you would integrate with alerting services like:
    // - PagerDuty
    // - Slack
    // - Email
    // - SMS
    this.sendAlert(alertMessage);
  }

  /**
   * Get top N error types
   */
  private getTopErrors(n: number): Array<{ type: string; count: number }> {
    return Array.from(this.stats.errorsByType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  /**
   * Send alert to configured channels
   */
  private sendAlert(message: string): void {
    // Placeholder for alert integration
    // In production, integrate with:
    // - Vercel Analytics
    // - Sentry
    // - PagerDuty
    // - Slack webhooks
    // - Email service
    
    console.error('🚨 ALERT:', message);
    
    // Example: Send to webhook
    if (process.env.ALERT_WEBHOOK_URL) {
      this.sendWebhookAlert(message);
    }
  }

  /**
   * Send alert via webhook
   */
  private async sendWebhookAlert(message: string): Promise<void> {
    try {
      const webhookUrl = process.env.ALERT_WEBHOOK_URL;
      if (!webhookUrl) return;

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          service: this.config.serviceName,
          environment: this.config.environment,
          timestamp: new Date().toISOString(),
          stats: {
            errorRate: this.stats.errorRate,
            totalErrors: this.stats.totalErrors,
            topErrors: this.getTopErrors(5)
          }
        })
      });

      if (!response.ok) {
        logger.error('Failed to send webhook alert', new Error(`HTTP ${response.status}`));
      }
    } catch (error) {
      logger.error('Error sending webhook alert', error);
    }
  }

  /**
   * Send error to external monitoring service
   */
  private sendToMonitoringService(
    event: ErrorEvent,
    error: any,
    req?: Request
  ): void {
    // Integrate with monitoring services
    this.sendToVercelAnalytics(event, error, req);
    this.sendToSentry(event, error, req);
  }

  /**
   * Send error to Vercel Analytics
   */
  private async sendToVercelAnalytics(
    event: ErrorEvent,
    error: any,
    req?: Request
  ): Promise<void> {
    try {
      const { trackError } = await import('../integrations/vercel-analytics');
      await trackError(event.errorCode, event.errorType, {
        endpoint: event.endpoint,
        statusCode: event.statusCode,
        requestId: event.requestId,
        userId: event.userId
      });
    } catch (err) {
      // Silently fail if Vercel Analytics is not available
      logger.debug('Vercel Analytics not available', undefined, { error: err });
    }
  }

  /**
   * Send error to Sentry
   */
  private async sendToSentry(
    event: ErrorEvent,
    error: any,
    req?: Request
  ): Promise<void> {
    try {
      const { captureException } = await import('../integrations/sentry');
      captureException(error, {
        endpoint: event.endpoint,
        errorCode: event.errorCode,
        requestId: event.requestId,
        userId: event.userId,
        statusCode: event.statusCode
      });
    } catch (err) {
      // Silently fail if Sentry is not available
      logger.debug('Sentry not available', undefined, { error: err });
    }
  }

  /**
   * Get current error statistics
   */
  getStats(): ErrorStats {
    this.calculateErrorRate();
    return { ...this.stats };
  }

  /**
   * Get error events within time window
   */
  getRecentErrors(windowMs?: number): ErrorEvent[] {
    const window = windowMs || this.config.alertConfig.windowMs;
    const cutoffTime = Date.now() - window;
    
    return this.errorEvents.filter(
      event => event.timestamp.getTime() > cutoffTime
    );
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
    this.errorEvents = [];
    this.lastAlertTime = null;
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    healthy: boolean;
    errorRate: number;
    message: string;
  } {
    const { errorRateThreshold } = this.config.alertConfig;
    const healthy = this.stats.errorRate < errorRateThreshold;
    
    return {
      healthy,
      errorRate: this.stats.errorRate,
      message: healthy
        ? 'Error rate within acceptable limits'
        : `Error rate exceeds threshold: ${this.stats.errorRate.toFixed(2)} > ${errorRateThreshold}`
    };
  }
}

/**
 * Default error monitoring service instance
 */
export const errorMonitoringService = new ErrorMonitoringService();

export default errorMonitoringService;
