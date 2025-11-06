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