import { 
  StockQuote, 
  StockSearchResult, 
  MarketDataResponse,
  StockSearchResponse,
  StockValidationResponse
} from '../types/market';
import { createApiClient, apiCall } from '../utils/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Create API client with retry logic
const marketApi = createApiClient(`${API_BASE_URL}/market`);

export const marketService = {
  async searchStocks(query: string): Promise<StockSearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const response = await apiCall(() =>
      marketApi.get<StockSearchResponse>('/search', {
        params: { q: query.trim() }
      })
    );
    return response.data;
  },

  async validateSymbol(symbol: string): Promise<boolean> {
    if (!symbol || symbol.trim().length === 0) {
      return false;
    }

    try {
      const response = await apiCall(() =>
        marketApi.get<StockValidationResponse>(`/validate/${symbol.trim().toUpperCase()}`)
      );
      return response.data.isValid;
    } catch (error) {
      console.error('Symbol validation failed:', error);
      return false;
    }
  },

  async getQuote(symbol: string): Promise<StockQuote> {
    if (!symbol || symbol.trim().length === 0) {
      throw new Error('Symbol is required');
    }

    const response = await apiCall(() =>
      marketApi.get<MarketDataResponse<StockQuote>>(`/quote/${symbol.trim().toUpperCase()}`)
    );
    return response.data;
  },

  async getBatchQuotes(symbols: string[]): Promise<StockQuote[]> {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    const cleanSymbols = symbols
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0);

    if (cleanSymbols.length === 0) {
      return [];
    }

    const response = await apiCall(() =>
      marketApi.post<MarketDataResponse<StockQuote[]>>('/quotes', {
        symbols: cleanSymbols
      })
    );
    return response.data;
  }
};