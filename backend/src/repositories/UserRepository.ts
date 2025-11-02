import pool from '../config/database';
import { User, UserPreferences, CreateUserRequest, UpdateUserRequest, UpdateUserPreferencesRequest } from '../models/User';

export class UserRepository {
  /**
   * Create a new user
   */
  async createUser(userData: CreateUserRequest & { passwordHash: string }): Promise<User> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insert user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, first_name, last_name, created_at, updated_at`,
        [userData.email, userData.passwordHash, userData.firstName, userData.lastName]
      );
      
      const user = userResult.rows[0];
      
      // Create default preferences
      await client.query(
        `INSERT INTO user_preferences (user_id, currency, timezone, dashboard_layout)
         VALUES ($1, 'USD', 'UTC', '[]')`,
        [user.id]
      );
      
      await client.query('COMMIT');
      
      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        passwordHash: userData.passwordHash,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      passwordHash: user.password_hash,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const result = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      passwordHash: user.password_hash,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };
  }

  /**
   * Update user profile
   */
  async updateUser(id: string, updates: UpdateUserRequest): Promise<User | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.firstName !== undefined) {
      fields.push(`first_name = $${paramCount++}`);
      values.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      fields.push(`last_name = $${paramCount++}`);
      values.push(updates.lastName);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(updates.email);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE users 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING id, email, password_hash, first_name, last_name, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      passwordHash: user.password_hash,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };
  }

  /**
   * Update user password
   */
  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE users 
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    const result = await pool.query(
      `SELECT id, user_id, currency, timezone, dashboard_layout, created_at, updated_at
       FROM user_preferences
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const prefs = result.rows[0];
    return {
      id: prefs.id,
      userId: prefs.user_id,
      currency: prefs.currency,
      timezone: prefs.timezone,
      dashboardLayout: prefs.dashboard_layout,
      createdAt: prefs.created_at,
      updatedAt: prefs.updated_at
    };
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId: string, updates: UpdateUserPreferencesRequest): Promise<UserPreferences | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.currency !== undefined) {
      fields.push(`currency = $${paramCount++}`);
      values.push(updates.currency);
    }
    if (updates.timezone !== undefined) {
      fields.push(`timezone = $${paramCount++}`);
      values.push(updates.timezone);
    }
    if (updates.dashboardLayout !== undefined) {
      fields.push(`dashboard_layout = $${paramCount++}`);
      values.push(JSON.stringify(updates.dashboardLayout));
    }

    if (fields.length === 0) {
      return this.getUserPreferences(userId);
    }

    values.push(userId);

    const result = await pool.query(
      `UPDATE user_preferences 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $${paramCount}
       RETURNING id, user_id, currency, timezone, dashboard_layout, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    const prefs = result.rows[0];
    return {
      id: prefs.id,
      userId: prefs.user_id,
      currency: prefs.currency,
      timezone: prefs.timezone,
      dashboardLayout: prefs.dashboard_layout,
      createdAt: prefs.created_at,
      updatedAt: prefs.updated_at
    };
  }

  /**
   * Delete user (soft delete by updating email to include deleted timestamp)
   */
  async deleteUser(id: string): Promise<boolean> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update email to mark as deleted
      const timestamp = Date.now();
      await client.query(
        `UPDATE users 
         SET email = email || '_deleted_' || $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [timestamp, id]
      );
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM users WHERE email = $1',
      [email]
    );
    return result.rows.length > 0;
  }

  /**
   * Store password reset token
   */
  async storePasswordResetToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) 
       DO UPDATE SET token = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP`,
      [userId, token, expiresAt]
    );
  }

  /**
   * Check if password reset token is valid
   */
  async isPasswordResetTokenValid(userId: string, token: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM password_reset_tokens 
       WHERE user_id = $1 AND token = $2 AND expires_at > CURRENT_TIMESTAMP`,
      [userId, token]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Reset password and clear reset token
   */
  async resetPassword(userId: string, passwordHash: string): Promise<boolean> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update password
      const updateResult = await client.query(
        `UPDATE users 
         SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [passwordHash, userId]
      );
      
      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clear password reset token
   */
  async clearPasswordResetToken(userId: string): Promise<void> {
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [userId]
    );
  }
}