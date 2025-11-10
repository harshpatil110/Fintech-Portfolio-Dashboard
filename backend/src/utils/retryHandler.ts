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

  constructor(confi