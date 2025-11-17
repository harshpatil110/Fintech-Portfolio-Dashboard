/**
 * Unit tests for CircuitBreaker
 * Tests state transitions, failure tracking, and fallback execution
 */

import { CircuitBreaker, CircuitState } from '../circuitBreaker';

describe('CircuitBreaker', () => {
  describe('initialization', () => {
    it('should initialize in CLOSED state', () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      expect(breaker.isClosed()).toBe(true);
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.isHalfOpen()).toBe(false);
    });

    it('should initialize with correct configuration', () => {
      const config = {
        failureThreshold: 5,
        resetTimeout: 2000,
        monitoringPeriod: 10000
      };
      const breaker = new CircuitBreaker('test-service', config);
      const state = breaker.getState();

      expect(state.serviceName).toBe('test-service');
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.failureCount).toBe(0);
    });
  });

  describe('execute - success scenarios', () => {
    it('should execute function successfully in CLOSED state', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const fn = async () => 'success';
      const fallback = () => 'fallback';

      const result = await breaker.execute(fn, fallback);
      expect(result).toBe('success');
      expect(breaker.isClosed()).toBe(true);
    });

    it('should reset failure count on success', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const failFn = async () => { throw new Error('fail'); };
      const successFn = async () => 'success';
      const fallback = () => 'fallback';

      // Fail once - in CLOSED state, error is thrown
      await expect(breaker.execute(failFn, fallback)).rejects.toThrow('fail');
      let state = breaker.getState();
      expect(state.failureCount).toBe(1);

      // Succeed
      await breaker.execute(successFn, fallback);
      state = breaker.getState();
      expect(state.failureCount).toBe(0);
    });
  });

  describe('execute - failure scenarios', () => {
    it('should track failures in CLOSED state', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const fn = async () => { throw new Error('fail'); };
      const fallback = () => 'fallback';

      // In CLOSED state, error is thrown (not fallback)
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      const state = breaker.getState();
      expect(state.failureCount).toBe(1);
      expect(breaker.isClosed()).toBe(true);
    });

    it('should open circuit after reaching failure threshold', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const fn = async () => { throw new Error('fail'); };
      const fallback = () => 'fallback';

      // Fail 3 times to reach threshold - first 2 throw, 3rd opens circuit and uses fallback
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      const result3 = await breaker.execute(fn, fallback);
      expect(result3).toBe('fallback');

      expect(breaker.isOpen()).toBe(true);
      const state = breaker.getState();
      expect(state.failureCount).toBe(3);
    });

    it('should use fallback when circuit is OPEN', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 2,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const fn = async () => { throw new Error('fail'); };
      const fallback = () => 'fallback-value';

      // Open the circuit - first failure throws, second opens and uses fallback
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      const result2 = await breaker.execute(fn, fallback);
      expect(result2).toBe('fallback-value');

      expect(breaker.isOpen()).toBe(true);

      // Next call should use fallback immediately
      const result = await breaker.execute(fn, fallback);
      expect(result).toBe('fallback-value');
    });
  });

  describe('state transitions', () => {
    it('should transition from OPEN to HALF_OPEN after reset timeout', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 2,
        resetTimeout: 100,
        monitoringPeriod: 5000
      });

      const fn = async () => { throw new Error('fail'); };
      const fallback = () => 'fallback';

      // Open the circuit
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      const result2 = await breaker.execute(fn, fallback);
      expect(result2).toBe('fallback');
      expect(breaker.isOpen()).toBe(true);

      // Wait for reset timeout
      await sleep(150);

      // Next execution should transition to HALF_OPEN
      const successFn = async () => 'success';
      await breaker.execute(successFn, fallback);
      
      // Should be closed after success in half-open
      expect(breaker.isClosed()).toBe(true);
    });

    it('should transition from HALF_OPEN to CLOSED on success', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 2,
        resetTimeout: 100,
        monitoringPeriod: 5000,
        halfOpenMaxAttempts: 1
      });

      const fn = async () => { throw new Error('fail'); };
      const fallback = () => 'fallback';

      // Open the circuit
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      const result2 = await breaker.execute(fn, fallback);
      expect(result2).toBe('fallback');
      expect(breaker.isOpen()).toBe(true);

      // Wait for reset timeout
      await sleep(150);

      // Success should close the circuit
      const successFn = async () => 'success';
      const result = await breaker.execute(successFn, fallback);
      
      expect(result).toBe('success');
      expect(breaker.isClosed()).toBe(true);
    });

    it('should transition from HALF_OPEN back to OPEN on failure', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 2,
        resetTimeout: 100,
        monitoringPeriod: 5000
      });

      const fn = async () => { throw new Error('fail'); };
      const fallback = () => 'fallback';

      // Open the circuit
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      const result2 = await breaker.execute(fn, fallback);
      expect(result2).toBe('fallback');
      expect(breaker.isOpen()).toBe(true);

      // Wait for reset timeout
      await sleep(150);

      // Failure in half-open should throw error and reopen circuit
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      expect(breaker.isOpen()).toBe(true);
    });
  });

  describe('getState and getStats', () => {
    it('should return current state information', () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const state = breaker.getState();
      expect(state.serviceName).toBe('test-service');
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.failureCount).toBe(0);
      expect(state.consecutiveSuccesses).toBe(0);
    });

    it('should return statistics', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const successFn = async () => 'success';
      const fallback = () => 'fallback';

      await breaker.execute(successFn, fallback);

      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(0);
    });
  });

  describe('reset', () => {
    it('should manually reset circuit breaker', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 2,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const fn = async () => { throw new Error('fail'); };
      const fallback = () => 'fallback';

      // Open the circuit
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      const result2 = await breaker.execute(fn, fallback);
      expect(result2).toBe('fallback');
      expect(breaker.isOpen()).toBe(true);

      // Manual reset
      breaker.reset();
      expect(breaker.isClosed()).toBe(true);
      
      const state = breaker.getState();
      expect(state.failureCount).toBe(0);
    });
  });

  describe('fallback execution', () => {
    it('should handle async fallback', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 2,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const fn = async () => { throw new Error('fail'); };
      const fallback = async () => {
        await sleep(10);
        return 'async-fallback';
      };

      // Open the circuit
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      const result2 = await breaker.execute(fn, fallback);
      expect(result2).toBe('async-fallback');

      // Use async fallback
      const result = await breaker.execute(fn, fallback);
      expect(result).toBe('async-fallback');
    });

    it('should throw error if fallback fails', async () => {
      const breaker = new CircuitBreaker('test-service', {
        failureThreshold: 2,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      });

      const fn = async () => { throw new Error('fail'); };
      const fallback = () => { throw new Error('fallback-error'); };

      // First failure throws the original error
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fail');
      // Second failure opens circuit and tries fallback, which also fails
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fallback-error');

      // Circuit is open, fallback error should be thrown
      await expect(breaker.execute(fn, fallback)).rejects.toThrow('fallback-error');
    });
  });
});

// Helper function to sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
