export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  positions?: StockPosition[];
  totalValue?: number;
  totalGainLoss?: number;
  totalGainLossPercent?: number;
  createdAt: Date;
  updatedAt: Date;
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
  purchaseDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePortfolioRequest {
  name?: string;
}

export interface UpdatePortfolioRequest {
  name?: string;
}

export interface CreateStockPositionRequest {
  symbol: string;
  companyName: string;
  quantity: number;
  averageCost: number;
  purchaseDate: string; // ISO date string
}

export interface UpdateStockPositionRequest {
  quantity?: number;
  averageCost?: number;
  purchaseDate?: string; // ISO date string
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
  startValue: number;
  endValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn?: number;
  timeRange: '1D' | '1W' | '1M' | '3M' | '1Y';
}

export interface PortfolioAllocation {
  symbol: string;
  companyName: string;
  marketValue: number;
  allocationPercent: number;
  gainLoss: number;
  gainLossPercent: number;
}

export interface DiversificationMetrics {
  concentrationRisk: number;
  numberOfPositions: number;
  averagePositionSize: number;
  largestPosition: StockPosition | null;
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
  transactionDate: Date;
  createdAt: Date;
}

export interface BulkPositionOperation {
  positionIds: string[];
  operation: 'delete' | 'update';
  updateData?: Partial<UpdateStockPositionRequest>;
}

export interface BulkOperationResult {
  successful: string[];
  failed: Array<{
    positionId: string;
    error: string;
  }>;
}