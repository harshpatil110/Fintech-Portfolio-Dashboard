/**
 * Sentry Integration Example
 * 
 * To use Sentry for error monitoring:
 * 1. Install: npm install @sentry/node @sentry/profiling-node
 * 2. Set SENTRY_DSN environment variable
 * 3. Rename this file to sentry.ts
 * 4. Import and initialize in server.ts
 */

import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { Express } from 'express';

/**
 * Initialize Sentry
 */
export function initializeSentry(app: Express): void {
  if (!process.env.SENTRY_DSN) {
    console.warn('⚠️  Sentry DSN not configured, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    
    // Set sample rate for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Set sample rate for profiling
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    integrations: [
      // Enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      
      // Enable Express.js middleware tracing
      new Sentry.Integrations.Express({ app }),
      
      // Enable profiling
      new ProfilingIntegration(),
    ],
    
    // Filter out sensitive data
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      
      // Remove sensitive data from extra
      if (event.extra) {
        const sensitiveKeys = ['password', 'token', 'secret', 'apiKey'];
        sensitiveKeys.forEach(key => {
          if (event.extra && key in event.extra) {
            event.extra[key] = '[REDACTED]';
          }
        });
      }
      
      return event;
    },
  });

  // RequestHandler creates a separate execution context using domains
  app.use(Sentry.Handlers.requestHandler());
  
  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());
  
  console.log('✅ Sentry initialized');
}

/**
 * Apply Sentry error handler (must be after all routes)
 */
export function applySentryErrorHandler(app: Express): void {
  if (!process.env.SENTRY_DSN) return;
  
  // The error handler must be registered before any other error middleware
  app.use(Sentry.Handlers.errorHandler());
}

/**
 * Capture exception manually
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (!process.env.SENTRY_DSN) return;
  
  Sentry.captureException(error, {
    extra: context
  });
}

/**
 * Capture message manually
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!process.env.SENTRY_DSN) return;
  
  Sentry.captureMessage(message, level);
}

/**
 * Set user context
 */
export function setUser(user: { id: string; email?: string; username?: string }): void {
  if (!process.env.SENTRY_DSN) return;
  
  Sentry.setUser(user);
}

/**
 * Clear user context
 */
export function clearUser(): void {
  if (!process.env.SENTRY_DSN) return;
  
  Sentry.setUser(null);
}

/**
 * Add breadcrumb
 */
export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
  if (!process.env.SENTRY_DSN) return;
  
  Sentry.addBreadcrumb(breadcrumb);
}

// Usage in server.ts:
// import { initializeSentry, applySentryErrorHandler } from './integrations/sentry';
// 
// // Early in middleware chain
// initializeSentry(app);
// 
// // After all routes, before other error handlers
// applySentryErrorHandler(app);

// Usage in ErrorMonitoringService:
// import { captureException } from '../integrations/sentry';
// 
// private sendToSentry(event: ErrorEvent, error: any, req?: Request): void {
//   captureException(error, {
//     endpoint: event.endpoint,
//     errorCode: event.errorCode,
//     requestId: event.requestId,
//     userId: event.userId
//   });
// }
