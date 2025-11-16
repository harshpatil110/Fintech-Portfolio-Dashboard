/**
 * Unit tests for TimeoutHandler
 * Tests timeout detection, remaining time calculation, and timeout wrapping
 */

import { TimeoutHandler } from '../timeoutHandler';
import { TimeoutError } from '../../utils/errorHandler';

describe('TimeoutHandler', () => {
  describe('constructor and configuration', () => {
    it('should initialize with default configuration', () => {
      const handler = new TimeoutHandler();
      expect(handler).toBeDefined();
      expect(handler.getRemainingTime()).toBeGreaterThan(0);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        maxExecutionTime: 5000,
        warningThreshold: 3000
      };
      const handler = new TimeoutHandler(config);
      expect(handler).toBeDefined();
      expect(handler.getRemainingTime()).toBeLessThanOrEqual(5000);
    });
  });

  describe('checkTimeout', () => {
    it('should return false when timeout not exceeded', () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 5000, warningThreshold: 3000 });
      expect(handler.checkTimeout()).toBe(false);
    });

    it('should return true when timeout exceeded', async () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 100, warningThreshold: 50 });
      await sleep(150);
      expect(handler.checkTimeout()).toBe(true);
    });
  });

  describe('getRemainingTime', () => {
    it('should return positive remaining time initially', () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 5000, warningThreshold: 3000 });
      const remaining = handler.getRemainingTime();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(5000);
    });

    it('should return 0 when timeout exceeded', async () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 100, warningThreshold: 50 });
      await sleep(150);
      expect(handler.getRemainingTime()).toBe(0);
    });

    it('should decrease over time', async () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 5000, warningThreshold: 3000 });
      const initial = handler.getRemainingTime();
      await sleep(100);
      const after = handler.getRemainingTime();
      expect(after).toBeLessThan(initial);
    });
  });

  describe('getElapsedTime', () => {
    it('should return 0 or near 0 initially', () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 5000, warningThreshold: 3000 });
      const elapsed = handler.getElapsedTime();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(100);
    });

    it('should increase over time', async () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 5000, warningThreshold: 3000 });
      const initial = handler.getElapsedTime();
      await sleep(100);
      const after = handler.getElapsedTime();
      expect(after).toBeGreaterThan(initial);
      expect(after).toBeGreaterThanOrEqual(100);
    });
  });

  describe('isApproachingTimeout', () => {
    it('should return false when not approaching timeout', () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 5000, warningThreshold: 3000 });
      expect(handler.isApproachingTimeout()).toBe(false);
    });

    it('should return true when approaching timeout', async () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 200, warningThreshold: 100 });
      await sleep(120);
      expect(handler.isApproachingTimeout()).toBe(true);
    });
  });

  describe('wrapWithTimeout', () => {
    it('should execute function successfully when within timeout', async () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 1000, warningThreshold: 500 });
      const fn = async () => {
        await sleep(50);
        return 'success';
      };
      const fallback = () => 'fallback';

      const result = await handler.wrapWithTimeout(fn, fallback);
      expect(result).toBe('success');
    });

    it('should use fallback when function times out', async () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 100, warningThreshold: 50 });
      const fn = async () => {
        await sleep(200);
        return 'success';
      };
      const fallback = () => 'fallback';

      const result = await handler.wrapWithTimeout(fn, fallback);
      expect(result).toBe('fallback');
    });

    it('should handle async fallback', async () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 100, warningThreshold: 50 });
      const fn = async () => {
        await sleep(200);
        return 'success';
      };
      const fallback = async () => {
        await sleep(10);
        return 'async-fallback';
      };

      const result = await handler.wrapWithTimeout(fn, fallback);
      expect(result).toBe('async-fallback');
    });

    it('should throw error if function throws non-timeout error', async () => {
      const handler = new TimeoutHandler({ maxExecutionTime: 1000, warningThreshold: 500 });
      const fn = async () => {
        throw new Error('Custom error');
      };
      const fallback = () => 'fallback';

      await expect(handler.wrapWithTimeout(fn, fallback)).rejects.toThrow('Custom error');
    });
  });
});

// Helper function to sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
