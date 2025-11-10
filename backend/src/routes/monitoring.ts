import { Router, Request, Response } from 'express';
import { errorMonitoringService } from '../services/ErrorMonitoringService';
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

export default router;
