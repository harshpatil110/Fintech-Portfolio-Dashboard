import { WatchlistItem, CreateWatchlistItemRequest, UpdateWatchlistItemRequest } from '../models';
import DatabaseConnection from '../database/connection';

export class WatchlistRepository {
  private db = DatabaseConnection;

  async findByUserId(userId: string): Promise<WatchlistItem[]> {
    const query = `
      SELECT * FROM watchlists 
      WHERE user_id = $1 
      ORDER BY added_at DESC
    `;
    
    const result = await this.db.query(query, [userId]);
    return result.rows.map(row => this.mapRowToWatchlistItem(row));
  }

  async findByUserIdAndSymbol(userId: string, symbol: string): Promise<WatchlistItem | null> {
    const query = `
      SELECT * FROM watchlists 
      WHERE user_id = $1 AND symbol = $2
    `;
    
    const result = await this.db.query(query, [userId, symbol.toUpperCase()]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToWatchlistItem(result.rows[0]);
  }

  async add(userId: string, itemData: CreateWatchlistItemRequest): Promise<WatchlistItem> {
    // Check if user already has this symbol in watchlist
    const existing = await this.findByUserIdAndSymbol(userId, itemData.symbol);
    if (existing) {
      throw new Error(`Stock ${itemData.symbol} is already in your watchlist`);
    }

    // Check watchlist limit (50 stocks)
    const currentCount = await this.getWatchlistCount(userId);
    if (currentCount >= 50) {
      throw new Error('Watchlist limit of 50 stocks reached');
    }

    const query = `
      INSERT INTO watchlists (user_id, symbol, company_name, alert_price)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      userId,
      itemData.symbol.toUpperCase(),
      itemData.companyName,
      itemData.alertPrice
    ]);

    return this.mapRowToWatchlistItem(result.rows[0]);
  }

  async update(userId: string, symbol: string, itemData: UpdateWatchlistItemRequest): Promise<WatchlistItem | null> {
    const query = `
      UPDATE watchlists 
      SET alert_price = $1
      WHERE user_id = $2 AND symbol = $3
      RETURNING *
    `;

    const result = await this.db.query(query, [
      itemData.alertPrice,
      userId,
      symbol.toUpperCase()
    ]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToWatchlistItem(result.rows[0]);
  }

  async remove(userId: string, symbol: string): Promise<boolean> {
    const query = 'DELETE FROM watchlists WHERE user_id = $1 AND symbol = $2';
    const result = await this.db.query(query, [userId, symbol.toUpperCase()]);
    return result.rowCount > 0;
  }

  async getWatchlistCount(userId: string): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM watchlists WHERE user_id = $1';
    const result = await this.db.query(query, [userId]);
    return parseInt(result.rows[0].count);
  }

  async findBySymbol(symbol: string): Promise<WatchlistItem[]> {
    const query = 'SELECT * FROM watchlists WHERE symbol = $1';
    const result = await this.db.query(query, [symbol.toUpperCase()]);
    return result.rows.map(row => this.mapRowToWatchlistItem(row));
  }

  async findItemsWithAlerts(userId: string): Promise<WatchlistItem[]> {
    const query = `
      SELECT * FROM watchlists 
      WHERE user_id = $1 AND alert_price IS NOT NULL
      ORDER BY added_at DESC
    `;
    
    const result = await this.db.query(query, [userId]);
    return result.rows.map(row => this.mapRowToWatchlistItem(row));
  }

  async clearWatchlist(userId: string): Promise<boolean> {
    const query = 'DELETE FROM watchlists WHERE user_id = $1';
    const result = await this.db.query(query, [userId]);
    return result.rowCount > 0;
  }

  private mapRowToWatchlistItem(row: any): WatchlistItem {
    return {
      id: row.id,
      userId: row.user_id,
      symbol: row.symbol,
      companyName: row.company_name,
      alertPrice: row.alert_price ? parseFloat(row.alert_price) : undefined,
      addedAt: row.added_at
    };
  }
}