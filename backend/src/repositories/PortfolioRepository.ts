import { PoolClient } from 'pg';
import { Portfolio, StockPosition, CreatePortfolioRequest, UpdatePortfolioRequest, CreateStockPositionRequest, UpdateStockPositionRequest } from '../models';
import DatabaseConnection from '../database/connection';

export class PortfolioRepository {
  private db = DatabaseConnection;

  async findByUserId(userId: string): Promise<Portfolio[]> {
    const query = `
      SELECT p.*, 
             sp.id as position_id, sp.symbol, sp.company_name, sp.quantity, 
             sp.average_cost, sp.purchase_date, sp.created_at as position_created_at,
             sp.updated_at as position_updated_at
      FROM portfolios p
      LEFT JOIN stock_positions sp ON p.id = sp.portfolio_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC, sp.symbol ASC
    `;
    
    const result = await this.db.query(query, [userId]);
    return this.groupPortfoliosWithPositions(result.rows);
  }

  async findById(id: string): Promise<Portfolio | null> {
    const query = `
      SELECT p.*, 
             sp.id as position_id, sp.symbol, sp.company_name, sp.quantity, 
             sp.average_cost, sp.purchase_date, sp.created_at as position_created_at,
             sp.updated_at as position_updated_at
      FROM portfolios p
      LEFT JOIN stock_positions sp ON p.id = sp.portfolio_id
      WHERE p.id = $1
      ORDER BY sp.symbol ASC
    `;
    
    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const portfolios = this.groupPortfoliosWithPositions(result.rows);
    return portfolios[0] || null;
  }

  async create(userId: string, portfolioData: CreatePortfolioRequest): Promise<Portfolio> {
    const query = `
      INSERT INTO portfolios (user_id, name)
      VALUES ($1, $2)
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      userId,
      portfolioData.name || 'My Portfolio'
    ]);

    return this.mapRowToPortfolio(result.rows[0]);
  }

  async update(id: string, portfolioData: UpdatePortfolioRequest): Promise<Portfolio | null> {
    const query = `
      UPDATE portfolios 
      SET name = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.db.query(query, [portfolioData.name, id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM portfolios WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  // Stock Position methods
  async addPosition(portfolioId: string, positionData: CreateStockPositionRequest): Promise<StockPosition> {
    const query = `
      INSERT INTO stock_positions (portfolio_id, symbol, company_name, quantity, average_cost, purchase_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      portfolioId,
      positionData.symbol.toUpperCase(),
      positionData.companyName,
      positionData.quantity,
      positionData.averageCost,
      positionData.purchaseDate
    ]);

    return this.mapRowToPosition(result.rows[0]);
  }

  async updatePosition(positionId: string, positionData: UpdateStockPositionRequest): Promise<StockPosition | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (positionData.quantity !== undefined) {
      fields.push(`quantity = $${paramCount++}`);
      values.push(positionData.quantity);
    }
    if (positionData.averageCost !== undefined) {
      fields.push(`average_cost = $${paramCount++}`);
      values.push(positionData.averageCost);
    }
    if (positionData.purchaseDate !== undefined) {
      fields.push(`purchase_date = $${paramCount++}`);
      values.push(positionData.purchaseDate);
    }

    if (fields.length === 0) {
      return this.findPositionById(positionId);
    }

    values.push(positionId);
    const query = `
      UPDATE stock_positions 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToPosition(result.rows[0]);
  }

  async removePosition(positionId: string): Promise<boolean> {
    const query = 'DELETE FROM stock_positions WHERE id = $1';
    const result = await this.db.query(query, [positionId]);
    return result.rowCount > 0;
  }

  async findPositionById(positionId: string): Promise<StockPosition | null> {
    const query = 'SELECT * FROM stock_positions WHERE id = $1';
    const result = await this.db.query(query, [positionId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToPosition(result.rows[0]);
  }

  async findPositionsByPortfolioId(portfolioId: string): Promise<StockPosition[]> {
    const query = 'SELECT * FROM stock_positions WHERE portfolio_id = $1 ORDER BY symbol ASC';
    const result = await this.db.query(query, [portfolioId]);
    
    return result.rows.map(row => this.mapRowToPosition(row));
  }

  async findPositionsBySymbol(symbol: string): Promise<StockPosition[]> {
    const query = 'SELECT * FROM stock_positions WHERE symbol = $1';
    const result = await this.db.query(query, [symbol.toUpperCase()]);
    
    return result.rows.map(row => this.mapRowToPosition(row));
  }

  private groupPortfoliosWithPositions(rows: any[]): Portfolio[] {
    const portfolioMap = new Map<string, Portfolio>();

    rows.forEach(row => {
      if (!portfolioMap.has(row.id)) {
        portfolioMap.set(row.id, {
          id: row.id,
          userId: row.user_id,
          name: row.name,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          positions: []
        });
      }

      const portfolio = portfolioMap.get(row.id)!;
      
      if (row.position_id) {
        portfolio.positions!.push({
          id: row.position_id,
          portfolioId: row.id,
          symbol: row.symbol,
          companyName: row.company_name,
          quantity: parseFloat(row.quantity),
          averageCost: parseFloat(row.average_cost),
          purchaseDate: row.purchase_date,
          createdAt: row.position_created_at,
          updatedAt: row.position_updated_at
        });
      }
    });

    return Array.from(portfolioMap.values());
  }

  private mapRowToPortfolio(row: any): Portfolio {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      positions: []
    };
  }

  private mapRowToPosition(row: any): StockPosition {
    return {
      id: row.id,
      portfolioId: row.portfolio_id,
      symbol: row.symbol,
      companyName: row.company_name,
      quantity: parseFloat(row.quantity),
      averageCost: parseFloat(row.average_cost),
      purchaseDate: row.purchase_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}