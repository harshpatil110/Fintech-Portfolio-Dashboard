import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis client configuration with error handling and reconnection
 */
const redisClient: RedisClientType = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      // Exponential backoff with max 3 seconds
      const delay = Math.min(retries * 100, 3000);
      console.log(`⏳ Reconnecting to Redis... Attempt ${retries}, delay: ${delay}ms`);
      return delay;
    },
    connectTimeout: 10000, // 10 seconds
  },
});

redisClient.on('error', (err) => {
  console.error('❌ Redis Client Error:', err.message);
});

redisClient.on('connect', () => {
  console.log('🔄 Connecting to Redis...');
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready');
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Redis client reconnecting...');
});

redisClient.on('end', () => {
  console.log('⚠️  Redis connection closed');
});

/**
 * Initialize Redis connection
 */
export async function initializeRedis(): Promise<void> {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('✅ Connected to Redis');
    }
  } catch (error: any) {
    console.error('❌ Failed to connect to Redis:', error.message);
    // Don't throw error - allow app to run without Redis if SKIP_REDIS is true
    if (process.env.SKIP_REDIS !== 'true') {
      throw error;
    }
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log('✅ Redis connection closed gracefully');
    }
  } catch (error: any) {
    console.error('❌ Error closing Redis connection:', error.message);
  }
}

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    
    await redisClient.ping();
    const latency = Date.now() - start;
    
    return { healthy: true, latency };
  } catch (error: any) {
    return { healthy: false, error: error.message };
  }
}

export default redisClient;