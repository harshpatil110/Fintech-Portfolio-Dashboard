import redisClient from '../config/redis';

/**
 * Cache configuration interface
 */
export interface CacheConfig {
  ttl: number; // Time to live in seconds
  staleWhileRevalidate: number; // Additional time to serve stale data while revalidating (seconds)
}

/**
 * Cache entry structure stored in Redis
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  staleWhileRevalidate: number;
}

/**
 * CacheManager implements stale-while-revalidate caching pattern
 * 
 * Requirements addressed:
 * - 9.1: Cache market data responses for 60 seconds
 * - 9.2: Cache portfolio calculations for 30 seconds
 * - 9.3: Implement stale-while-revalidate caching pattern
 * - 9.4: Serve stale data while fetching fresh data
 */
export class CacheManager {
  private keyPrefix: string;
  private revalidationInProgress: Map<string, Promise<any>>;

  constructor(keyPrefix: string = 'cache:') {
    this.keyPrefix = keyPrefix;
    this.revalidationInProgress = new Map();
  }

  /**
   * Ensure Redis connection is established
   */
  private async ensureConnection(): Promise<void> {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  }

  /**
   * Generate full cache key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Get data from cache with stale-while-revalidate support
   * 
   * @param key - Cache key
   * @param fetchFn - Function to fetch fresh data
   * @param config - Cache configuration (TTL and stale-while-revalidate)
   * @returns Cached or fresh data
   */
  async get<T>(
    key: string,
    fetchFn: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    await this.ensureConnection();
    
    const fullKey = this.getFullKey(key);
    const cached = await redisClient.get(fullKey);

    if (cached) {
      try {
        const entry: CacheEntry<T> = JSON.parse(cached);
        const age = Date.now() - entry.timestamp;
        const freshThreshold = entry.ttl * 1000;
        const staleThreshold = (entry.ttl + entry.staleWhileRevalidate) * 1000;

        // Data is fresh - return immediately
        if (age < freshThreshold) {
          return entry.data;
        }

        // Data is stale but within stale-while-revalidate window
        if (age < staleThreshold) {
          // Return stale data immediately
          // Trigger background revalidation if not already in progress
          if (!this.revalidationInProgress.has(fullKey)) {
            this.revalidate(fullKey, fetchFn, config).catch(err => {
              console.error(`Background revalidation failed for key ${key}:`, err);
            });
          }
          return entry.data;
        }

        // Data is too stale - fetch fresh data synchronously
        return await this.fetchAndCache(fullKey, fetchFn, config);
      } catch (parseError) {
        console.error(`Error parsing cached data for key ${key}:`, parseError);
        // If cache is corrupted, fetch fresh data
        await redisClient.del(fullKey);
      }
    }

    // No cached data - fetch fresh
    return await this.fetchAndCache(fullKey, fetchFn, config);
  }

  /**
   * Fetch fresh data and store in cache
   */
  private async fetchAndCache<T>(
    fullKey: string,
    fetchFn: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    const data = await fetchFn();
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: config.ttl,
      staleWhileRevalidate: config.staleWhileRevalidate
    };

    // Store in Redis with TTL + stale-while-revalidate time
    const totalTTL = config.ttl + config.staleWhileRevalidate;
    await redisClient.setEx(fullKey, totalTTL, JSON.stringify(entry));

    return data;
  }

  /**
   * Background revalidation - non-blocking cache update
   */
  private async revalidate<T>(
    fullKey: string,
    fetchFn: () => Promise<T>,
    config: CacheConfig
  ): Promise<void> {
    // Check if revalidation is already in progress
    if (this.revalidationInProgress.has(fullKey)) {
      return;
    }

    // Mark revalidation as in progress
    const revalidationPromise = this.fetchAndCache(fullKey, fetchFn, config)
      .finally(() => {
        // Remove from in-progress map when done
        this.revalidationInProgress.delete(fullKey);
      });

    this.revalidationInProgress.set(fullKey, revalidationPromise);

    // Don't await - let it run in background
    revalidationPromise.catch(err => {
      console.error(`Revalidation error for key ${fullKey}:`, err);
    });
  }

  /**
   * Set data in cache directly
   */
  async set<T>(key: string, data: T, config: CacheConfig): Promise<void> {
    await this.ensureConnection();
    
    const fullKey = this.getFullKey(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: config.ttl,
      staleWhileRevalidate: config.staleWhileRevalidate
    };

    const totalTTL = config.ttl + config.staleWhileRevalidate;
    await redisClient.setEx(fullKey, totalTTL, JSON.stringify(entry));
  }

  /**
   * Delete data from cache
   */
  async delete(key: string): Promise<boolean> {
    await this.ensureConnection();
    
    const fullKey = this.getFullKey(key);
    const result = await redisClient.del(fullKey);
    return result > 0;
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    await this.ensureConnection();
    
    const fullKey = this.getFullKey(key);
    const result = await redisClient.exists(fullKey);
    return result > 0;
  }

  /**
   * Invalidate cache entries matching a pattern
   * Useful for invalidating related cache entries
   */
  async invalidatePattern(pattern: string): Promise<number> {
    await this.ensureConnection();
    
    const fullPattern = this.getFullKey(pattern);
    const keys = await redisClient.keys(fullPattern);
    
    if (keys.length === 0) {
      return 0;
    }

    const result = await redisClient.del(keys);
    return result;
  }

  /**
   * Get cache statistics for a key
   */
  async getStats(key: string): Promise<{
    exists: boolean;
    age?: number;
    ttl?: number;
    isStale?: boolean;
  }> {
    await this.ensureConnection();
    
    const fullKey = this.getFullKey(key);
    const cached = await redisClient.get(fullKey);

    if (!cached) {
      return { exists: false };
    }

    try {
      const entry: CacheEntry<any> = JSON.parse(cached);
      const age = Date.now() - entry.timestamp;
      const freshThreshold = entry.ttl * 1000;
      const remainingTTL = await redisClient.ttl(fullKey);

      return {
        exists: true,
        age,
        ttl: remainingTTL,
        isStale: age >= freshThreshold
      };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * Clear all cache entries with this manager's prefix
   */
  async clear(): Promise<number> {
    await this.ensureConnection();
    
    const pattern = this.getFullKey('*');
    const keys = await redisClient.keys(pattern);
    
    if (keys.length === 0) {
      return 0;
    }

    const result = await redisClient.del(keys);
    return result;
  }
}

/**
 * Pre-configured cache managers for different data types
 */

// Market data cache: 60s TTL with 30s stale-while-revalidate
export const marketDataCache = new CacheManager('market:');

// Portfolio data cache: 30s TTL with 15s stale-while-revalidate
export const portfolioCache = new CacheManager('portfolio:');

// Default cache manager
export default new CacheManager();
