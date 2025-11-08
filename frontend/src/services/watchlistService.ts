import axios from 'axios';
import {
  WatchlistItem,
  WatchlistResponse,
  AddToWatchlistRequest,
  UpdateWatchlistItemRequest,
  WatchlistFilters,
  BulkAddToWatchlistRequest,
  BulkAddResult
} from '../types/watchlist';
import { getAuthHeader } from '../utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const watchlistApi = axios.create({
  baseURL: `${API_BASE_URL}/watchlist`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
watchlistApi.interceptors.request.use((config) => {
  const authHeader = getAuthHeader();
  if ('Authorization' in authHeader) {
    config.headers.Authorization = authHeader.Authorization;
  }
  return config;
});

// Response interceptor for error handling
watchlistApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const watchlistService = {
  async getWatchlist(userId: string, filters?: WatchlistFilters): Promise<WatchlistResponse> {
    try {
      const params: any = {};
      if (filters?.sortBy) params.sortBy = filters.sortBy;
      if (filters?.sortOrder) params.sortOrder = filters.sortOrder;
      if (filters?.filterBy) params.filterBy = filters.filterBy;
      if (filters?.filterValue) params.filterValue = filters.filterValue;
      if (filters?.alertsOnly) params.alertsOnly = 'true';
      if (filters?.gainersOnly) params.gainersOnly = 'true';
      if (filters?.losersOnly) params.losersOnly = 'true';

      const response = await watchlistApi.get<WatchlistResponse>(`/${userId}`, { params });
      return response.data;
    } catch (error) {
      console.error('Failed to get watchlist:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to get watchlist';
        throw new Error(message);
      }
      throw new Error('Failed to get watchlist');
    }
  },

  async addToWatchlist(request: AddToWatchlistRequest): Promise<WatchlistItem> {
    try {
      const response = await watchlistApi.post<{
        message: string;
        data: WatchlistItem;
        timestamp: string;
      }>('/', request);
      return response.data.data;
    } catch (error) {
      console.error('Failed to add to watchlist:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to add to watchlist';
        throw new Error(message);
      }
      throw new Error('Failed to add to watchlist');
    }
  },

  async removeFromWatchlist(userId: string, symbol: string): Promise<void> {
    try {
      await watchlistApi.delete(`/${userId}/${symbol}`);
    } catch (error) {
      console.error('Failed to remove from watchlist:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to remove from watchlist';
        throw new Error(message);
      }
      throw new Error('Failed to remove from watchlist');
    }
  },

  async clearWatchlist(userId: string): Promise<void> {
    try {
      await watchlistApi.delete(`/${userId}`);
    } catch (error) {
      console.error('Failed to clear watchlist:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to clear watchlist';
        throw new Error(message);
      }
      throw new Error('Failed to clear watchlist');
    }
  },

  async updateWatchlistItem(
    userId: string,
    symbol: string,
    updates: UpdateWatchlistItemRequest
  ): Promise<WatchlistItem> {
    try {
      const response = await watchlistApi.put<{
        message: string;
        data: WatchlistItem;
        timestamp: string;
      }>(`/${userId}/${symbol}`, updates);
      return response.data.data;
    } catch (error) {
      console.error('Failed to update watchlist item:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to update watchlist item';
        throw new Error(message);
      }
      throw new Error('Failed to update watchlist item');
    }
  },

  async bulkAddToWatchlist(request: BulkAddToWatchlistRequest): Promise<BulkAddResult> {
    try {
      const response = await watchlistApi.post<{
        message: string;
        data: BulkAddResult;
        timestamp: string;
      }>('/bulk', request);
      return response.data.data;
    } catch (error) {
      console.error('Failed to bulk add to watchlist:', error);
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error?.message || 'Failed to bulk add to watchlist';
        throw new Error(message);
      }
      throw new Error('Failed to bulk add to watchlist');
    }
  }
};
