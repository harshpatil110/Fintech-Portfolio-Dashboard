import axios from 'axios';
import { 
  StockQuote, 
  StockSearchResult, 
  MarketDataResponse,
  StockSearchResponse,
  StockValidationResponse
} from '../types/market';
import { getAuthHeader } from '../utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const marketApi = axios.create({
  baseURL: `${API_BASE_URL}/market`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
marketApi.interceptors.request.use((config) => {
  const authHeader = getAuthHeader();
  if ('Authorization' in authHeader) {
    config.headers.Authorization = authHeader.Authorization;
  }
  return config;
});

// Response interceptor for error handling
marketApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const marketService = {
  async searchStocks(query: string): Promise<StockSearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    try {
      const response = await marketApi.get<StockSearchResponse>('/search', {
        params: { q: query.trim() }
      });
      return response.data.data;
    } catch (error) {
      console.error('Stock search failed:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to search stocks';
        throw new Error(message);
      }
      throw new Error('Failed to search stocks');
    }
  },

  async validateSymbol(symbol: string): Promise<boolean> {
    if (!symbol || symbol.trim().length === 0) {
      return false;
    }

    try {
      const response = await marketApi.get<StockValidationResponse>(`/validate/${symbol.trim().toUpperCase()}`);
      return response.data.data.isValid;
    } catch (error) {
      console.error('Symbol validation failed:', error);
      return false;
    }
  },

  async getQuote(symbol: string): Promise<StockQuote> {
    if (!symbol || symbol.trim().length === 0) {
      throw new Error('Symbol is required');
    }

    try {
      const response = await marketApi.get<MarketDataResponse<StockQuote>>(`/quote/${symbol.trim().toUpperCase()}`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to get stock quote:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to get stock quote';
        throw new Error(message);
      }
      throw new Error('Failed to get stock quote');
    }
  },

  async getBatchQuotes(symbols: string[]): Promise<StockQuote[]> {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    try {
      const cleanSymbols = symbols
        .map(s => s.trim().toUpperCase())
        .filter(s => s.length > 0);

      if (cleanSymbols.length === 0) {
        return [];
      }

      const response = await marketApi.post<MarketDataResponse<StockQuote[]>>('/quotes', {
        symbols: cleanSymbols
      });
      return response.data.data;
    } catch (error) {
      console.error('Failed to get batch quotes:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to get stock quotes';
        throw new Error(message);
      }
      throw new Error('Failed to get stock quotes');
    }
  }
};