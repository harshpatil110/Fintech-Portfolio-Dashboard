import axios from 'axios';
import { 
  Portfolio, 
  PortfolioResponse,
  CreateStockPositionRequest,
  UpdateStockPositionRequest,
  StockPosition
} from '../types/portfolio';
import { getAuthHeader } from '../utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const portfolioApi = axios.create({
  baseURL: `${API_BASE_URL}/portfolio`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
portfolioApi.interceptors.request.use((config) => {
  const authHeader = getAuthHeader();
  if ('Authorization' in authHeader) {
    config.headers.Authorization = authHeader.Authorization;
  }
  return config;
});

// Response interceptor for error handling
portfolioApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const portfolioService = {
  async getPortfolio(userId: string): Promise<PortfolioResponse> {
    try {
      const response = await portfolioApi.get<PortfolioResponse>(`/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get portfolio:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to get portfolio';
        throw new Error(message);
      }
      throw new Error('Failed to get portfolio');
    }
  },

  async addPosition(position: CreateStockPositionRequest): Promise<StockPosition> {
    try {
      const response = await portfolioApi.post<{
        message: string;
        data: StockPosition;
        timestamp: string;
      }>('/position', position);
      return response.data.data;
    } catch (error) {
      console.error('Failed to add position:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to add position';
        throw new Error(message);
      }
      throw new Error('Failed to add position');
    }
  },

  async updatePosition(positionId: string, updates: UpdateStockPositionRequest): Promise<StockPosition> {
    try {
      const response = await portfolioApi.put<{
        message: string;
        data: StockPosition;
        timestamp: string;
      }>(`/position/${positionId}`, updates);
      return response.data.data;
    } catch (error) {
      console.error('Failed to update position:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to update position';
        throw new Error(message);
      }
      throw new Error('Failed to update position');
    }
  },

  async removePosition(positionId: string): Promise<void> {
    try {
      await portfolioApi.delete(`/position/${positionId}`);
    } catch (error) {
      console.error('Failed to remove position:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to remove position';
        throw new Error(message);
      }
      throw new Error('Failed to remove position');
    }
  }
};