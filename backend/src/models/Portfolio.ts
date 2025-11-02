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