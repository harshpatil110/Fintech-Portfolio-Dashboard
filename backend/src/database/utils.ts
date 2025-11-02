import { PoolClient } from 'pg';
import DatabaseConnection from './connection';

export class DatabaseUtils {
  private static db = DatabaseConnection;

  /**
   * Execute a query with automatic retry logic
   */
  static async queryWithRetry<T>(
    query: string, 
    params?: any[], 
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.db.query(query, params);
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Execute multiple queries in a transaction
   */
  static async executeTransaction<T>(
    operations: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    return await this.db.transaction(operations);
  }

  /**
   * Check if a table exists
   */
  static async tableExists(tableName: string): Promise<boolean> {
    const query = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `;
    
    const result = await this.db.query(query, [tableName]);
    return result.rows[0].exists;
  }

  /**
   * Get table row count
   */
  static async getTableRowCount(tableName: string): Promise<number> {
    const query = `SELECT COUNT(*) as count FROM ${tableName}`;
    const result = await this.db.query(query);
    return parseInt(result.rows[0].count);
  }

  /**
   * Check database health
   */
  static async healthCheck(): Promise<{
    connected: boolean;
    timestamp: Date;
    tables: { [key: string]: number };
  }> {
    try {
      const connected = await this.db.testConnection();
      
      if (!connected) {
        return {
          connected: false,
          timestamp: new Date(),
          tables: {}
        };
      }

      const tables = {
        users: await this.getTableRowCount('users'),
        portfolios: await this.getTableRowCount('portfolios'),
        stock_positions: await this.getTableRowCount('stock_positions'),
        watchlists: await this.getTableRowCount('watchlists'),
        market_data: await this.getTableRowCount('market_data'),
        historical_prices: await this.getTableRowCount('historical_prices')
      };

      return {
        connected: true,
        timestamp: new Date(),
        tables
      };
    } catch (error) {
      return {
        connected: false,
        timestamp: new Date(),
        tables: {}
      };
    }
  }

  /**
   * Validate UUID format
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Sanitize string for SQL queries (basic protection)
   */
  static sanitizeString(input: string): string {
    return input.replace(/[^\w\s-_.@]/gi, '');
  }

  /**
   * Format decimal values for database storage
   */
  static formatDecimal(value: number, precision: number = 2): number {
    return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  /**
   * Build dynamic WHERE clause from filters
   */
  static buildWhereClause(
    filters: Record<string, any>, 
    startParamIndex: number = 1
  ): { clause: string; params: any[]; nextParamIndex: number } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = startParamIndex;

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          const placeholders = value.map(() => `$${paramIndex++}`).join(',');
          conditions.push(`${key} IN (${placeholders})`);
          params.push(...value);
        } else {
          conditions.push(`${key} = $${paramIndex++}`);
          params.push(value);
        }
      }
    });

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
      nextParamIndex: paramIndex
    };
  }

  /**
   * Build pagination clause
   */
  static buildPaginationClause(
    page: number = 1, 
    limit: number = 20, 
    paramIndex: number = 1
  ): { clause: string; params: any[]; nextParamIndex: number } {
    const offset = (page - 1) * limit;
    
    return {
      clause: `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params: [limit, offset],
      nextParamIndex: paramIndex + 2
    };
  }

  /**
   * Calculate pagination metadata
   */
  static calculatePagination(
    totalCount: number, 
    page: number = 1, 
    limit: number = 20
  ) {
    const totalPages = Math.ceil(totalCount / limit);
    
    return {
      page,
      limit,
      total: totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }
}