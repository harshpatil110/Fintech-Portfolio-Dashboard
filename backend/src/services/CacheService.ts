import redisClient from '../config/redis';
import { StockQuote, MarketDataCache } from '../models/MarketData';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export class CacheService {
  private defaultTTL = 900; // 15 minutes default
  private keyPrefix = 'fintech:';

  constructor() {
    this.ensureConnection();
  }

  private async ensureConnection(): Promise<void> {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  }

  // Market data specific caching methods
  async cacheQuote(symbol: string, quote: StockQuote, ttl?: number): Promise<void> {
    await this.ensureConnection();
    
    const key = this.getQuoteKey(symbol);
    const data = {
      ...quote,
      cachedAt: new Date().toISOString()
    };
    
    await redisClient.setEx(key, ttl || this.defaultTTL, JSON.stringify(data));
  }

  async getCachedQuote(symbol: string): Promise<(StockQuote & { cachedAt: string }) | null> {
    await this.ensureConnection();
    
    const key = this.getQuoteKey(symbol);
    const cached = await redisClient.get(key);
    
    if (!cached) {
      return null;
    }
    
    try {
      const data = JSON.parse(cached);
      return {
        ...data,
        timestamp: new Date(data.timestamp),
        cachedAt: data.cachedAt
      };
    } catch (error) {
      console.error('Error parsing cached quote:', error);
      await this.deleteCachedQuote(symbol);
      return null;
    }
  }

  async cacheBatchQuotes(quotes: StockQuote[], ttl?: number): Promise<void> {
    await this.ensureConnection();
    
    const pipeline = redisClient.multi();
    const cacheTime = new Date().toISOString();
    
    for (const quote of quotes) {
      const key = this.getQuoteKey(quote.symbol);
      const data = {
        ...quote,
        cachedAt: cacheTime
      };
      pipeline.setEx(key, ttl || this.defaultTTL, JSON.stringify(data));
    }
    
    await pipeline.exec();
  }

  async getCachedBatchQuotes(symbols: string[]): Promise<Map<string, StockQuote & { cachedAt: string }>> {
    await this.ensureConnection();
    
    const keys = symbols.map(symbol => this.getQuoteKey(symbol));
    const cached = await redisClient.mGet(keys);
    
    const result = new Map<string, StockQuote & { cachedAt: string }>();
    
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const cachedData = cached[i];
      
      if (cachedData && symbol) {
        try {
          const data = JSON.parse(cachedData);
          result.set(symbol.toUpperCase(), {
            ...data,
            timestamp: new Date(data.timestamp),
            cachedAt: data.cachedAt
          });
        } catch (error) {
          console.error(`Error parsing cached quote for ${symbol}:`, error);
          await this.deleteCachedQuote(symbol);
        }
      }
    }
    
    return result;
  }

  async deleteCachedQuote(symbol: string): Promise<boolean> {
    await this.ensureConnection();
    
    const key = this.getQuoteKey(symbol);
    const result = await redisClient.del(key);
    return result > 0;
  }

  async getQuoteTTL(symbol: string): Promise<number> {
    await this.ensureConnection();
    
    const key = this.getQuoteKey(symbol);
    return await redisClient.ttl(key);
  }

  // Market status caching
  async cacheMarketStatus(status: string, ttl: number = 300): Promise<void> {
    await this.ensureConnection();
    
    const key = this.getMarketStatusKey();
    const data = {
      status,
      timestamp: new Date().toISOString()
    };
    
    await redisClient.setEx(key, ttl, JSON.stringify(data));
  }

  async getCachedMarketStatus(): Promise<{ status: string; timestamp: string } | null> {
    await this.ensureConnection();
    
    const key = this.getMarketStatusKey();
    const cached = await redisClient.get(key);
    
    if (!cached) {
      return null;
    }
    
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error('Error parsing cached market status:', error);
      await redisClient.del(key);
      return null;
    }
  }

  // WebSocket session management
  async addWebSocketSession(userId: string, sessionId: string, symbols: string[] = []): Promise<void> {
    await this.ensureConnection();
    
    const key = this.getWebSocketSessionKey(userId);
    const data = {
      sessionId,
      symbols,
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };
    
    await redisClient.setEx(key, 3600, JSON.stringify(data)); // 1 hour TTL
  }

  async getWebSocketSession(userId: string): Promise<{
    sessionId: string;
    symbols: string[];
    connectedAt: string;
    lastActivity: string;
  } | null> {
    await this.ensureConnection();
    
    const key = this.getWebSocketSessionKey(userId);
    const cached = await redisClient.get(key);
    
    if (!cached) {
      return null;
    }
    
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error('Error parsing WebSocket session:', error);
      await redisClient.del(key);
      return null;
    }
  }

  async updateWebSocketSymbols(userId: string, symbols: string[]): Promise<void> {
    await this.ensureConnection();
    
    const session = await this.getWebSocketSession(userId);
    if (session) {
      const key = this.getWebSocketSessionKey(userId);
      const data = {
        ...session,
        symbols,
        lastActivity: new Date().toISOString()
      };
      
      await redisClient.setEx(key, 3600, JSON.stringify(data));
    }
  }

  async removeWebSocketSession(userId: string): Promise<boolean> {
    await this.ensureConnection();
    
    const key = this.getWebSocketSessionKey(userId);
    const result = await redisClient.del(key);
    return result > 0;
  }

  async getAllActiveWebSocketSessions(): Promise<Map<string, {
    sessionId: string;
    symbols: string[];
    connectedAt: string;
    lastActivity: string;
  }>> {
    await this.ensureConnection();
    
    const pattern = this.getWebSocketSessionKey('*');
    const keys = await redisClient.keys(pattern);
    
    const sessions = new Map();
    
    if (keys.length > 0) {
      const values = await redisClient.mGet(keys);
      
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = values[i];
        
        if (value && key) {
          try {
            const userId = key.replace(this.keyPrefix + 'ws:session:', '');
            sessions.set(userId, JSON.parse(value));
          } catch (error) {
            console.error(`Error parsing WebSocket session for key ${key}:`, error);
            await redisClient.del(key);
          }
        }
      }
    }
    
    return sessions;
  }

  // Price alert caching
  async cachePriceAlert(userId: string, symbol: string, alertPrice: number, type: 'above' | 'below'): Promise<void> {
    await this.ensureConnection();
    
    const key = this.getPriceAlertKey(userId, symbol);
    const data = {
      symbol,
      alertPrice,
      type,
      createdAt: new Date().toISOString(),
      triggered: false
    };
    
    await redisClient.setEx(key, 86400, JSON.stringify(data)); // 24 hours TTL
  }

  async getPriceAlerts(userId: string): Promise<Array<{
    symbol: string;
    alertPrice: number;
    type: 'above' | 'below';
    createdAt: string;
    triggered: boolean;
  }>> {
    await this.ensureConnection();
    
    const pattern = this.getPriceAlertKey(userId, '*');
    const keys = await redisClient.keys(pattern);
    
    const alerts = [];
    
    if (keys.length > 0) {
      const values = await redisClient.mGet(keys);
      
      for (let i = 0; i < keys.length; i++) {
        const value = values[i];
        const key = keys[i];
        
        if (value && key) {
          try {
            alerts.push(JSON.parse(value));
          } catch (error) {
            console.error(`Error parsing price alert for key ${key}:`, error);
            await redisClient.del(key);
          }
        }
      }
    }
    
    return alerts;
  }

  async removePriceAlert(userId: string, symbol: string): Promise<boolean> {
    await this.ensureConnection();
    
    const key = this.getPriceAlertKey(userId, symbol);
    const result = await redisClient.del(key);
    return result > 0;
  }

  // General cache methods
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    await this.ensureConnection();
    
    const fullKey = (options?.prefix || this.keyPrefix) + key;
    const ttl = options?.ttl || this.defaultTTL;
    
    await redisClient.setEx(fullKey, ttl, JSON.stringify(value));
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    await this.ensureConnection();
    
    const fullKey = (options?.prefix || this.keyPrefix) + key;
    const cached = await redisClient.get(fullKey);
    
    if (!cached) {
      return null;
    }
    
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error('Error parsing cached data:', error);
      await redisClient.del(fullKey);
      return null;
    }
  }

  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    await this.ensureConnection();
    
    const fullKey = (options?.prefix || this.keyPrefix) + key;
    const result = await redisClient.del(fullKey);
    return result > 0;
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    await this.ensureConnection();
    
    const fullKey = (options?.prefix || this.keyPrefix) + key;
    const result = await redisClient.exists(fullKey);
    return result > 0;
  }

  async flush(): Promise<void> {
    await this.ensureConnection();
    await redisClient.flushDb();
  }

  // Key generation methods
  private getQuoteKey(symbol: string): string {
    return `${this.keyPrefix}quote:${symbol.toUpperCase()}`;
  }

  private getMarketStatusKey(): string {
    return `${this.keyPrefix}market:status`;
  }

  private getWebSocketSessionKey(userId: string): string {
    return `${this.keyPrefix}ws:session:${userId}`;
  }

  private getPriceAlertKey(userId: string, symbol: string): string {
    return `${this.keyPrefix}alert:${userId}:${symbol.toUpperCase()}`;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    
    try {
      await this.ensureConnection();
      await redisClient.ping();
      
      const latency = Date.now() - start;
      return { status: 'healthy', latency };
    } catch (error) {
      return { status: 'unhealthy', latency: Date.now() - start };
    }
  }
}

export default new CacheService();