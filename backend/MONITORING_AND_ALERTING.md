# Monitoring and Alerting System

This document describes the comprehensive monitoring and alerting system implemented for the Fintech Portfolio Dashboard.

## Overview

The monitoring and alerting system provides:
- Real-time error tracking and metrics
- Performance monitoring (response times, throughput)
- Circuit breaker state monitoring
- Rate limiting metrics
- Timeout tracking
- Configurable alert rules
- Multiple alert channels (webhook, Slack, email, Sentry)
- Comprehensive dashboard API

## Components

### 1. Error Monitoring Service

Tracks and analyzes errors across the application.

**Features:**
- Error rate calculation
- Error categorization by type and endpoint
- Automatic alerting on high error rates
- Integration with Sentry and Vercel Analytics

**API Endpoints:**
- `GET /api/monitoring/health` - System health status
- `GET /api/monitoring/stats` - Error statistics
- `GET /api/monitoring/errors/recent` - Recent error events

### 2. Monitoring Dashboard Service

Aggregates metrics from all monitoring sources.

**Features:**
- Performance metrics (P50, P95, P99 response times)
- Circuit breaker status
- Rate limiter statistics
- Timeout metrics
- Overall system health status
- Alert management

**API Endpoints:**
- `GET /api/monitoring/dashboard` - Complete dashboard summary
- `GET /api/monitoring/alerts` - Recent alerts
- `DELETE /api/monitoring/alerts/:alertId` - Clear specific alert
- `GET /api/monitoring/uptime` - System uptime

### 3. Alerting Service

Monitors system metrics and triggers alerts based on configured rules.

**Features:**
- Configurable alert rules
- Multiple alert conditions
- Cooldown periods to prevent alert spam
- Multiple notification channels
- Alert statistics and history

**API Endpoints:**
- `GET /api/monitoring/alert-rules` - List all alert rules
- `POST /api/monitoring/alert-rules` - Create new alert rule
- `PUT /api/monitoring/alert-rules/:ruleId` - Update alert rule
- `DELETE /api/monitoring/alert-rules/:ruleId` - Delete alert rule
- `GET /api/monitoring/alert-statistics` - Alert statistics

## Configuration

### Environment Variables

```bash
# Error Monitoring
ERROR_MONITORING_ENABLED=true
ERROR_RATE_THRESHOLD=10
ERROR_RATE_WINDOW_MS=60000

# Alerting
ENABLE_ERROR_ALERTS=true
ENABLE_CIRCUIT_BREAKER_ALERTS=true
ENABLE_TIMEOUT_ALERTS=true
ENABLE_RATE_LIMIT_ALERTS=true
ENABLE_PERFORMANCE_ALERTS=true
ENABLE_SUCCESS_RATE_ALERTS=true

ALERT_CHECK_INTERVAL_MS=30000
ALERT_COOLDOWN_MS=300000

# Alert Channels
ALERT_WEBHOOK_URL=https://your-webhook-url.com
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Monitoring Services
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
VERCEL_ANALYTICS_ID=your-analytics-id

# Performance Thresholds
HIGH_RESPONSE_TIME_THRESHOLD=2000
```

### Default Alert Rules

The system comes with pre-configured alert rules:

1. **High Error Rate**
   - Condition: Error rate exceeds threshold
   - Default Threshold: 10 errors/minute
   - Severity: Critical
   - Channels: Webhook, Console, Sentry

2. **Circuit Breaker Open**
   - Condition: Any circuit breaker opens
   - Severity: Critical
   - Channels: Webhook, Console, Sentry

3. **High Timeout Rate**
   - Condition: Timeout rate exceeds 5%
   - Severity: Warning
   - Channels: Webhook, Console

4. **Rate Limit Violations**
   - Condition: Block rate exceeds 10%
   - Severity: Warning
   - Channels: Webhook, Console

5. **High Response Time**
   - Condition: P95 response time exceeds 2 seconds
   - Severity: Warning
   - Channels: Webhook, Console

6. **Low Success Rate**
   - Condition: Success rate below 95%
   - Severity: Warning
   - Channels: Webhook, Console

## Usage

### Starting the Alerting Service

The alerting service should be started when your application initializes:

```typescript
import { alertingService } from './services/AlertingService';

// Start monitoring
alertingService.start();
```

Or via API:
```bash
POST /api/monitoring/alerting/start
```

### Tracking Metrics

#### Track Requests
```typescript
import { monitoringDashboardService } from './services/MonitoringDashboardService';

monitoringDashboardService.trackRequest(
  '/api/portfolio',
  'GET',
  150, // duration in ms
  200  // status code
);
```

