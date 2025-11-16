import {
  WatchlistItem,
  WatchlistResponse,
  AddToWatchlistRequest,
  UpdateWatchlistItemRequest,
  WatchlistFilters,
  BulkAddToWatchlistRequest,
  BulkAddResult
} from '../types/watchlist';
import { createApiClient, apiCall } from '../utils/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Create API client with retry logic
const watchlistApi = createApiClient(`${API_BASE_URL}/watchlist`);

export const watchlistService = {
  async getWatchlist(userId: string, filters?: WatchlistFilters): Promise<WatchlistResponse> {
    const params: any = {};
    if (filters?.sortBy) params.sortBy = filters.sortBy;
    if (filters?.sortOrder) params.sortOrder = filters.sortOrder;
    if (filters?.filterBy) params.filterBy = filters.filterBy;
    if (filters?.filterValue) params.filterValue = filters.filterValue;
    if (filters?.alertsOnly) params.alertsOnly = 'true';
    if (filters?.gainersOnly) params.gainersOnly = 'true';
    if (filters?.losersOnly) params.losersOnly = 'true';

    return apiCall(() => watchlistApi.get<WatchlistResponse>(`/${userId}`, { params }));
  },

  async addToWatchlist(request: AddToWatchlistRequest): Promise<WatchlistItem> {
    const response = await apiCall(() =>
      watchlistApi.post<{
        message: string;
        data: WatchlistItem;
        timestamp: string;
      }>('/', request)
    );
    return response.data;
  },

  async removeFromWatchlist(userId: string, symbol: string): Promise<void> {
    await apiCall(() => watchlistApi.delete(`/${userId}/${symbol}`));
  },

  async clearWatchlist(userId: string): Promise<void> {
    await apiCall(() => watchlistApi.delete(`/${userId}`));
  },

  async updateWatchlistItem(
    userId: string,
    symbol: string,
    updates: UpdateWatchlistItemRequest
  ): Promise<WatchlistItem> {
    const response = await apiCall(() =>
      watchlistApi.put<{
        message: string;
        data: WatchlistItem;
        timestamp: string;
      }>(`/${userId}/${symbol}`, updates)
    );
    return response.data;
  },

  async bulkAddToWatchlist(request: BulkAddToWatchlistRequest): Promise<BulkAddResult> {
    const response = await apiCall(() =>
      watchlistApi.post<{
        message: string;
        data: BulkAddResult;
        timestamp: string;
      }>('/bulk', request)
    );
    return response.data;
  }
};
