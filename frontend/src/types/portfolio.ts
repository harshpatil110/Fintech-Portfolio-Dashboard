export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  positions?: StockPosition[];
  totalValue?: number;
  totalGainLoss?: number;
  totalGainLossPercent?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockPosition {
  id: string;
  portfolioId: string;
  symbol: string;
  companyName: string;
  quantity: number;
  averageCost: number;
  currentPrice?: number;
  marketValue?: number;
  gainLoss?: number;
  gainLossPercent?: number;
  allocationPercent?: number;
  purchaseDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  positionCount: number;
  topPerformers: StockPosition[];
  worstPerformers: StockPosition[];
}

export interface PortfolioPerformance {
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  positionCount: number;
}

export interface PortfolioResponse {
  message: string;
  data: {
    portfolio: Portfolio | null;
    summary: PortfolioSummary;
    performance: PortfolioPerformance;
  };
  timestamp: string;
}

export interface CreateStockPositionRequest {
  symbol: string;
  companyName: string;
  quantity: number;
  averageCost: number;
  purchaseDate: string;
}

export interface UpdateStockPositionRequest {
  quantity?: number;
  averageCost?: number;
  purchaseDate?: string;
}

export interface TransactionHistory {
  id: string;
  portfolioId: string;
  positionId?: string;
  symbol: string;
  transactionType: 'BUY' | 'SELL' | 'UPDATE' | 'DELETE';
  quantity?: number;
  price?: number;
  totalValue?: number;
  notes?: string;
  transactionDate: string;
  createdAt: string;
}

export interface PortfolioFilters {
  symbols?: string[];
  minValue?: number;
  maxValue?: number;
  gainersOnly?: boolean;
  losersOnly?: boolean;
  sortBy?: 'symbol' | 'value' | 'gainLoss' | 'gainLossPercent' | 'allocation';
  sortOrder?: 'asc' | 'desc';
}

export interface BulkOperationRequest {
  operation: 'delete' | 'update';
  positionIds: string[];
  updateData?: Partial<UpdateStockPositionRequest>;
}

export interface BulkOperationResult {
  successful: string[];
  failed: Array<{
    positionId: string;
    error: string;
  }>;
}