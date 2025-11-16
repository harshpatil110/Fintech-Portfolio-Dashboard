import { Router, Request, Response } from 'express';
import { errorMonitoringService } from '../services/ErrorMonitoringService';
import { monitoringDashboardService } from '../services/MonitoringDashboardService';
import { alertingService } from '../services/AlertingService';
import { asyncHandler } from '../utils/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/monitoring/health
 * Get service health status
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const health = errorMonitoringService.getHealthStatus();
  const statusCode = health.healthy ? 200 : 503;
  
  res.status(statusCode).json({
    status: health.healthy ? 'healthy' : 'unhealthy',
    errorRate: health.errorRate,
    message: health.message,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/monitoring/stats
 * Get error statistics
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = errorMonitoringService.getStats();
  
  res.json({
    totalErrors: stats.totalErrors,
    errorRate: stats.errorRate,
    lastErrorTime: stats.lastErrorTime,
    windowStart: stats.windowStart,
    errorsByType: Object.fromEntries(stats.errorsByType),
    errorsByEndpoint: Object.fromEntries(stats.errorsByEndpoint)
  });
}));

/**
 * GET /api/monitoring/errors/recent
 * Get recent error events
 */
router.get('/errors/recent', asyncHandler(async (req: Request, res: Response) => {
  const windowMs = req.query.window ? parseInt(req.query.window as string) : undefined;
  const recentErrors = errorMonitoringService.getRecentErrors(windowMs);
  
  res.json({
    count: recentErrors.length,
    errors: recentErrors.map(error => ({
      timestamp: error.timestamp,
      errorCode: error.errorCode,
      errorType: error.errorType,
      endpoint: error.endpoint,
      statusCode: error.statusCode,
      requestId: error.requestId
    }))
  });
}));

/**
 * POST /api/monitoring/stats/reset
 * Reset error statistics (admin only)
 */
router.post('/stats/reset', asyncHandler(async (req: Request, res: Response) => {
  // In production, add authentication/authorization check
  errorMonitoringService.resetStats();
  logger.info('Error statistics reset', logger.extractRequestContext(req));
  
  res.json({
    message: 'Error statistics reset successfully',
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/monitoring/dashboard
 * Get comprehensive monitoring dashboard
 */
router.get('/dashboard', asyncHandler(async (req: Request, res: Response) => {
  const dashboard = monitoringDashboardService.getDashboardSummary();
  
  res.json(dashboard);
}));

/**
 * GET /api/monitoring/alerts
 * Get recent alerts
 */
router.get('/alerts', asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const alerts = monitoringDashboardService.getRecentAlerts(limit);
  
  res.json({
    count: alerts.length,
    alerts
  });
}));

/**
 * DELETE /api/monitoring/alerts/:alertId
 * Clear a specific alert
 */
router.delete('/alerts/:alertId', asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;
  const cleared = monitoringDashboardService.clearAlert(alertId);
  
  if (cleared) {
    res.json({
      message: 'Alert cleared successfully',
      alertId
    });
  } else {
    res.status(404).json({
      error: 'Alert not found',
      alertId
    });
  }
}));

/**
 * DELETE /api/monitoring/alerts
 * Clear all alerts
 */
router.delete('/alerts', asyncHandler(async (req: Request, res: Response) => {
  monitoringDashboardService.clearAllAlerts();
  
  res.json({
    message: 'All alerts cleared successfully'
  });
}));

/**
 * GET /api/monitoring/uptime
 * Get system uptime
 */
router.get('/uptime', asyncHandler(async (req: Request, res: Response) => {
  const uptime = monitoringDashboardService.getUptime();
  
  res.json({
    uptime,
    uptimeFormatted: formatUptime(uptime),
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/monitoring/reset
 * Reset all monitoring metrics (admin only)
 */
router.post('/reset', asyncHandler(async (req: Request, res: Response) => {
  // In production, add authentication/authorization check
  monitoringDashboardService.resetMetrics();
  logger.info('All monitoring metrics reset', logger.extractRequestContext(req));
  
  res.json({
    message: 'All monitoring metrics reset successfully',
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/monitoring/alert-rules
 * Get all alert rules
 */
router.get('/alert-rules', asyncHandler(async (req: Request, res: Response) => {
  const rules = alertingService.getRules();
  
  res.json({
    count: rules.length,
    rules
  });
}));

/**
 * GET /api/monitoring/alert-rules/:ruleId
 * Get a specific alert rule
 */
router.get('/alert-rules/:ruleId', asyncHandler(async (req: Request, res: Response) => {
  const { ruleId } = req.params;
  const rule = alertingService.getRule(ruleId);
  
  if (rule) {
    res.json(rule);
  } else {
    res.status(404).json({
      error: 'Alert rule not found',
      ruleId
    });
  }
}));

/**
 * POST /api/monitoring/alert-rules
 * Create a new alert rule
 */
router.post('/alert-rules', asyncHandler(async (req: Request, res: Response) => {
  const rule = req.body;
  
  // Validate required fields
  if (!rule.id || !rule.name || !rule.condition || rule.threshold === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: id, name, condition, threshold'
    });
  }
  
  alertingService.addRule(rule);
  logger.info('Alert rule created', logger.extractRequestContext(req), { ruleId: rule.id });
  
  res.status(201).json({
    message: 'Alert rule created successfully',
    rule
  });
}));

/**
 * PUT /api/monitoring/alert-rules/:ruleId
 * Update an alert rule
 */
router.put('/alert-rules/:ruleId', asyncHandler(async (req: Request, res: Response) => {
  const { ruleId } = req.params;
  const updates = req.body;
  
  const updated = alertingService.updateRule(ruleId, updates);
  
  if (updated) {
    logger.info('Alert rule updated', logger.extractRequestContext(req), { ruleId });
    res.json({
      message: 'Alert rule updated successfully',
      ruleId
    });
  } else {
    res.status(404).json({
      error: 'Alert rule not found',
      ruleId
    });
  }
}));

/**
 * DELETE /api/monitoring/alert-rules/:ruleId
 * Delete an alert rule
 */
router.delete('/alert-rules/:ruleId', asyncHandler(async (req: Request, res: Response) => {
  const { ruleId } = req.params;
  const removed = alertingService.removeRule(ruleId);
  
  if (removed) {
    logger.info('Alert rule deleted', logger.extractRequestContext(req), { ruleId });
    res.json({
      message: 'Alert rule deleted successfully',
      ruleId
    });
  } else {
    res.status(404).json({
      error: 'Alert rule not found',
      ruleId
    });
  }
}));

/**
 * GET /api/monitoring/alert-statistics
 * Get alert statistics
 */
router.get('/alert-statistics', asyncHandler(async (req: Request, res: Response) => {
  const statistics = alertingService.getStatistics();
  
  res.json({
    statistics,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/monitoring/alerting/start
 * Start the alerting service
 */
router.post('/alerting/start', asyncHandler(async (req: Request, res: Response) => {
  alertingService.start();
  logger.info('Alerting service started', logger.extractRequestContext(req));
  
  res.json({
    message: 'Alerting service started successfully',
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/monitoring/alerting/stop
 * Stop the alerting service
 */
router.post('/alerting/stop', asyncHandler(async (req: Request, res: Response) => {
  alertingService.stop();
  logger.info('Alerting service stopped', logger.extractRequestContext(req));
  
  res.json({
    message: 'Alerting service stopped successfully',
    timestamp: new Date().toISOString()
  });
}));

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

export default router;
