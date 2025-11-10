/**
 * Vercel Analytics Integration Example
 * 
 * To use Vercel Analytics for monitoring:
 * 1. Install: npm install @vercel/analytics
 * 2. Set VERCEL_ANALYTICS_ID environment variable
 * 3. Rename this file to vercel-analytics.ts
 * 4. Import and use in ErrorMonitoringService
 */

import { track } from '@vercel/analytics/server';

/**
 * Track error event in Vercel Analytics
 */
export async function trackError(
  errorCode: string,
  errorType: string,
  metadata?: Record<string, any>
): Promise<void> {
  if (!process.env.VERCEL_ANALYTICS_ID) {
    return;
  }

  try {
    await track('error', {
      errorCode,
      errorType,
      ...metadata
    });
  } catch (error) {
    console.error('Failed to track error in Vercel Analytics:', error);
  }
}

/**
 * Track custom event in Vercel Analytics
 */
export async function trackEvent(
  eventName: string,
  properties?: Record<string, any>
): Promise<void> {
  if (!process.env.VERCEL_ANALYTICS_ID) {
    return;
  }

  try {
    await track(eventName, properties);
  } catch (error) {
    console.error('Failed to track event in Vercel Analytics:', error);
  }
}

/**
 * Track performance metric
 */
export async function trackPerformance(
  metricName: string,
  value: number,
  unit: string = 'ms'
): Promise<void> {
  if (!process.env.VERCEL_ANALYTICS_ID) {
    return;
  }

  try {
    await track('performance', {
      metric: metricName,
      value,
      unit
    });
  } catch (error) {
    console.error('Failed to track performance in Vercel Analytics:', error);
  }
}

/**
 * Track API endpoint usage
 */
export async function trackApiCall(
  endpoint: string,
  method: string,
  statusCode: number,
  duration: number
): Promise<void> {
  if (!process.env.VERCEL_ANALYTICS_ID) {
    return;
  }

  try {
    await track('api_call', {
      endpoint,
      method,
      statusCode,
      duration,
      success: statusCode < 400
    });
  } catch (error) {
    console.error('Failed to track API call in Vercel Analytics:', error);
  }
}

// Usage in ErrorMonitoringService:
// import { trackError } from '../integrations/vercel-analytics';
// 
// private async sendToVercelAnalytics(
//   event: ErrorEvent,
//   error: any,
//   req?: Request
// ): Promise<void> {
//   await trackError(event.errorCode, event.errorType, {
//     endpoint: event.endpoint,
//     statusCode: event.statusCode,
//     requestId: event.requestId
//   });
// }

// Usage in request logger:
// import { trackApiCall } from '../integrations/vercel-analytics';
// 
// export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
//   const startTime = Date.now();
//   
//   const originalSend = res.send;
//   res.send = function (data: any): Response {
//     const duration = Date.now() - startTime;
//     
//     // Track in Vercel Analytics
//     trackApiCall(req.path, req.method, res.statusCode, duration);
//     
//     return originalSend.call(this, data);
//   };
//   
//   next();
// }
