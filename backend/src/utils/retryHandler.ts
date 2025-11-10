/**
 * Retry Handler Implementation
 * 
 * Handles transient function invocation failures with exponential backoff.
 * Implements configurable retry attempts and delays with retry condition checking.
 * 
 * Requirements: 3.2, 3.3
 */

import { errorHandlingConfig } from '../config/errorHandling';

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  attempts: number;
  totalDelay: number;
}

export interface RetryStats {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttempts: number;
}

/**
 * Retry Handler class for handling transient failures
 */
export class RetryHandler {
  private config: RetryConfig;
  private stats: RetryStats;

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? errorHandlingConfig.retry.maxAttempts,
      initialDelay: config?.initialDelay ?? errorHandlingConfig.retry.initialDelay,
      maxDelay: config?.maxDelay ?? errorHandlingConfig.retry.maxDelay,
      backoffMultiplier: config?.backoffMultiplier ?? errorHandlingConfig.retry.backoffMultiplier,
    };

    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
    };

    console.log('🔄 Retry Handler initialized', this.config);
  }

  /**
   * Execute a function with retry logic
   * @param fn - The async function to execute
   * @param shouldRetry - Optional function to determine if error is retryable
   * @param onRetry - Optional callback called before each retry
   * @returns Promise with the result
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    shouldRetry: (error: any, attempt: number) => boolean = () => true,
    onRetry?: (error: any, attempt: number, delay: number) => void
  ): Promise<T> {
    let lastError: any;
    let totalDelay = 0;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      this.stats.totalAttempts++;

      try {
        const result = await fn();
        
        // Track successful retry
        if (attempt > 0) {
          this.stats.successfulRetries++;
          console.log(`✅ Retry succeeded on attempt ${attempt + 1}/${this.config.maxAttempts}`);
        }
        
        this.updateAverageAttempts();
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if this is the last attempt
        const isLastAttempt = attempt === this.config.maxAttempts - 1;
        
        // Check if we should retry this error
        const shouldRetryError = shouldRetry(error, attempt + 1);
        
        if (isLastAttempt || !shouldRetryError) {
          this.stats.failedRetries++;
          this.updateAverageAttempts();
          
          console.error(
            `❌ Retry failed after ${attempt + 1} attempt(s)`,
            isLastAttempt ? '(max attempts reached)' : '(non-retryable error)',
            error instanceof Error ? error.message : error
          );
          
          throw error;
        }
        
        // Calculate delay for next retry
        const delay = this.calculateDelay(attempt);
        totalDelay += delay;
        
        console.warn(
          `⚠️  Attempt ${attempt + 1}/${this.config.maxAttempts} failed, retrying in ${delay}ms...`,
          error instanceof Error ? error.message : error
        );
        
        // Call onRetry callback if provided
        if (onRetry) {
          onRetry(error, attempt + 1, delay);
        }
        
        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError;
  }

  /**
   * Execute with retry and return detailed result
   * @param fn - The async function to execute
   * @param shouldRetry - Optional function to determine if error is retryable
   * @returns Promise with detailed retry result
   */
  async executeWithRetryResult<T>(
    fn: () => Promise<T>,
    shouldRetry?: (error: any, attempt: number) => boolean
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let attempts = 0;

    try {
      const result = await this.executeWithRetry(fn, shouldRetry, (error, attempt) => {
        attempts = attempt;
      });

      return {
        success: true,
        result,
        attempts: attempts || 1,
        totalDelay: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error,
        attempts: this.config.maxAttempts,
        totalDelay: Date.now() - startTime,
      };
    }
  }

  /**
   * Calculate delay for next retry using exponential backoff
   * @param attempt - Current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.initialDelay * 
      Math.pow(this.config.backoffMultiplier, attempt);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * exponentialDelay;
    
    const delay = exponentialDelay + jitter;
    
    return Math.min(delay, this.config.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update average attempts statistic
   */
  private updateAverageAttempts(): void {
    const totalRetries = this.stats.successfulRetries + this.stats.failedRetries;
    if (totalRetries > 0) {
      this.stats.averageAttempts = this.stats.totalAttempts / totalRetries;
    }
  }

  /**
   * Get retry statistics
   */
  getStats(): RetryStats {
    return { ...this.stats };
  }

  /**
   * Reset retry statistics
   */
  resetStats(): void {
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}

/**
 * Default retry condition checker
 * Determines if an error is retryable based on common patterns
 */
export function isRetryableError(error: any): boolean {
  // Network errors are retryable
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ENOTFOUND' || 
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET') {
    return true;
  }

  // HTTP status codes that are retryable
  if (error.statusCode || error.status) {
    const statusCode = error.statusCode || error.status;
    
    // 5xx server errors are retryable
    if (statusCode >= 500 && statusCode < 600) {
      return true;
    }
    
    // 429 Too Many Requests is retryable
    if (statusCode === 429) {
      return true;
    }
    
    // 408 Request Timeout is retryable
    if (statusCode === 408) {
      return true;
    }
  }

  // Timeout errors are retryable
  if (error.name === 'TimeoutError' || 
      error.message?.includes('timeout') ||
      error.message?.includes('timed out')) {
    return true;
  }

  // Rate limit errors are retryable
  if (error.name === 'RateLimitError' || 
      error.code === 'RATE_LIMIT_EXCEEDED') {
    return true;
  }

  // External service errors are retryable
  if (error.name === 'ExternalServiceError' ||
      error.code === 'EXTERNAL_SERVICE_ERROR') {
    return true;
  }

  // Default: don't retry
  return false;
}

/**
 * Create a retry handler with custom configuration
 */
export function createRetryHandler(config?: Partial<RetryConfig>): RetryHandler {
  return new RetryHandler(config);
}

/**
 * Convenience function to execute with default retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const handler = new RetryHandler(config);
  return handler.executeWithRetry(fn, isRetryableError);
}

export default RetryHandler;
