import { body, param, query, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

/**
 * Enhanced validation middleware with comprehensive input validation
 */

// Stock symbol validation
export const validateStockSymbol = (): ValidationChain =>
  body('symbol')
    .trim()
    .notEmpty()
    .withMessage('Stock symbol is required')
    .isLength({ min: 1, max: 10 })
    .withMessage('Stock symbol must be 1-10 characters')
    .matches(/^[A-Z0-9.-]+$/i)
    .withMessage('Stock symbol can only contain letters, numbers, dots, and hyphens')
    .customSanitizer((value: string) => value.toUpperCase());

// Financial amount validation
export const validateFinancialAmount = (field: string, min: number = 0.01): ValidationChain =>
  body(field)
    .notEmpty()
    .withMessage(`${field} is required`)
    .isFloat({ min, max: 999999999.99 })
    .withMessage(`${field} must be between ${min} and 999,999,999.99`)
    .custom((value: number) => {
      // Ensure max 2 decimal places
      const decimalPlaces = (value.toString().split('.')[1] || '').length;
      if (decimalPlaces > 2) {
        throw new Error(`${field} can have at most 2 decimal places`);
      }
      return true;
    });

// Quantity validation
export const validateQuantity = (): ValidationChain =>
  body('quantity')
    .notEmpty()
    .withMessage('Quantity is required')
    .isFloat({ min: 0.000001, max: 999999999 })
    .withMessage('Quantity must be between 0.000001 and 999,999,999')
    .custom((value: number) => {
      // Ensure max 6 decimal places for fractional shares
      const decimalPlaces = (value.toString().split('.')[1] || '').length;
      if (decimalPlaces > 6) {
        throw new Error('Quantity can have at most 6 decimal places');
      }
      return true;
    });

// Date validation
export const validateDate = (field: string, allowFuture: boolean = false): ValidationChain =>
  body(field)
    .notEmpty()
    .withMessage(`${field} is required`)
    .isISO8601()
    .withMessage(`${field} must be a valid ISO 8601 date`)
    .custom((value: string) => {
      const date = new Date(value);
      const now = new Date();
      
      if (isNaN(date.getTime())) {
        throw new Error(`${field} is not a valid date`);
      }
      
      if (!allowFuture && date > now) {
        throw new Error(`${field} cannot be in the future`);
      }
      
      // Check if date is not too far in the past (e.g., before 1900)
      const minDate = new Date('1900-01-01');
      if (date < minDate) {
        throw new Error(`${field} cannot be before 1900`);
      }
      
      return true;
    });

// UUID validation
export const validateUUID = (paramName: string): ValidationChain =>
  param(paramName)
    .notEmpty()
    .withMessage(`${paramName} is required`)
    .isUUID()
    .withMessage(`${paramName} must be a valid UUID`);

// User ID validation
export const validateUserId = (): ValidationChain =>
  param('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .isUUID()
    .withMessage('User ID must be a valid UUID');

// Company name validation
export const validateCompanyName = (): ValidationChain =>
  body('companyName')
    .trim()
    .notEmpty()
    .withMessage('Company name is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Company name must be 1-200 characters')
    .matches(/^[a-zA-Z0-9\s.,&'()-]+$/)
    .withMessage('Company name contains invalid characters')
    .customSanitizer((value: string) => {
      // Remove excessive whitespace
      return value.replace(/\s+/g, ' ').trim();
    });

// Alert price validation (optional)
export const validateAlertPrice = (): ValidationChain =>
  body('alertPrice')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0.01, max: 999999999.99 })
    .withMessage('Alert price must be between 0.01 and 999,999,999.99')
    .custom((value: number) => {
      if (value !== undefined && value !== null) {
        const decimalPlaces = (value.toString().split('.')[1] || '').length;
        if (decimalPlaces > 2) {
          throw new Error('Alert price can have at most 2 decimal places');
        }
      }
      return true;
    });

// Time range validation
export const validateTimeRange = (): ValidationChain =>
  query('timeRange')
    .optional()
    .isIn(['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'])
    .withMessage('Time range must be one of: 1D, 1W, 1M, 3M, 6M, 1Y, ALL');

// Sort order validation
export const validateSortOrder = (): ValidationChain =>
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either asc or desc');

// Pagination validation
export const validatePagination = () => [
  query('page')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Page must be between 1 and 10,000')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt()
];

// Array validation for bulk operations
export const validateBulkOperation = () => [
  body('operation')
    .notEmpty()
    .withMessage('Operation is required')
    .isIn(['delete', 'update'])
    .withMessage('Operation must be either delete or update'),
  body('positionIds')
    .isArray({ min: 1, max: 50 })
    .withMessage('Position IDs must be an array with 1-50 items'),
  body('positionIds.*')
    .isUUID()
    .withMessage('Each position ID must be a valid UUID')
];

// Watchlist bulk add validation
export const validateBulkWatchlistAdd = () => [
  body('stocks')
    .isArray({ min: 1, max: 10 })
    .withMessage('Stocks array must contain 1-10 items'),
  body('stocks.*.symbol')
    .trim()
    .notEmpty()
    .withMessage('Each stock symbol is required')
    .isLength({ min: 1, max: 10 })
    .withMessage('Each stock symbol must be 1-10 characters')
    .matches(/^[A-Z0-9.-]+$/i)
    .withMessage('Stock symbols can only contain letters, numbers, dots, and hyphens')
    .customSanitizer((value: string) => value.toUpperCase()),
  body('stocks.*.companyName')
    .trim()
    .notEmpty()
    .withMessage('Each company name is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Each company name must be 1-200 characters'),
  body('stocks.*.alertPrice')
    .optional({ nullable: true })
    .isFloat({ min: 0.01, max: 999999999.99 })
    .withMessage('Alert price must be between 0.01 and 999,999,999.99')
];

// Sanitization middleware to prevent XSS
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      // Remove potential XSS patterns
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      }
      const sanitized: any = {};
      for (const key in value) {
        sanitized[key] = sanitizeValue(value[key]);
      }
      return sanitized;
    }
    return value;
  };

  req.body = sanitizeValue(req.body);
  req.query = sanitizeValue(req.query);
  req.params = sanitizeValue(req.params);
  
  next();
};

// Enhanced validation error handler with detailed error messages
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => {
      // Handle different error types from express-validator
      if ('path' in error) {
        return {
          field: error.path,
          message: error.msg,
          value: 'value' in error ? error.value : undefined
        };
      }
      return {
        field: 'unknown',
        message: error.msg,
        value: undefined
      };
    });

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: formattedErrors,
        timestamp: new Date()
      }
    });
    return;
  }
  
  next();
};

// Request size validation middleware
export const validateRequestSize = (maxSizeKB: number = 100) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxSizeBytes = maxSizeKB * 1024;
    
    if (contentLength > maxSizeBytes) {
      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Request body exceeds maximum size of ${maxSizeKB}KB`,
          timestamp: new Date()
        }
      });
      return;
    }
    
    next();
  };
};
