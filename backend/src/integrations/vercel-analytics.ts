/**
 * Vercel Analytics Integration
 * 
 * Production-ready Vercel Analytics integration for tracking errors and performance.
 * Automatically initializes when VERCEL_ANALYTICS_ID is configured.
 */

let vercelAnalytics: any = null;
let analyticsEnabled = false;

/**
 * Initialize Vercel Analytics (lazy load)
 */
async function initializeAnalytics(): Promise<void> {
  if (analyticsEnabled || !process.env.VERCEL_ANALYTICS_ID) {
    return;
  }

  try {
    vercelAnalytics = await import('@vercel/analytics/server');
    analyticsEnabled = true;
    console.log('✅ Vercel Analytics initialized');
  } catch (error) {
    console.warn('⚠️  Failed to initialize Vercel Analytics (package may not be installed)');
    console.warn('   Install with: npm install @vercel/analytics');
  }
}

/**
 * Track error event in Vercel Analytics
 */
export async function trackError(
  errorCode: string,
  errorType: string,
  metadata?: Record<string, any>
): Promise<void> {
  await initializeAnalytics();
  
  if (!analyticsEnabled || !vercelAnalytics) {
    return;
  }

  try {
    await vercelAnalytics.track('error', {
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
  await initializeAnalytics();
  
  if (!analyticsEnabled || !vercelAnalytics) {
    return;
  }

  try {
    await vercelAnalytics.track(eventName, properties);
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
  await initializeAnalytics();
  
  if (!analyticsEnabled || !vercelAnalytics) {
    return;
  }

  try {
    await vercelAnalytics.track('performance', {
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
  await initializeAnalytics();
  
  if (!analyticsEnabled || !vercelAnalytics) {
    return;
  }

  try {
    await vercelAnalytics.track('api_call', {
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

/**
 * Check if Vercel Analytics is enabled
 */
export function isVercelAnalyticsEnabled(): boolean {
  return analyticsEnabled;
}
