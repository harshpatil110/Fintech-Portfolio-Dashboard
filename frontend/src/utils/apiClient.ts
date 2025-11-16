import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { getAuthHeader } from './auth';
import { getErrorMessage } from './errorMessages';
import { reportApiError } from './errorReporting';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Calculate delay for exponential backoff
 */
const calculateRetryDelay = (attempt: number, config: RetryConfig): number => {
  return config.retryDelay * Math.pow(config.backoffMultiplier, attempt - 1);
};

/**
 * Check if error is retryable
 */
const isRetryableError = (error: AxiosError, config: RetryConfig): boolean => {
  if (!error.response) {
    // Network errors are retryable
    return true;
  }
  
  return config.retryableStatuses.includes(error.response.status);
};

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Create an API client with retry logic and error handling
 */
export const createApiClient = (
  baseURL: string = API_BASE_URL,
  retryConfig: Partial<RetryConfig> = {}
): AxiosInstance => {
  const config: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  
  const client = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 second timeout
  });

  // Request interceptor to add auth token
  client.interceptors.request.use(
    (requestConfig) => {
      const authHeader = getAuthHeader();
      if ('Authorization' in authHeader) {
        requestConfig.headers.Authorization = authHeader.Authorization;
      }
      return requestConfig;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor for error handling and retry logic
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as AxiosRequestConfig & { _retryCount?: number };
      
      // Initialize retry count
      if (!originalRequest._retryCount) {
        originalRequest._retryCount = 0;
      }

      // Check if we should retry
      if (
        originalRequest._retryCount < config.maxRetries &&
        isRetryableError(error, config)
      ) {
        originalRequest._retryCount++;
        
        // Calculate delay with exponential backoff
        const delay = calculateRetryDelay(originalRequest._retryCount, config);
        
        console.log(
          `Retrying request (attempt ${originalRequest._retryCount}/${config.maxRetries}) after ${delay}ms`,
          originalRequest.url
        );
        
        // Wait before retrying
        await sleep(delay);
        
        // Retry the request
        return client(originalRequest);
      }

      // Handle 401 Unauthorized
      if (error.response?.status === 401) {
        // Clear auth and redirect to login
        localStorage.removeItem('token');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      // Report error to backend (non-blocking)
      reportApiError(
        error,
        originalRequest.url || 'unknown',
        originalRequest.method || 'unknown',
        {
          retryCount: originalRequest._retryCount,
          maxRetries: config.maxRetries,
        }
      ).catch(console.error);

      // Return user-friendly error message
      const userMessage = getErrorMessage(error);
      const enhancedError = new Error(userMessage);
      (enhancedError as any).originalError = error;
      (enhancedError as any).statusCode = error.response?.status;
      
      return Promise.reject(enhancedError);
    }
  );

  return client;
};

/**
 * Default API client instance
 */
export const apiClient = createApiClient();

/**
 * API client with custom retry configuration for critical operations
 */
export const criticalApiClient = createApiClient(API_BASE_URL, {
  maxRetries: 5,
  retryDelay: 500,
  backoffMultiplier: 1.5,
});

/**
 * API client with no retries for non-idempotent operations
 */
export const noRetryApiClient = createApiClient(API_BASE_URL, {
  maxRetries: 0,
});

/**
 * Wrapper for API calls with offline detection
 */
export const apiCall = async <T>(
  apiFunction: () => Promise<AxiosResponse<T>>
): Promise<T> => {
  // Check if online
  if (!navigator.onLine) {
    throw new Error('You appear to be offline. Please check your internet connection.');
  }

  try {
    const response = await apiFunction();
    return response.data;
  } catch (error) {
    // Error is already handled by interceptor
    throw error;
  }
};
