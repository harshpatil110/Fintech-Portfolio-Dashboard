import { MarketDataCache, HistoricalPrice, StockQuote, PricePoint } from '../models';
import DatabaseConnection from '../database/connection';

export class MarketDataRepository {
  private db = DatabaseConnection;

  // Market Data Cache methods
  async cacheQuote(quote: StockQuote): Promise<MarketDataCache> {
    const query = `
      INSERT INTO market_data (symbol, price, previous_close, change_amount, change_percent, volume, market_cap, market_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (symbol) 
      DO UPDATE SET 
        price = EXCLUDED.price,
        previous_close = EXCLUDED.previous_close,
        change_amount = EXCLUDED.change_amount,
        change_percent = EXCLUDED.change_percent,
        volume = EXCLUDED.volume,
        market_cap = EXCLUDED.market_cap,
        market_status = EXCLUDED.market_status,
        timestamp = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      quote.symbol,
      quote.currentPrice,
      quote.previousClose,
      quote.change,
      quote.changePercent,
      quote.volume,
      quote.marketCap,
      quote.marketStatus
    ]);

    return this.mapRowToMarketDataCache(result.rows[0]);
  }

  async getCachedQuote(symbol: string): Promise<MarketDataCache | null> {
    const query = 'SELECT * FROM market_data WHERE symbol = $1';
    const result = await this.db.query(query, [symbol.toUpperCase()]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToMarketDataCache(result.rows[0]);
  }

  async getCachedQuotes(symbols: string[]): Promise<MarketDataCache[]> {
    if (symbols.length === 0) return [];
    
    const upperSymbols = symbols.map(s => s.toUpperCase());
    const placeholders = upperSymbols.map((_, i) => `$${i + 1}`).join(',');
    const query = `SELECT * FROM market_data WHERE symbol IN (${placeholders})`;
    
    const result = await this.db.query(query, upperSymbols);
    return result.rows.map((row: any) => this.mapRowToMarketDataCache(row));
  }

  async getStaleQuotes(maxAgeMinutes: number = 15): Promise<MarketDataCache[]> {
    const query = `
      SELECT * FROM market_data 
      WHERE timestamp < NOW() - INTERVAL '${maxAgeMinutes} minutes'
    `;
    
    const result = await this.db.query(query);
    return result.rows.map((row: any) => this.mapRowToMarketDataCache(row));
  }

  async deleteCachedQuote(symbol: string): Promise<boolean> {
    const query = 'DELETE FROM market_data WHERE symbol = $1';
    const result = await this.db.query(query, [symbol.toUpperCase()]);
    return result.rowCount > 0;
  }

  // Historical Price methods
  async saveHistoricalPrice(priceData: Omit<HistoricalPrice, 'id' | 'createdAt'>): Promise<HistoricalPrice> {
    const query = `
      INSERT INTO historical_prices (symbol, date, open_price, high_price, low_price, close_price, volume)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (symbol, date) 
      DO UPDATE SET 
        open_price = EXCLUDED.open_price,
        high_price = EXCLUDED.high_price,
        low_price = EXCLUDED.low_price,
        close_price = EXCLUDED.close_price,
        volume = EXCLUDED.volume
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      priceData.symbol,
      priceData.date,
      priceData.openPrice,
      priceData.highPrice,
      priceData.lowPrice,
      priceData.closePrice,
      priceData.volume
    ]);

    return this.mapRowToHistoricalPrice(result.rows[0]);
  }

  async getHistoricalPrices(symbol: string, startDate?: Date, endDate?: Date): Promise<HistoricalPrice[]> {
    let query = 'SELECT * FROM historical_prices WHERE symbol = $1';
    const params: any[] = [symbol.toUpperCase()];

    if (startDate) {
      query += ' AND date >= $2';
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND date <= $${params.length + 1}`;
      params.push(endDate);
    }

    query += ' ORDER BY date ASC';
    
    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.mapRowToHistoricalPrice(row));
  }

  async getLatestHistoricalPrice(symbol: string): Promise<HistoricalPrice | null> {
    const query = `
      SELECT * FROM historical_prices 
      WHERE symbol = $1 
      ORDER BY date DESC 
      LIMIT 1
    `;
    
    const result = await this.db.query(query, [symbol.toUpperCase()]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToHistoricalPrice(result.rows[0]);
  }

  async bulkSaveHistoricalPrices(pricesData: Omit<HistoricalPrice, 'id' | 'createdAt'>[]): Promise<void> {
    if (pricesData.length === 0) return;

    const values = pricesData.map((price, index) => {
      const baseIndex = index * 7;
      return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7})`;
    }).join(',');

    const query = `
      INSERT INTO historical_prices (symbol, date, open_price, high_price, low_price, close_price, volume)
      VALUES ${values}
      ON CONFLICT (symbol, date) 
      DO UPDATE SET 
        open_price = EXCLUDED.open_price,
        high_price = EXCLUDED.high_price,
        low_price = EXCLUDED.low_price,
        close_price = EXCLUDED.close_price,
        volume = EXCLUDED.volume
    `;

    const params = pricesData.flatMap(price => [
      price.symbol,
      price.date,
      price.openPrice,
      price.highPrice,
      price.lowPrice,
      price.closePrice,
      price.volume
    ]);

    await this.db.query(query, params);
  }

  async deleteHistoricalPrices(symbol: string, beforeDate?: Date): Promise<number> {
    let query = 'DELETE FROM historical_prices WHERE symbol = $1';
    const params: any[] = [symbol.toUpperCase()];

    if (beforeDate) {
      query += ' AND date < $2';
      params.push(beforeDate);
    }

    const result = await this.db.query(query, params);
    return result.rowCount;
  }

  // Utility methods
  async getUniqueSymbols(): Promise<string[]> {
    const query = 'SELECT DISTINCT symbol FROM market_data ORDER BY symbol';
    const result = await this.db.query(query);
    return result.rows.map((row: any) => row.symbol);
  }

  async cleanupOldData(daysToKeep: number = 30): Promise<{ deletedCache: number; deletedHistorical: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // Clean up old cache entries
    const cacheQuery = 'DELETE FROM market_data WHERE timestamp < $1';
    const cacheResult = await this.db.query(cacheQuery, [cutoffDate]);

    // Clean up old historical data (keep more historical data, maybe 2 years)
    const historicalCutoffDate = new Date();
    historicalCutoffDate.setFullYear(historicalCutoffDate.getFullYear() - 2);
    
    const historicalQuery = 'DELETE FROM historical_prices WHERE created_at < $1';
    const historicalResult = await this.db.query(historicalQuery, [historicalCutoffDate]);

    return {
      deletedCache: cacheResult.rowCount,
      deletedHistorical: historicalResult.rowCount
    };
  }

  private mapRowToMarketDataCache(row: any): MarketDataCache {
    return {
      id: row.id,
      symbol: row.symbol,
      price: parseFloat(row.price),
      previousClose: parseFloat(row.previous_close),
      changeAmount: parseFloat(row.change_amount),
      changePercent: parseFloat(row.change_percent),
      volume: parseInt(row.volume),
      marketCap: parseInt(row.market_cap),
      timestamp: row.timestamp,
      marketStatus: row.market_status
    };
  }

  private mapRowToHistoricalPrice(row: any): HistoricalPrice {
    return {
      id: row.id,
      symbol: row.symbol,
      date: row.date,
      openPrice: parseFloat(row.open_price),
      highPrice: parseFloat(row.high_price),
      lowPrice: parseFloat(row.low_price),
      closePrice: parseFloat(row.close_price),
      volume: parseInt(row.volume),
      createdAt: row.created_at
    };
  }
}