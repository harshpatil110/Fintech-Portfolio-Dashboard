/**
 * Unit tests for PayloadValidator
 * Tests payload size validation, pagination, and response size estimation
 */

import { PayloadValidator } from '../payloadValidator';
import { Request } from 'express';

describe('PayloadValidator', () => {
  describe('initialization', () => {
    it('should initialize with default limits', () => {
      const validator = new PayloadValidator();
      expect(validator).toBeDefined();
    });

    it('should initialize with custom limits', () => {
      const customLimits = {
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 50
      };
      const validator = new PayloadValidator(customLimits);
      expect(validator).toBeDefined();
    });
  });

  describe('validateRequest', () => {
    it('should validate request within size limit', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 100
      });

      const mockReq = {
        headers: {
          'content-length': '500000'
        }
      } as unknown as Request;

      const result = validator.validateRequest(mockReq);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject request exceeding size limit', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 100
      });

      const mockReq = {
        headers: {
          'content-length': '2000000'
        }
      } as unknown as Request;

      const result = validator.validateRequest(mockReq);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.maxSize).toBe(1000000);
    });

    it('should handle missing content-length header', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 100
      });

      const mockReq = {
        headers: {}
      } as unknown as Request;

      const result = validator.validateRequest(mockReq);
      expect(result.valid).toBe(true);
    });

    it('should handle zero content-length', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 100
      });

      const mockReq = {
        headers: {
          'content-length': '0'
        }
      } as unknown as Request;

      const result = validator.validateRequest(mockReq);
      expect(result.valid).toBe(true);
    });
  });

  describe('paginateResponse', () => {
    it('should paginate data correctly', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 10
      });

      const data = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const result = validator.paginateResponse(data, 0, 10);

      expect(result.data).toHaveLength(10);
      expect(result.data[0].id).toBe(0);
      expect(result.data[9].id).toBe(9);
      expect(result.pagination.page).toBe(0);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.hasPrevious).toBe(false);
    });

    it('should handle second page correctly', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 10
      });

      const data = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const result = validator.paginateResponse(data, 1, 10);

      expect(result.data).toHaveLength(10);
      expect(result.data[0].id).toBe(10);
      expect(result.data[9].id).toBe(19);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.hasPrevious).toBe(true);
    });

    it('should handle last page correctly', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 10
      });

      const data = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const result = validator.paginateResponse(data, 2, 10);

      expect(result.data).toHaveLength(5);
      expect(result.data[0].id).toBe(20);
      expect(result.data[4].id).toBe(24);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.hasPrevious).toBe(true);
    });

    it('should respect maxArrayLength limit', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 10
      });

      const data = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const result = validator.paginateResponse(data, 0, 50); // Request 50, but max is 10

      expect(result.data).toHaveLength(10);
      expect(result.pagination.limit).toBe(10);
    });

    it('should handle empty data', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 10
      });

      const result = validator.paginateResponse([], 0, 10);

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should use default limit when not provided', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 20
      });

      const data = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      const result = validator.paginateResponse(data, 0);

      expect(result.pagination.limit).toBe(20);
    });
  });

  describe('estimateResponseSize', () => {
    it('should estimate size of simple object', () => {
      const validator = new PayloadValidator();
      const data = { id: 1, name: 'test' };
      
      const size = validator.estimateResponseSize(data);
      expect(size).toBeGreaterThan(0);
      expect(size).toBe(JSON.stringify(data).length);
    });

    it('should estimate size of array', () => {
      const validator = new PayloadValidator();
      const data = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `item${i}` }));
      
      const size = validator.estimateResponseSize(data);
      expect(size).toBeGreaterThan(0);
      expect(size).toBe(JSON.stringify(data).length);
    });

    it('should estimate size of nested object', () => {
      const validator = new PayloadValidator();
      const data = {
        user: {
          id: 1,
          profile: {
            name: 'test',
            settings: {
              theme: 'dark'
            }
          }
        }
      };
      
      const size = validator.estimateResponseSize(data);
      expect(size).toBeGreaterThan(0);
    });

    it('should handle circular references gracefully', () => {
      const validator = new PayloadValidator();
      const data: any = { id: 1 };
      data.self = data; // Create circular reference
      
      const size = validator.estimateResponseSize(data);
      expect(size).toBe(0); // Should return 0 on error
    });
  });

  describe('shouldCompress', () => {
    it('should return false for small data', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 100
      });

      const data = { id: 1, name: 'test' };
      expect(validator.shouldCompress(data)).toBe(false);
    });

    it('should return true for large data', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000,
        maxArrayLength: 100
      });

      // Create data that's > 80% of maxResponseSize (1000 bytes)
      const data = Array.from({ length: 50 }, (_, i) => ({ 
        id: i, 
        name: `item${i}`,
        description: 'A'.repeat(20)
      }));
      
      expect(validator.shouldCompress(data)).toBe(true);
    });
  });

  describe('validateResponse', () => {
    it('should validate response within size limit', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 1000000,
        maxArrayLength: 100
      });

      const data = { id: 1, name: 'test' };
      const result = validator.validateResponse(data);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject response exceeding size limit', () => {
      const validator = new PayloadValidator({
        maxRequestSize: 1000000,
        maxResponseSize: 100,
        maxArrayLength: 100
      });

      const data = Array.from({ length: 50 }, (_, i) => ({ 
        id: i, 
        name: `item${i}`,
        description: 'A'.repeat(50)
      }));
      
      const result = validator.validateResponse(data);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.maxSize).toBe(100);
    });
  });

  describe('getPaginationParams', () => {
    it('should extract pagination params from query', () => {
      const mockReq = {
        query: {
          page: '2',
          limit: '20'
        }
      } as unknown as Request;

      const params = PayloadValidator.getPaginationParams(mockReq);
      expect(params.page).toBe(2);
      expect(params.limit).toBe(20);
    });

    it('should use defaults when params not provided', () => {
      const mockReq = {
        query: {}
      } as unknown as Request;

      const params = PayloadValidator.getPaginationParams(mockReq);
      expect(params.page).toBe(0);
      expect(params.limit).toBeGreaterThan(0);
    });

    it('should handle invalid page number', () => {
      const mockReq = {
        query: {
          page: 'invalid',
          limit: '10'
        }
      } as unknown as Request;

      const params = PayloadValidator.getPaginationParams(mockReq);
      expect(params.page).toBe(0);
      expect(params.limit).toBe(10);
    });

    it('should handle negative page number', () => {
      const mockReq = {
        query: {
          page: '-5',
          limit: '10'
        }
      } as unknown as Request;

      const params = PayloadValidator.getPaginationParams(mockReq);
      expect(params.page).toBe(0); // Should default to 0
    });

    it('should enforce maximum limit', () => {
      const mockReq = {
        query: {
          page: '0',
          limit: '1000'
        }
      } as unknown as Request;

      const params = PayloadValidator.getPaginationParams(mockReq);
      expect(params.limit).toBeLessThanOrEqual(100); // Default max
    });

    it('should enforce minimum limit', () => {
      const mockReq = {
        query: {
          page: '0',
          limit: '0'
        }
      } as unknown as Request;

      const params = PayloadValidator.getPaginationParams(mockReq);
      expect(params.limit).toBeGreaterThanOrEqual(1);
    });
  });
});
