import { PoolClient } from 'pg';
import { User, UserPreferences, CreateUserRequest, UpdateUserRequest, UpdateUserPreferencesRequest } from '../models';
import DatabaseConnection from '../database/connection';

export class UserRepository {
  private db = DatabaseConnection;

  async findById(id: string): Promise<User | null> {
    const query = `
      SELECT u.*, up.currency, up.timezone, up.dashboard_layout
      FROM users u
      LEFT JOIN user_preferences up ON u.id = up.user_id
      WHERE u.id = $1
    `;
    
    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.mapRowToUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT u.*, up.currency, up.timezone, up.dashboard_layout
      FROM users u
      LEFT JOIN user_preferences up ON u.id = up.user_id
      WHERE u.email = $1
    `;
    
    const result = await this.db.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.mapRowToUser(row);
  }

  async create(userData: CreateUserRequest & { passwordHash: string }): Promise<User> {
    return await this.db.transaction(async (client: PoolClient) => {
      // Create user
      const userQuery = `
        INSERT INTO users (email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      
      const userResult = await client.query(userQuery, [
        userData.email,
        userData.passwordHash,
        userData.firstName,
        userData.lastName
      ]);

      const user = userResult.rows[0];

      // Create default preferences
      const preferencesQuery = `
        INSERT INTO user_preferences (user_id, currency, timezone, dashboard_layout)
        VALUES ($1, 'USD', 'UTC', '[]')
        RETURNING *
      `;
      
      const preferencesResult = await client.query(preferencesQuery, [user.id]);
      const preferences = preferencesResult.rows[0];

      return this.mapRowToUser({ ...user, ...preferences });
    });
  }

  async update(id: string, userData: UpdateUserRequest): Promise<User | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (userData.firstName !== undefined) {
      fields.push(`first_name = $${paramCount++}`);
      values.push(userData.firstName);
    }
    if (userData.lastName !== undefined) {
      fields.push(`last_name = $${paramCount++}`);
      values.push(userData.lastName);
    }
    if (userData.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(userData.email);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE users 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.findById(id);
  }

  async updatePreferences(userId: string, preferences: UpdateUserPreferencesRequest): Promise<UserPreferences | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (preferences.currency !== undefined) {
      fields.push(`currency = $${paramCount++}`);
      values.push(preferences.currency);
    }
    if (preferences.timezone !== undefined) {
      fields.push(`timezone = $${paramCount++}`);
      values.push(preferences.timezone);
    }
    if (preferences.dashboardLayout !== undefined) {
      fields.push(`dashboard_layout = $${paramCount++}`);
      values.push(JSON.stringify(preferences.dashboardLayout));
    }

    if (fields.length === 0) {
      return this.getPreferences(userId);
    }

    values.push(userId);
    const query = `
      UPDATE user_preferences 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $${paramCount}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToPreferences(result.rows[0]);
  }

  async getPreferences(userId: string): Promise<UserPreferences | null> {
    const query = 'SELECT * FROM user_preferences WHERE user_id = $1';
    const result = await this.db.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToPreferences(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      preferences: row.currency ? {
        id: row.id,
        userId: row.id,
        currency: row.currency,
        timezone: row.timezone,
        dashboardLayout: row.dashboard_layout ? JSON.parse(row.dashboard_layout) : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } : undefined
    };
  }

  private mapRowToPreferences(row: any): UserPreferences {
    return {
      id: row.id,
      userId: row.user_id,
      currency: row.currency,
      timezone: row.timezone,
      dashboardLayout: row.dashboard_layout ? JSON.parse(row.dashboard_layout) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}