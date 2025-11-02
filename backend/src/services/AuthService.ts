import * as jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/UserRepository';
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken } from '../utils/auth';
import { CreateUserRequest } from '../models/User';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export class AuthService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  /**
   * Register a new user
   */
  async register(userData: CreateUserRequest): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(userData.password);

    // Create user
    const user = await this.userRepository.createUser({
      ...userData,
      passwordHash
    });

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      accessToken,
      refreshToken
    };
  }

  /**
   * Login user
   */
  async login(loginData: LoginRequest): Promise<AuthResponse> {
    // Find user by email
    const user = await this.userRepository.findByEmail(loginData.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await comparePassword(loginData.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      accessToken,
      refreshToken
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshTokenData: RefreshTokenRequest): Promise<{ accessToken: string }> {
    try {
      // Note: In a production app, you'd want to store refresh tokens in a database
      // and validate them there. For now, we'll just verify the JWT signature.
      const { verifyToken } = await import('../utils/auth');
      const decoded = verifyToken(refreshTokenData.refreshToken);

      // Verify user still exists
      const user = await this.userRepository.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new access token
      const tokenPayload = {
        userId: user.id,
        email: user.email
      };

      const accessToken = generateAccessToken(tokenPayload);

      return { accessToken };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Get user
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    const success = await this.userRepository.updatePassword(userId, newPasswordHash);
    if (!success) {
      throw new Error('Failed to update password');
    }
  }

  /**
   * Validate user exists
   */
  async validateUser(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    return user !== null;
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists or not
      return;
    }

    // Generate reset token (valid for 1 hour)
    const resetToken = this.generatePasswordResetToken(user.id);
    
    // Store reset token in database
    await this.userRepository.storePasswordResetToken(user.id, resetToken);

    // In a real application, you would send an email here
    // For now, we'll just log it (in production, remove this)
    console.log(`Password reset token for ${email}: ${resetToken}`);
    console.log(`Reset URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`);
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Verify and decode reset token
    const userId = await this.verifyPasswordResetToken(token);
    if (!userId) {
      throw new Error('Invalid or expired reset token');
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password and clear reset token
    const success = await this.userRepository.resetPassword(userId, passwordHash);
    if (!success) {
      throw new Error('Failed to reset password');
    }

    // Clear the reset token
    await this.userRepository.clearPasswordResetToken(userId);
  }

  /**
   * Generate password reset token
   */
  private generatePasswordResetToken(userId: string): string {
    const payload = {
      userId,
      type: 'password_reset',
      timestamp: Date.now()
    };
    
    // Token expires in 1 hour
    return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
  }

  /**
   * Verify password reset token
   */
  private async verifyPasswordResetToken(token: string): Promise<string | null> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
      
      if (decoded.type !== 'password_reset') {
        return null;
      }

      // Check if token exists in database and is still valid
      const isValid = await this.userRepository.isPasswordResetTokenValid(decoded.userId, token);
      if (!isValid) {
        return null;
      }

      return decoded.userId;
    } catch (error) {
      return null;
    }
  }
}