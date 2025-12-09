import axios from 'axios';
import {
  TimeRange,
  PortfolioPerformanceHistory,
  StockPerformanceHistory,
  PerformanceComparison,
  PerformanceMetrics
} from '../types/performance';
import { getAuthHeader } from '../utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const performanceApi = axios.create({
  baseURL: `${API_BASE_URL}/portfolio`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
performanceApi.interceptors.request.use((config: any) => {
  const authHeader = getAuthHeader();
  if ('Authorization' in authHeader) {
    config.headers.Authorization = authHeader.Authorization;
  }
  return config;
});

// Response interceptor for error handling
performanceApi.interceptors.response.use(
  (response: any) => response,
  (error: any) => {
    if (error.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const performanceService = {
  /**
   * Get portfolio performance history for a given time range
   */
  async getPortfolioPerformance(
    userId: string,
    timeRange: TimeRange
  ): Promise<PortfolioPerformanceHistory> {
    try {
      const response = await performanceApi.get<{
        message: string;
        data: PortfolioPerformanceHistory;
        timestamp: string;
      }>(`/${userId}/performance/history`, {
        params: { timeRange }
      });
      return response.data.data;
    } catch (error: unknown) {
      console.error('Failed to get portfolio performance:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to get portfolio performance';
        throw new Error(message);
      }
      throw new Error('Failed to get portfolio performance');
    }
  },

  /**
   * Get individual stock performance history
   */
  async getStockPerformance(
    symbol: string,
    timeRange: TimeRange
  ): Promise<StockPerformanceHistory> {
    try {
      const response = await performanceApi.get<{
        message: string;
        data: StockPerformanceHistory;
        timestamp: string;
      }>(`/stock/${symbol}/performance`, {
        params: { timeRange }
      });
      return response.data.data;
    } catch (error: unknown) {
      console.error('Failed to get stock performance:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to get stock performance';
        throw new Error(message);
      }
      throw new Error('Failed to get stock performance');
    }
  },

  /**
   * Get portfolio vs market index comparison
   */
  async getPerformanceComparison(
    userId: string,
    timeRange: TimeRange,
    indexSymbol: string = 'SPY'
  ): Promise<PerformanceComparison> {
    try {
      const response = await performanceApi.get<{
        message: string;
        data: PerformanceComparison;
        timestamp: string;
      }>(`/${userId}/performance/comparison`, {
        params: { timeRange, indexSymbol }
      });
      return response.data.data;
    } catch (error: unknown) {
      console.error('Failed to get performance comparison:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to get performance comparison';
        throw new Error(message);
      }
      throw new Error('Failed to get performance comparison');
    }
  },

  /**
   * Get detailed performance metrics
   */
  async getPerformanceMetrics(
    userId: string,
    timeRange: TimeRange
  ): Promise<PerformanceMetrics> {
    try {
      const response = await performanceApi.get<{
        message: string;
        data: PerformanceMetrics;
        timestamp: string;
      }>(`/${userId}/performance/metrics`, {
        params: { timeRange }
      });
      return response.data.data;
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to get performance metrics';
        throw new Error(message);
      }
      throw new Error('Failed to get performance metrics');
    }
  }
};
