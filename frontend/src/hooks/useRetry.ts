import { useState, useCallback } from 'react';

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
}

interface RetryState {
  isRetrying: boolean;
  attemptCount: number;
  error: Error | null;
}

export const useRetry = <T>(
  asyncFunction: () => Promise<T>,
  options: RetryOptions = {}
) => {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
  } = options;

  const [state, setState] = useState<RetryState>({
    isRetrying: false,
    attemptCount: 0,
    error: null,
  });

  const execute = useCallback(async (): Promise<T | null> => {
    setState({ isRetrying: true, attemptCount: 0, error: null });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await asyncFunction();
        setState({ isRetrying: false, attemptCount: attempt, error: null });
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt === maxAttempts) {
          setState({ isRetrying: false, attemptCount: attempt, error: err });
          throw err;
        }

        // Wait before retrying with exponential backoff
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        setState(prev => ({ ...prev, attemptCount: attempt }));
      }
    }

    return null;
  }, [asyncFunction, maxAttempts, delayMs, backoffMultiplier]);

  const reset = useCallback(() => {
    setState({ isRetrying: false, attemptCount: 0, error: null });
  }, []);

  return {
    execute,
    reset,
    ...state,
  };
};
