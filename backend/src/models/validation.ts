import { StockPosition, CreateStockPositionRequest, UpdateStockPositionRequest } from './Portfolio';
import { CreateUserRequest, UpdateUserRequest } from './User';
import { CreateWatchlistItemRequest } from './Watchlist';

/**
 * Validation utilities for data models
 */
export class ValidationUtils {
  
  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate stock symbol format
   */
  static isValidStockSymbol(symbol: string): boolean {
    const symbolRegex = /^[A-Z]{1,5}$/;
    return symbolRegex.test(symbol.toUpperCase());
  }

  /**
   * Validate password strength
   */
  static isValidPassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate currency code
   */
  static isValidCurrency(currency: string): boolean {
    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
    return validCurrencies.includes(currency.toUpperCase());
  }

  /**
   * Validate timezone
   */
  static isValidTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate user creation request
   */
  static validateCreateUser(request: CreateUserRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!request.email || !this.isValidEmail(request.email)) {
      errors.push('Valid email is required');
    }
    
    if (!request.firstName || request.firstName.trim().length < 1) {
      errors.push('First name is required');
    }
    
    if (!request.lastName || request.lastName.trim().length < 1) {
      errors.push('Last name is required');
    }
    
    const passwordValidation = this.isValidPassword(request.password);
    if (!passwordValidation.valid) {
      errors.push(...passwordValidation.errors);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate stock position creation request
   */
  static validateCreateStockPosition(request: CreateStockPositionRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!request.symbol || !this.isValidStockSymbol(request.symbol)) {
      errors.push('Valid stock symbol is required (1-5 uppercase letters)');
    }
    
    if (!request.companyName || request.companyName.trim().length < 1) {
      errors.push('Company name is required');
    }
    
    if (!request.quantity || request.quantity <= 0) {
      errors.push('Quantity must be greater than 0');
    }
    
    if (!request.averageCost || request.averageCost <= 0) {
      errors.push('Average cost must be greater than 0');
    }
    
    if (!request.purchaseDate || !this.isValidDate(request.purchaseDate)) {
      errors.push('Valid purchase date is required');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate watchlist item creation request
   */
  static validateCreateWatchlistItem(request: CreateWatchlistItemRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!request.symbol || !this.isValidStockSymbol(request.symbol)) {
      errors.push('Valid stock symbol is required (1-5 uppercase letters)');
    }
    
    if (!request.companyName || request.companyName.trim().length < 1) {
      errors.push('Company name is required');
    }
    
    if (request.alertPrice !== undefined && request.alertPrice <= 0) {
      errors.push('Alert price must be greater than 0 if provided');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate date string
   */
  static isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && date <= new Date();
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(input: string): string {
    return input.trim().replace(/[<>]/g, '');
  }

  /**
   * Validate numeric range
   */
  static isInRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }
}