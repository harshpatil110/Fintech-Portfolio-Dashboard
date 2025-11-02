import { UserRepository } from '../repositories/UserRepository';
import { User, UserPreferences, UpdateUserRequest, UpdateUserPreferencesRequest } from '../models/User';

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
  preferences?: UserPreferences | undefined;
}

export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    const preferences = await this.userRepository.getUserPreferences(userId);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      preferences: preferences || undefined
    };
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: UpdateUserRequest): Promise<UserProfile | null> {
    // If email is being updated, check if it's already taken
    if (updates.email) {
      const existingUser = await this.userRepository.findByEmail(updates.email);
      if (existingUser && existingUser.id !== userId) {
        throw new Error('Email is already in use by another account');
      }
    }

    const updatedUser = await this.userRepository.updateUser(userId, updates);
    if (!updatedUser) {
      return null;
    }

    const preferences = await this.userRepository.getUserPreferences(userId);

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
      preferences: preferences || undefined
    };
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    return this.userRepository.getUserPreferences(userId);
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId: string, updates: UpdateUserPreferencesRequest): Promise<UserPreferences | null> {
    // Validate currency code if provided
    if (updates.currency) {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR'];
      if (!validCurrencies.includes(updates.currency.toUpperCase())) {
        throw new Error('Invalid currency code');
      }
      updates.currency = updates.currency.toUpperCase();
    }

    // Validate timezone if provided
    if (updates.timezone) {
      try {
        // This will throw if timezone is invalid
        Intl.DateTimeFormat(undefined, { timeZone: updates.timezone });
      } catch (error) {
        throw new Error('Invalid timezone');
      }
    }

    return this.userRepository.updateUserPreferences(userId, updates);
  }

  /**
   * Delete user account
   */
  async deleteUserAccount(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return this.userRepository.deleteUser(userId);
  }

  /**
   * Check if user exists
   */
  async userExists(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    return user !== null;
  }

  /**
   * Check if email is available
   */
  async isEmailAvailable(email: string, excludeUserId?: string): Promise<boolean> {
    const existingUser = await this.userRepository.findByEmail(email);
    
    if (!existingUser) {
      return true;
    }

    // If we're excluding a specific user ID (for profile updates), check if it's the same user
    if (excludeUserId && existingUser.id === excludeUserId) {
      return true;
    }

    return false;
  }
}