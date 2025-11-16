/**
 * Alerting Service
 * 
 * Monitors system metrics and triggers alerts based on configured rules.
 * Supports multiple alert channels (webhook, email, Slack, etc.)
 * 
 * Requirements: 8.3, 8.4
 */

import { errorMonitoringService } from './ErrorMonitoringService';
import { monitoringDashboardService, Alert } from './MonitoringDashboardService';
import { CircuitBreakerState } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

/**
 * Alert rule configuration
 */
export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: AlertCondition;
  threshold: number;
  windowMs: number;
  cooldownMs: number;
  severity: 'critical' | 'warning' | 'info';
  channels: AlertChannel[];
}

/**
 * Alert condition types
 */
export enum AlertCondition {
  ERROR_RATE = 'error_rate',
  TIMEOUT_RATE = 'timeout_rate',
  CIRCUIT_BREAKER_OPEN = 'circuit_breaker_open',
  RATE_LIMIT_VIOLATIONS = 'rate_limit_violations',
  HIGH_RESPONSE_TIME = 'high_response_time',
  LOW_SUCCESS_RATE = 'low_success_rate'
}

/**
 * Alert channels
 */
export enum AlertChannel {
  WEBHOOK = 'webhook',
  EMAIL = 'email',
  SLACK = 'slack',
  CONSOLE = 'console',
  SENTRY = 'sentry'
}

/**
 * Alert notification
 */
export interface AlertNotification {
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  metrics: Record<string, any>;
  channels: AlertChannel[];
}

/**
 * Alert rule state
 */
interface AlertRuleState {
  lastTriggered: number | null;
  triggerCount: number;
}

/**
 * Alerting Service
 */
export class AlertingService {
  private rules: Map<string, AlertRule> = new Map();
  private ruleStates: Map<string, AlertRuleState> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;

  constructor() {
    this.checkIntervalMs = parseInt(process.env.ALERT_CHECK_INTERVAL_MS || '30000', 10);
    this.initializeDefaultRules();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    // High error rate alert
    this.addRule({
      id: 'high-error-rate',
      name: 'High Error Rate',
      enabled: process.env.ENABLE_ERROR_ALERTS === 'true',
      condition: AlertCondition.ERROR_RATE,
      threshold: parseInt(process.env.ERROR_RATE_THRESHOLD || '10', 10),
      windowMs: parseInt(process.env.ERROR_RATE_WINDOW_MS || '60000', 10),
      cooldownMs: parseInt(process.env.ALERT_COOLDOWN_MS || '300000', 10),
      severity: 'critical',
      channels: [AlertChannel.WEBHOOK, AlertChannel.CONSOLE, AlertChannel.SENTRY]
    });

    // Circuit breaker open alert
    this.addRule({
      id: 'circuit-breaker-open',
      name: 'Circuit Breaker Open',
      enabled: process.env.ENABLE_CIRCUIT_BREAKER_ALERTS !== 'false',
      condition: AlertCondition.CIRCUIT_BREAKER_OPEN,
      threshold: 1,
      windowMs: 60000,
      cooldownMs: 300000,
      severity: 'critical',
      channels: [AlertChannel.WEBHOOK, AlertChannel.CONSOLE, AlertChannel.SENTRY]
    });

    // High timeout rate alert
    this.addRule({
      id: 'high-timeout-rate',
      name: 'High Timeout Rate',
      enabled: process.env.ENABLE_TIMEOUT_ALERTS !== 'false',
      condition: AlertCondition.TIMEOUT_RATE,
      threshold: 5, // 5% timeout rate
      windowMs: 60000,
      cooldownMs: 300000,
      severity: 'warning',
      channels: [AlertChannel.WEBHOOK, AlertChannel.CONSOLE]
    });

    // Rate limit violations alert
    this.addRule({
      id: 'rate-limit-violations',
      name: 'High Rate Limit Violations',
      enabled: process.env.ENABLE_RATE_LIMIT_ALERTS !== 'false',
      condition: AlertCondition.RATE_LIMIT_VIOLATIONS,
      threshold: 10, // 10% block rate
      windowMs: 60000,
      cooldownMs: 300000,
      severity: 'warning',
      channels: [AlertChannel.WEBHOOK, AlertChannel.CONSOLE]
    });

    // High response time alert
    this.addRule({
      id: 'high-response-time',
      name: 'High Response Time',
      enabled: process.env.ENABLE_PERFORMANCE_ALERTS !== 'false',
      condition: AlertCondition.HIGH_RESPONSE_TIME,
      threshold: parseInt(process.env.HIGH_RESPONSE_TIME_THRESHOLD || '2000', 10), // 2 seconds
      windowMs: 60000,
      cooldownMs: 300000,
      severity: 'warning',
      channels: [AlertChannel.WEBHOOK, AlertChannel.CONSOLE]
    });

    // Low success rate alert
    this.addRule({
      id: 'low-success-rate',
      name: 'Low Success Rate',
      enabled: process.env.ENABLE_SUCCESS_RATE_ALERTS !== 'false',
      condition: AlertCondition.LOW_SUCCESS_RATE,
      threshold: 95, // Below 95% success rate
      windowMs: 60000,
      cooldownMs: 300000,
      severity: 'warning',
      channels: [AlertChannel.WEBHOOK, AlertChannel.CONSOLE]
    });
  }

