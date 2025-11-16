/**
 * Sentry Integration
 * 
 * Production-ready Sentry integration for error monitoring and performance tracking.
 * Automatically initializes when SENTRY_DSN is configured.
 */

import { Express } from 'express';

// Type definitions for Sentry (to avoid requiring the package when not installed)
interface SentryEvent {
  request?: {
    headers?: Record<string, any>;
  };
  extra?: Record<string, any>;
}

interface SentryBreadcrumb {
  message?: string;
  category?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, any>;
}

type SentrySeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

let Sentry: any = null;
let sentryEnabled = false;

/**
 * Initialize Sentry (lazy load to avoid requiring package when not configured)
 */
export async function initializeSentry(app: Express): Promise<void> {
  if (!process.env.SENTRY_DSN) {
    console.warn('⚠️  Sentry DSN not configured, skipping Sentry initialization');
    return;
  }

  try {
    // Dynamically import Sentry only if DSN is configured
    Sentry = await import('@sentry/node');
    
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
      ],
      
      // Filter out sensitive data
      beforeSend(event: SentryEvent) {
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
    
    sentryEnabled = true;
    console.log('✅ Sentry initialized');
  } catch (error) {
    console.warn('⚠️  Failed to initialize Sentry (package may not be installed):', error);
    console.warn('   Install with: npm install @sentry/node');
  }
}

/**
 * Apply Sentry error handler (must be after all routes)
 */
export function applySentryErrorHandler(app: Express): void {
  if (!sentryEnabled || !Sentry) return;
  
  // The error handler must be registered before any other error middleware
  app.use(Sentry.Handlers.errorHandler());
}

/**
 * Capture exception manually
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (!sentryEnabled || !Sentry) return;
  
  Sentry.captureException(error, {
    extra: context
  });
}

/**
 * Capture message manually
 */
export function captureMessage(message: string, level: SentrySeverityLevel = 'info'): void {
  if (!sentryEnabled || !Sentry) return;
  
  Sentry.captureMessage(message, level);
}

/**
 * Set user context
 */
export function setUser(user: { id: string; email?: string; username?: string }): void {
  if (!sentryEnabled || !Sentry) return;
  
  Sentry.setUser(user);
}

/**
 * Clear user context
 */
export function clearUser(): void {
  if (!sentryEnabled || !Sentry) return;
  
  Sentry.setUser(null);
}

/**
 * Add breadcrumb
 */
export function addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
  if (!sentryEnabled || !Sentry) return;
  
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
  return sentryEnabled;
}
