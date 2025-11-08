import { PoolClient } from 'pg';
import { Portfolio, StockPosition, CreatePortfolioRequest, UpdatePortfolioRequest, CreateStockPositionRequest, UpdateStockPositionRequest, TransactionHistory, BulkPositionOperation, BulkOperationResult, PortfolioFilters } from '../models';
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
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO stock_positions (portfolio_id, symbol, company_name, quantity, average_cost, purchase_date)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      
      const result = await client.query(query, [
        portfolioId,
        positionData.symbol.toUpperCase(),
        positionData.companyName,
        positionData.quantity,
        positionData.averageCost,
        positionData.purchaseDate
      ]);

      const newPosition = this.mapRowToPosition(result.rows[0]);

      // Add transaction history
      await this.addTransactionHistory(
        portfolioId,
        newPosition.id,
        newPosition.symbol,
        'BUY',
        newPosition.quantity,
        newPosition.averageCost,
        'Position added'
      );

      await client.query('COMMIT');
      return newPosition;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePosition(positionId: string, positionData: UpdateStockPositionRequest): Promise<StockPosition | null> {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get current position for transaction history
      const currentPosition = await this.findPositionById(positionId);
      if (!currentPosition) {
        return null;
      }

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
        await client.query('COMMIT');
        return currentPosition;
      }

      values.push(positionId);
      const query = `
        UPDATE stock_positions 
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const updatedPosition = this.mapRowToPosition(result.rows[0]);

      // Add transaction history
      await this.addTransactionHistory(
        currentPosition.portfolioId,
        positionId,
        currentPosition.symbol,
        'UPDATE',
        positionData.quantity || currentPosition.quantity,
        positionData.averageCost || currentPosition.averageCost,
        'Position updated'
      );

      await client.query('COMMIT');
      return updatedPosition;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async removePosition(positionId: string): Promise<boolean> {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get position details for transaction history
      const position = await this.findPositionById(positionId);
      if (position) {
        // Add transaction history
        await this.addTransactionHistory(
          position.portfolioId,
          positionId,
          position.symbol,
          'DELETE',
          position.quantity,
          position.averageCost,
          'Position removed'
        );
      }

      const query = 'DELETE FROM stock_positions WHERE id = $1';
      const result = await client.query(query, [positionId]);
      
      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
    
    return result.rows.map((row: any) => this.mapRowToPosition(row));
  }

  async findPositionsBySymbol(symbol: string): Promise<StockPosition[]> {
    const query = 'SELECT * FROM stock_positions WHERE symbol = $1';
    const result = await this.db.query(query, [symbol.toUpperCase()]);
    
    return result.rows.map((row: any) => this.mapRowToPosition(row));
  }

  async findPositionsWithFilters(portfolioId: string, filters: PortfolioFilters): Promise<StockPosition[]> {
    let query = 'SELECT * FROM stock_positions WHERE portfolio_id = $1';
    const params: any[] = [portfolioId];
    let paramCount = 2;

    // Apply filters
    if (filters.symbols && filters.symbols.length > 0) {
      query += ` AND symbol = ANY($${paramCount})`;
      params.push(filters.symbols.map(s => s.toUpperCase()));
      paramCount++;
    }

    // Add sorting
    if (filters.sortBy) {
      const sortColumn = this.getSortColumn(filters.sortBy);
      const sortOrder = filters.sortOrder || 'asc';
      query += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;
    } else {
      query += ' ORDER BY symbol ASC';
    }

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.mapRowToPosition(row));
  }

  // Transaction History methods
  async addTransactionHistory(
    portfolioId: string,
    positionId: string | null,
    symbol: string,
    transactionType: 'BUY' | 'SELL' | 'UPDATE' | 'DELETE',
    quantity?: number,
    price?: number,
    notes?: string
  ): Promise<TransactionHistory> {
    const totalValue = quantity && price ? quantity * price : null;
    
    const query = `
      INSERT INTO transaction_history (portfolio_id, position_id, symbol, transaction_type, quantity, price, total_value, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      portfolioId,
      positionId,
      symbol.toUpperCase(),
      transactionType,
      quantity,
      price,
      totalValue,
      notes
    ]);

    return this.mapRowToTransactionHistory(result.rows[0]);
  }

  async getTransactionHistory(portfolioId: string, limit: number = 50): Promise<TransactionHistory[]> {
    const query = `
      SELECT * FROM transaction_history 
      WHERE portfolio_id = $1 
      ORDER BY transaction_date DESC 
      LIMIT $2
    `;
    
    const result = await this.db.query(query, [portfolioId, limit]);
    return result.rows.map((row: any) => this.mapRowToTransactionHistory(row));
  }

  // Bulk operations
  async bulkDeletePositions(positionIds: string[]): Promise<BulkOperationResult> {
    const client = await this.db.getClient();
    const result: BulkOperationResult = {
      successful: [],
      failed: []
    };

    try {
      await client.query('BEGIN');

      for (const positionId of positionIds) {
        try {
          // Get position details for transaction history
          const position = await this.findPositionById(positionId);
          if (position) {
            // Add transaction history
            await this.addTransactionHistory(
              position.portfolioId,
              positionId,
              position.symbol,
              'DELETE',
              position.quantity,
              position.averageCost,
              `Bulk delete operation`
            );

            // Delete position
            const deleteQuery = 'DELETE FROM stock_positions WHERE id = $1';
            const deleteResult = await client.query(deleteQuery, [positionId]);
            
            if (deleteResult.rowCount > 0) {
              result.successful.push(positionId);
            } else {
              result.failed.push({
                positionId,
                error: 'Position not found'
              });
            }
          } else {
            result.failed.push({
              positionId,
              error: 'Position not found'
            });
          }
        } catch (error) {
          result.failed.push({
            positionId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return result;
  }

  async bulkUpdatePositions(positionIds: string[], updateData: Partial<UpdateStockPositionRequest>): Promise<BulkOperationResult> {
    const client = await this.db.getClient();
    const result: BulkOperationResult = {
      successful: [],
      failed: []
    };

    try {
      await client.query('BEGIN');

      for (const positionId of positionIds) {
        try {
          // Get current position for transaction history
          const currentPosition = await this.findPositionById(positionId);
          if (!currentPosition) {
            result.failed.push({
              positionId,
              error: 'Position not found'
            });
            continue;
          }

          // Build update query
          const fields = [];
          const values = [];
          let paramCount = 1;

          if (updateData.quantity !== undefined) {
            fields.push(`quantity = $${paramCount++}`);
            values.push(updateData.quantity);
          }
          if (updateData.averageCost !== undefined) {
            fields.push(`average_cost = $${paramCount++}`);
            values.push(updateData.averageCost);
          }
          if (updateData.purchaseDate !== undefined) {
            fields.push(`purchase_date = $${paramCount++}`);
            values.push(updateData.purchaseDate);
          }

          if (fields.length === 0) {
            result.successful.push(positionId);
            continue;
          }

          values.push(positionId);
          const updateQuery = `
            UPDATE stock_positions 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING *
          `;

          const updateResult = await client.query(updateQuery, values);
          
          if (updateResult.rowCount > 0) {
            // Add transaction history
            await this.addTransactionHistory(
              currentPosition.portfolioId,
              positionId,
              currentPosition.symbol,
              'UPDATE',
              updateData.quantity || currentPosition.quantity,
              updateData.averageCost || currentPosition.averageCost,
              `Bulk update operation`
            );

            result.successful.push(positionId);
          } else {
            result.failed.push({
              positionId,
              error: 'Update failed'
            });
          }
        } catch (error) {
          result.failed.push({
            positionId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return result;
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

  private mapRowToTransactionHistory(row: any): TransactionHistory {
    return {
      id: row.id,
      portfolioId: row.portfolio_id,
      positionId: row.position_id,
      symbol: row.symbol,
      transactionType: row.transaction_type,
      quantity: row.quantity ? parseFloat(row.quantity) : undefined,
      price: row.price ? parseFloat(row.price) : undefined,
      totalValue: row.total_value ? parseFloat(row.total_value) : undefined,
      notes: row.notes,
      transactionDate: row.transaction_date,
      createdAt: row.created_at
    };
  }

  private getSortColumn(sortBy: string): string {
    switch (sortBy) {
      case 'symbol':
        return 'symbol';
      case 'value':
        return 'quantity * average_cost';
      case 'gainLoss':
        return 'quantity * average_cost'; // Will need market data for actual gain/loss
      case 'gainLossPercent':
        return 'quantity * average_cost'; // Will need market data for actual gain/loss
      case 'allocation':
        return 'quantity * average_cost';
      default:
        return 'symbol';
    }
  }
}