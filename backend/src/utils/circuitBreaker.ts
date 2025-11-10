/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by stopping requests to failing services.
 * Implements three states: CLOSED, OPEN, and HALF_OPEN.
 * 
 * Requirements: 5.1, 5.2, 5.3
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation, requests pass through
  OPEN = 'OPEN',         // Circuit is open, requests fail fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening circuit
  resetTimeout: number;          // Time in ms before attempting reset
  monitoringPeriod: number;      // Time window in ms for tracking failures
  halfOpenMaxAttempts?: number;  // Max attempts in half-open state (default: 1)
}

export interface CircuitBreakerState {
  serviceName: string;
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveSuccesses: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  nextAttemptTime: number | null;
}

/**
 * Circuit Breaker class for protecting external service calls
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;
  private consecutiveSuccesses: number = 0;
  private config: Required<CircuitBreakerConfig>;
  private serviceName: string;

  constructor(serviceName: string, config: CircuitBreakerConfig) {
    this.serviceName = serviceName;
    this.config = {
      ...config,
      halfOpenMaxAttempts: config.halfOpenMaxAttempts || 1
    };
    
    console.log(`🔌 Circuit Breaker initialized for ${serviceName}`, {
      failureThreshold: this.config.failureThreshold,
      resetTimeout: this.config.resetTimeout,
      monitoringPeriod: this.config.monitoringPeriod
    });
  }

  /**
   * Execute a function with circuit breaker protection
   * @param fn - The function to execute
   * @param fallback - Fallback function to call when circuit is open
   * @returns Result from fn or fallback
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback: () => T | Promise<T>
  ): Promise<T> {
    // Check if circuit should transition to half-open
    if (this.state === CircuitState.OPEN && this.shouldAttemptReset()) {
      this.transitionToHalfOpen();
    }

    // If circuit is still open after check, use fallback immediately
    const currentState = this.state;
    if (currentState === CircuitState.OPEN) {
      console.warn(`⚡ Circuit breaker OPEN for ${this.serviceName}, using fallback`);
      return this.executeFallback(fallback);
    }

    // Try to execute the function
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      
      // If circuit just opened, use fallback
      const stateAfterFailure = this.state;
      if (stateAfterFailure === CircuitState.OPEN) {
        console.warn(`⚡ Circuit breaker opened for ${this.serviceName}, using fallback`);
        return this.executeFallback(fallback);
      }
      
      // In half-open state, if it fails, throw the error
      throw error;
    }
  }

  /**
   * Execute fallback function
   */
  private async executeFallback<T>(fallback: () => T | Promise<T>): Promise<T> {
    try {
      return await fallback();
    } catch (fallbackError) {
      console.error(`❌ Fallback failed for ${this.serviceName}:`, fallbackError);
      throw fallbackError;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();
    this.consecutiveSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      // If we got enough successes in half-open, close the circuit
      if (this.consecutiveSuccesses >= this.config.halfOpenMaxAttempts) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.resetFailureCount();
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: any): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.consecutiveSuccesses = 0;

    console.warn(`⚠️  Circuit breaker failure for ${this.serviceName} (${this.failureCount}/${this.config.failureThreshold}):`, 
      error instanceof Error ? error.message : error);

    // Check if we should open the circuit
    if (this.state === CircuitState.CLOSED && this.shouldOpenCircuit()) {
      this.transitionToOpen();
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.transitionToOpen();
    }
  }

  /**
   * Check if circuit should open based on failure threshold
   */
  private shouldOpenCircuit(): boolean {
    // Check if we've exceeded the failure threshold
    if (this.failureCount < this.config.failureThreshold) {
      return false;
    }

    // Check if failures occurred within the monitoring period
    const now = Date.now();
    const timeSinceFirstFailure = now - (this.lastFailureTime - (this.failureCount - 1) * 1000);
    
    return timeSinceFirstFailure <= this.config.monitoringPeriod;
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    const now = Date.now();
    const timeSinceLastFailure = now - this.lastFailureTime;
    return timeSinceLastFailure >= this.config.resetTimeout;
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    console.log(`✅ Circuit breaker CLOSED for ${this.serviceName} - service recovered`);
    this.state = CircuitState.CLOSED;
    this.resetFailureCount();
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    console.error(`🔴 Circuit breaker OPEN for ${this.serviceName} - too many failures`);
    this.state = CircuitState.OPEN;
    this.consecutiveSuccesses = 0;
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    console.log(`🟡 Circuit breaker HALF_OPEN for ${this.serviceName} - testing service`);
    this.state = CircuitState.HALF_OPEN;
    this.consecutiveSuccesses = 0;
  }

  /**
   * Reset failure count
   */
  private resetFailureCount(): void {
    this.failureCount = 0;
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return {
      serviceName: this.serviceName,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      consecutiveSuccesses: this.consecutiveSuccesses
    };
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime || null,
      lastSuccessTime: this.lastSuccessTime || null,
      nextAttemptTime: this.state === CircuitState.OPEN 
        ? this.lastFailureTime + this.config.resetTimeout 
        : null
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    console.log(`🔄 Manually resetting circuit breaker for ${this.serviceName}`);
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = 0;
    this.lastSuccessTime = 0;
  }

  /**
   * Check if circuit is currently open
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Check if circuit is currently closed
   */
  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Check if circuit is currently half-open
   */
  isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }
}

export default CircuitBreaker;
