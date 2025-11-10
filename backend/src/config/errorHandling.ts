import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralized error handling configuration
 */
export const errorHandlingConfig = {
  // Timeout configuration
  timeout: {
    maxExecutionTime: parseInt(process.env.FUNCTION_TIMEOUT_MS || '8000', 10),
    warningThreshold: parseInt(process.env.FUNCTION_WARNING_THRESHOLD_MS || '6000', 10),
    externalApiTimeout: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '5000', 10),
  },

  // Payload limits
  payload: {
    maxRequestSize: parseInt(process.env.MAX_REQUEST_SIZE || '4194304', 10), // 4MB
    maxResponseSize: parseInt(process.env.MAX_RESPONSE_SIZE || '4194304', 10), // 4MB
    maxArrayLength: parseInt(process.env.MAX_ARRAY_LENGTH || '100', 10),
  },

  // Circuit breaker configuration
  circuitBreaker: {
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '60000', 10),
    monitoringPeriod: parseInt(process.env.CIRCUIT_BREAKER_MONITORING_PERIOD_MS || '300000', 10),
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,
    initialDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
    backoffMultiplier: 2,
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    portfolio: {
      maxRequests: 100,
      windowMs: 60000, // 1 minute
    },
    marketData: {
      maxRequests: 300,
      windowMs: 60000, // 1 minute
    },
    general: {
      maxRequests: 100,
      windowMs: 900000, // 15 minutes
    },
  },

  // Cache configuration
  cache: {
    marketData: {
      ttl: parseInt(process.env.CACHE_TTL_MARKET_DATA || '60', 10),
      staleWhileRevalidate: parseInt(process.env.CACHE_STALE_WHILE_REVALIDATE || '30', 10),
    },
    portfolio: {
      ttl: parseInt(process.env.CACHE_TTL_PORTFOLIO || '30', 10),
      staleWhileRevalidate: parseInt(process.env.CACHE_STALE_WHILE_REVALIDATE || '30', 10),
    },
  },

  // Logging configuration
  logging: {
    enabled: process.env.ERROR_LOGGING_ENABLED === 'true',
    level: process.env.LOG_LEVEL || 'info',
  },

  // Environment
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
};

export default errorHandlingConfig;
