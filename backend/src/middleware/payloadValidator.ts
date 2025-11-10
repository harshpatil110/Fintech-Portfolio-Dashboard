import { Request, Response, NextFunction } from 'express';
import { PayloadTooLargeError } from '../utils/errorHandler';

/**
 * Payload limits configuration
 */
export interface PayloadLimits {
  maxRequestSize: number; // bytes
  maxResponseSize: number; // bytes
  maxArrayLength: number;
}

/**
 * Default payload limits based on Vercel constraints
 */
const DEFAULT_LIMITS: PayloadLimits = {
  maxRequestSize: parseInt(process.env.MAX_REQUEST_SIZE || '4194304', 10), // 4MB (4 * 1024 * 1024)
  maxResponseSize: parseInt(process.env.MAX_RESPONSE_SIZE || '4194304', 10), // 4MB
  maxArrayLength: parseInt(process.env.MAX_ARRAY_LENGTH || '100', 10) // 100 items per page
};

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  maxSize?: number;
}

/**
 * Pagination metadata interface
 */
export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  hasPrevious: boolean;
}

/**
 * Paginated response interface
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}

/**
 * Payload Validator class
 */
export class PayloadValidator {
  private limits: PayloadLimits;

  constructor(limits: PayloadLimits = DEFAULT_LIMITS) {
    this.limits = limits;
  }

  /**
   * Validate request payload size
   */
  validateRequest(req: Request): ValidationResult {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > this.limits.maxRequestSize) {
      return {
        valid: false,
        error: `Request payload too large. Maximum size: ${this.formatBytes(this.limits.maxRequestSize)}`,
        maxSize: this.limits.maxRequestSize
      };
    }

    return { valid: true };
  }

  /**
   * Paginate response data
   */
  paginateResponse<T>(data: T[], page: number = 0, limit?: number): PaginatedResponse<T> {
    const maxLimit = Math.min(limit || this.limits.maxArrayLength, this.limits.maxArrayLength);
    const start = page * maxLimit;
    const end = start + maxLimit;
    const total = data.length;
    const totalPages = Math.ceil(total / maxLimit);

    return {
      data: data.slice(start, end),
      pagination: {
        page,
        limit: maxLimit,
        total,
        totalPages,
        hasMore: end < total,
        hasPrevious: page > 0
      }
    };
  }

  /**
   * Estimate response size
   */
  estimateResponseSize(data: any): number {
    try {
      return JSON.stringify(data).length;
    } catch (error) {
      console.error('Error estimating response size:', error);
      return 0;
    }
  }

  /**
   * Check if response needs compression or pagination
   */
  shouldCompress(data: any): boolean {
    const size = this.estimateResponseSize(data);
    // Compress if size is more than 80% of max response size
    return size > this.limits.maxResponseSize * 0.8;
  }

  /**
   * Validate response size
   */
  validateResponse(data: any): ValidationResult {
    const size = this.estimateResponseSize(data);

    if (size > this.limits.maxResponseSize) {
      return {
        valid: false,
        error: `Response payload too large. Maximum size: ${this.formatBytes(this.limits.maxResponseSize)}`,
        maxSize: this.limits.maxResponseSize
      };
    }

    return { valid: true };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Extract pagination parameters from request
   */
  static getPaginationParams(req: Request): { page: number; limit: number } {
    const page = Math.max(0, parseInt(req.query.page as string, 10) || 0);
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit as string, 10) || DEFAULT_LIMITS.maxArrayLength),
      DEFAULT_LIMITS.maxArrayLength
    );

    return { page, limit };
  }
}

/**
 * Express middleware to validate request payload size
 */
export function payloadValidationMiddleware(limits?: PayloadLimits) {
  const validator = new PayloadValidator(limits);

  return (req: Request, res: Response, next: NextFunction) => {
    const result = validator.validateRequest(req);

    if (!result.valid) {
      return next(new PayloadTooLargeError(result.error));
    }

    // Attach validator to request for use in route handlers
    (req as any).payloadValidator = validator;

    next();
  };
}

/**
 * Helper to get payload validator from request
 */
export function getPayloadValidator(req: Request): PayloadValidator | undefined {
  return (req as any).payloadValidator;
}

/**
 * Helper middleware to add pagination support to responses
 */
export function paginationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add pagination helper to response
    (res as any).paginate = function<T>(data: T[], total?: number) {
      const { page, limit } = PayloadValidator.getPaginationParams(req);
      const validator = new PayloadValidator();
      
      const result = validator.paginateResponse(data, page, limit);
      
      // If total is provided (for database queries), use it
      if (total !== undefined) {
        result.pagination.total = total;
        result.pagination.totalPages = Math.ceil(total / result.pagination.limit);
      }
      
      return this.json(result);
    };

    next();
  };
}

export default PayloadValidator;