  /**
   * Add an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.ruleStates.set(rule.id, {
      lastTriggered: null,
      triggerCount: 0
    });
    
    logger.info(`Alert rule added: ${rule.name}`, undefined, {
      ruleId: rule.id,
      condition: rule.condition,
      threshold: rule.threshold
    });
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this.ruleStates.delete(ruleId);
      logger.info(`Alert rule removed: ${ruleId}`);
    }
    return removed;
  }

  /**
   * Update an alert rule
   */
  updateRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    
    const updatedRule = { ...rule, ...updates, id: ruleId };
    this.rules.set(ruleId, updatedRule);
    
    logger.info(`Alert rule updated: ${rule.name}`, undefined, {
      ruleId,
      updates
    });
    
    return true;
  }

  /**
   * Get all alert rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific alert rule
   */
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Start monitoring and checking alert rules
   */
  start(): void {
    if (this.checkInterval) {
      logger.warn('Alerting service already started');
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkAllRules();
    }, this.checkIntervalMs);

    logger.info('Alerting service started', undefined, {
      checkIntervalMs: this.checkIntervalMs,
      rulesCount: this.rules.size
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Alerting service stopped');
    }
  }

  /**
   * Check all alert rules
   */
  private async checkAllRules(): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      
      try {
        await this.checkRule(rule);
      } catch (error) {
        logger.error(`Error checking alert rule ${rule.name}`, error);
      }
    }
  }

  /**
   * Check a specific alert rule
   */
  private async checkRule(rule: AlertRule): Promise<void> {
    const state = this.ruleStates.get(rule.id);
    if (!state) return;

    // Check cooldown period
    if (state.lastTriggered) {
      const timeSinceLastTrigger = Date.now() - state.lastTriggered;
      if (timeSinceLastTrigger < rule.cooldownMs) {
        return; // Still in cooldown
      }
    }

    // Evaluate condition
    const shouldTrigger = await this.evaluateCondition(rule);
    
    if (shouldTrigger) {
      await this.triggerAlert(rule);
      state.lastTriggered = Date.now();
      state.triggerCount++;
    }
  }

  /**
   * Evaluate alert condition
   */
  private async evaluateCondition(rule: AlertRule): Promise<boolean> {
    const dashboard = monitoringDashboardService.getDashboardSummary();
    
    switch (rule.condition) {
      case AlertCondition.ERROR_RATE:
        return dashboard.errors.errorRate > rule.threshold;
      
      case AlertCondition.CIRCUIT_BREAKER_OPEN:
        return dashboard.circuitBreakers.some(cb => cb.state === 'OPEN');
      
      case AlertCondition.TIMEOUT_RATE:
        return dashboard.timeouts.timeoutRate > rule.threshold;
      
      case AlertCondition.RATE_LIMIT_VIOLATIONS:
        return dashboard.rateLimiter.blockRate > rule.threshold;
      
      case AlertCondition.HIGH_RESPONSE_TIME:
        return dashboard.performance.p95ResponseTime > rule.threshold;
      
      case AlertCondition.LOW_SUCCESS_RATE:
        const totalRequests = dashboard.performance.totalRequests;
        const errorCount = dashboard.errors.totalErrors;
        const successRate = totalRequests > 0 
          ? ((totalRequests - errorCount) / totalRequests) * 100 
          : 100;
        return successRate < rule.threshold;
      
      default:
        return false;
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule): Promise<void> {
    const dashboard = monitoringDashboardService.getDashboardSummary();
    
    const notification: AlertNotification = {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: this.buildAlertMessage(rule, dashboard),
      timestamp: new Date().toISOString(),
      metrics: this.extractRelevantMetrics(rule, dashboard),
      channels: rule.channels
    };

    logger.warn(`Alert triggered: ${rule.name}`, undefined, {
      ruleId: rule.id,
      severity: rule.severity,
      metrics: notification.metrics
    });

    // Send to configured channels
    await this.sendToChannels(notification);
  }

  /**
   * Build alert message
   */
  private buildAlertMessage(rule: AlertRule, dashboard: any): string {
    switch (rule.condition) {
      case AlertCondition.ERROR_RATE:
        return `High error rate detected: ${dashboard.errors.errorRate.toFixed(2)} errors/min (threshold: ${rule.threshold})`;
      
      case AlertCondition.CIRCUIT_BREAKER_OPEN:
        const openCircuits = dashboard.circuitBreakers
          .filter((cb: any) => cb.state === 'OPEN')
          .map((cb: any) => cb.serviceName)
          .join(', ');
        return `Circuit breaker(s) open: ${openCircuits}`;
      
      case AlertCondition.TIMEOUT_RATE:
        return `High timeout rate: ${dashboard.timeouts.timeoutRate.toFixed(2)}% (threshold: ${rule.threshold}%)`;
      
      case AlertCondition.RATE_LIMIT_VIOLATIONS:
        return `High rate limit violations: ${dashboard.rateLimiter.blockRate.toFixed(2)}% (threshold: ${rule.threshold}%)`;
      
      case AlertCondition.HIGH_RESPONSE_TIME:
        return `High response time: P95 ${dashboard.performance.p95ResponseTime}ms (threshold: ${rule.threshold}ms)`;
      
      case AlertCondition.LOW_SUCCESS_RATE:
        const totalRequests = dashboard.performance.totalRequests;
        const errorCount = dashboard.errors.totalErrors;
        const successRate = totalRequests > 0 
          ? ((totalRequests - errorCount) / totalRequests) * 100 
          : 100;
        return `Low success rate: ${successRate.toFixed(2)}% (threshold: ${rule.threshold}%)`;
      
      default:
        return `Alert condition met: ${rule.condition}`;
    }
  }

  /**
   * Extract relevant metrics for alert
   */
  private extractRelevantMetrics(rule: AlertRule, dashboard: any): Record<string, any> {
    const baseMetrics = {
      condition: rule.condition,
      threshold: rule.threshold,
      timestamp: dashboard.timestamp
    };

    switch (rule.condition) {
      case AlertCondition.ERROR_RATE:
        return {
          ...baseMetrics,
          errorRate: dashboard.errors.errorRate,
          totalErrors: dashboard.errors.totalErrors,
          topErrors: Array.from(dashboard.errors.errorsByType.entries())
            .map(([type, count]: [string, number]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
        };
      
      case AlertCondition.CIRCUIT_BREAKER_OPEN:
        return {
          ...baseMetrics,
          openCircuits: dashboard.circuitBreakers.filter((cb: any) => cb.state === 'OPEN')
        };
      
      case AlertCondition.TIMEOUT_RATE:
        return {
          ...baseMetrics,
          timeoutRate: dashboard.timeouts.timeoutRate,
          totalTimeouts: dashboard.timeouts.totalTimeouts,
          slowEndpoints: dashboard.timeouts.topSlowEndpoints
        };
      
      case AlertCondition.RATE_LIMIT_VIOLATIONS:
        return {
          ...baseMetrics,
          blockRate: dashboard.rateLimiter.blockRate,
          blockedRequests: dashboard.rateLimiter.blockedRequests,
          topBlockedEndpoints: dashboard.rateLimiter.topBlockedEndpoints
        };
      
      case AlertCondition.HIGH_RESPONSE_TIME:
        return {
          ...baseMetrics,
          p50: dashboard.performance.p50ResponseTime,
          p95: dashboard.performance.p95ResponseTime,
          p99: dashboard.performance.p99ResponseTime,
          avg: dashboard.performance.avgResponseTime
        };
      
      default:
        return baseMetrics;
    }
  }

  /**
   * Send alert to configured channels
   */
  private async sendToChannels(notification: AlertNotification): Promise<void> {
    const promises = notification.channels.map(channel => 
      this.sendToChannel(channel, notification)
    );
    
    await Promise.allSettled(promises);
  }

  /**
   * Send alert to a specific channel
   */
  private async sendToChannel(
    channel: AlertChannel,
    notification: AlertNotification
  ): Promise<void> {
    try {
      switch (channel) {
        case AlertChannel.WEBHOOK:
          await this.sendToWebhook(notification);
          break;
        
        case AlertChannel.EMAIL:
          await this.sendToEmail(notification);
          break;
        
        case AlertChannel.SLACK:
          await this.sendToSlack(notification);
          break;
        
        case AlertChannel.CONSOLE:
          this.sendToConsole(notification);
          break;
        
        case AlertChannel.SENTRY:
          await this.sendToSentry(notification);
          break;
      }
    } catch (error) {
      logger.error(`Failed to send alert to ${channel}`, error, undefined, {
        notification
      });
    }
  }

  /**
   * Send alert to webhook
   */
  private async sendToWebhook(notification: AlertNotification): Promise<void> {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...notification,
        service: process.env.SERVICE_NAME || 'fintech-portfolio-api',
        environment: process.env.NODE_ENV || 'development'
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }
  }

  /**
   * Send alert to email
   */
  private async sendToEmail(notification: AlertNotification): Promise<void> {
    // Placeholder for email integration
    // In production, integrate with SendGrid, AWS SES, etc.
    logger.info('Email alert (not implemented)', undefined, { notification });
  }

  /**
   * Send alert to Slack
   */
  private async sendToSlack(notification: AlertNotification): Promise<void> {
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhookUrl) return;

    const color = notification.severity === 'critical' ? 'danger' : 
                  notification.severity === 'warning' ? 'warning' : 'good';

    const response = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachments: [{
          color,
          title: `🚨 ${notification.ruleName}`,
          text: notification.message,
          fields: Object.entries(notification.metrics).map(([key, value]) => ({
            title: key,
            value: typeof value === 'object' ? JSON.stringify(value) : String(value),
            short: true
          })),
          footer: process.env.SERVICE_NAME || 'fintech-portfolio-api',
          ts: Math.floor(new Date(notification.timestamp).getTime() / 1000)
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}`);
    }
  }

  /**
   * Send alert to console
   */
  private sendToConsole(notification: AlertNotification): void {
    const emoji = notification.severity === 'critical' ? '🔴' : 
                  notification.severity === 'warning' ? '🟡' : 'ℹ️';
    
    console.error(`${emoji} ALERT [${notification.severity.toUpperCase()}]: ${notification.message}`);
    console.error('Metrics:', JSON.stringify(notification.metrics, null, 2));
  }

  /**
   * Send alert to Sentry
   */
  private async sendToSentry(notification: AlertNotification): Promise<void> {
    try {
      const { captureMessage } = await import('../integrations/sentry');
      const level = notification.severity === 'critical' ? 'error' : 
                    notification.severity === 'warning' ? 'warning' : 'info';
      
      captureMessage(notification.message, level);
    } catch (error) {
      // Silently fail if Sentry not available
    }
  }

  /**
   * Get alert statistics
   */
  getStatistics(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [ruleId, state] of this.ruleStates.entries()) {
      const rule = this.rules.get(ruleId);
      if (rule) {
        stats[ruleId] = {
          name: rule.name,
          enabled: rule.enabled,
          triggerCount: state.triggerCount,
          lastTriggered: state.lastTriggered 
            ? new Date(state.lastTriggered).toISOString() 
            : null
        };
      }
    }
    
    return stats;
  }
}

/**
 * Default alerting service instance
 */
export const alertingService = new AlertingService();

export default alertingService;
