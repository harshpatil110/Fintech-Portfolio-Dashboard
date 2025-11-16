import { 
  PortfolioResponse,
  CreateStockPositionRequest,
  UpdateStockPositionRequest,
  StockPosition,
  TransactionHistory,
  PortfolioFilters,
  BulkOperationRequest,
  BulkOperationResult
} from '../types/portfolio';
import { createApiClient, apiCall } from '../utils/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Create API client with retry logic
const portfolioApi = createApiClient(`${API_BASE_URL}/portfolio`);

export const portfolioService = {
  async getPortfolio(userId: string): Promise<PortfolioResponse> {
    return apiCall(() => portfolioApi.get<PortfolioResponse>(`/${userId}`));
  },

  async addPosition(position: CreateStockPositionRequest): Promise<StockPosition> {
    const response = await apiCall(() =>
      portfolioApi.post<{
        message: string;
        data: StockPosition;
        timestamp: string;
      }>('/position', position)
    );
    return response.data;
  },

  async updatePosition(positionId: string, updates: UpdateStockPositionRequest): Promise<StockPosition> {
    const response = await apiCall(() =>
      portfolioApi.put<{
        message: string;
        data: StockPosition;
        timestamp: string;
      }>(`/position/${positionId}`, updates)
    );
    return response.data;
  },

  async removePosition(positionId: string): Promise<void> {
    await apiCall(() => portfolioApi.delete(`/position/${positionId}`));
  },

  async getTransactionHistory(userId: string, limit?: number): Promise<TransactionHistory[]> {
    const params = limit ? { limit: limit.toString() } : {};
    const response = await apiCall(() =>
      portfolioApi.get<{
        message: string;
        data: TransactionHistory[];
        timestamp: string;
      }>(`/${userId}/history`, { params })
    );
    return response.data;
  },

  async getFilteredPositions(userId: string, filters: PortfolioFilters): Promise<StockPosition[]> {
    const params: any = {};
    if (filters.symbols) params.symbols = filters.symbols.join(',');
    if (filters.minValue) params.minValue = filters.minValue.toString();
    if (filters.maxValue) params.maxValue = filters.maxValue.toString();
    if (filters.gainersOnly) params.gainersOnly = 'true';
    if (filters.losersOnly) params.losersOnly = 'true';
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.sortOrder) params.sortOrder = filters.sortOrder;

    const response = await apiCall(() =>
      portfolioApi.get<{
        message: string;
        data: StockPosition[];
        timestamp: string;
      }>(`/${userId}/positions/filtered`, { params })
    );
    return response.data;
  },

  async performBulkOperation(operation: BulkOperationRequest): Promise<BulkOperationResult> {
    const response = await apiCall(() =>
      portfolioApi.post<{
        message: string;
        data: BulkOperationResult;
        timestamp: string;
      }>('/bulk-operations', operation)
    );
    return response.data;
  }
};