#### Track Circuit Breaker State
```typescript
import { circuitBreaker } from './utils/circuitBreaker';
import { monitoringDashboardService } from './services/MonitoringDashboardService';

const state = circuitBreaker.getState();
monitoringDashboardService.registerCircuitBreaker(state);
```

#### Track Rate Limit Events
```typescript
monitoringDashboardService.trackRateLimitEvent(
  '/api/market-data',
  false // blocked = false
);
```

#### Track Timeouts
```typescript
monitoringDashboardService.trackTimeout(
  '/api/portfolio',
  8500, // execution time in ms
  true  // timed out = true
);
```

### Creating Custom Alert Rules

```bash
POST /api/monitoring/alert-rules
Content-Type: application/json

{
  "id": "custom-rule",
  "name": "Custom Alert Rule",
  "enabled": true,
  "condition": "error_rate",
  "threshold": 15,
  "windowMs": 60000,
  "cooldownMs": 300000,
  "severity": "warning",
  "channels": ["webhook", "console"]
}
```

### Viewing Dashboard

```bash
GET /api/monitoring/dashboard
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600000,
  "errors": {
    "totalErrors": 5,
    "errorRate": 2.5,
    "errorsByType": {
      "ValidationError": 3,
      "TimeoutError": 2
    }
  },
  "performance": {
    "avgResponseTime": 150,
    "p50ResponseTime": 120,
    "p95ResponseTime": 350,
    "p99ResponseTime": 500,
    "requestsPerMinute": 45,
    "totalRequests": 1000
  },
  "circuitBreakers": [
    {
      "serviceName": "market-data-api",
      "state": "CLOSED",
      "failureCount": 0
    }
  ],
  "rateLimiter": {
    "totalRequests": 1000,
    "blockedRequests": 10,
    "blockRate": 1.0
  },
  "timeouts": {
    "totalTimeouts": 2,
    "timeoutRate": 0.2,
    "avgExecutionTime": 250
  },
  "alerts": []
}
```

## Alert Channels

### Webhook

Configure a webhook URL to receive alerts:

```bash
ALERT_WEBHOOK_URL=https://your-webhook-url.com
```

Alert payload:
```json
{
  "ruleId": "high-error-rate",
  "ruleName": "High Error Rate",
  "severity": "critical",
  "message": "High error rate detected: 12.50 errors/min (threshold: 10)",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "metrics": {
    "errorRate": 12.5,
    "totalErrors": 25,
    "topErrors": [...]
  },
  "service": "fintech-portfolio-api",
  "environment": "production"
}
```

### Slack

Configure Slack webhook for alerts:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Alerts will be sent as formatted Slack messages with color coding based on severity.

### Sentry

Configure Sentry DSN:

```bash
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
```

Critical alerts will be sent to Sentry as error events.

### Console

Alerts are always logged to console with emoji indicators:
- 🔴 Critical
- 🟡 Warning
- ℹ️ Info

## Integration with Existing Services

### Sentry Integration

Install Sentry package:
```bash
npm install @sentry/node
```

The system will automatically use Sentry if `SENTRY_DSN` is configured.

### Vercel Analytics Integration

Install Vercel Analytics:
```bash
npm install @vercel/analytics
```

The system will automatically track events if `VERCEL_ANALYTICS_ID` is configured.

## Best Practices

1. **Set Appropriate Thresholds**: Adjust alert thresholds based on your application's normal behavior
2. **Use Cooldown Periods**: Prevent alert fatigue with appropriate cooldown periods
3. **Monitor Dashboard Regularly**: Check the dashboard API regularly to identify trends
4. **Test Alert Channels**: Verify all alert channels are working correctly
5. **Review Alert History**: Use alert statistics to tune your alert rules
6. **Clean Up Old Alerts**: Regularly clear resolved alerts to keep the dashboard clean

## Troubleshooting

### Alerts Not Triggering

1. Check if alerting service is started:
   ```bash
   POST /api/monitoring/alerting/start
   ```

2. Verify alert rule is enabled:
   ```bash
   GET /api/monitoring/alert-rules/:ruleId
   ```

3. Check alert statistics:
   ```bash
   GET /api/monitoring/alert-statistics
   ```

### Missing Metrics

1. Ensure monitoring service is tracking events
2. Check that metrics are being recorded in dashboard
3. Verify environment variables are configured

### Alert Channel Failures

1. Check webhook URLs are accessible
2. Verify Sentry/Vercel Analytics packages are installed
3. Review logs for channel-specific errors

## API Reference

See the complete API documentation in the monitoring routes file.

## Future Enhancements

- Email alert channel implementation
- Custom metric tracking
- Historical data retention
- Alert rule templates
- Dashboard UI
- Metric aggregation and reporting
- Integration with more monitoring services
