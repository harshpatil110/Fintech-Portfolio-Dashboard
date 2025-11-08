export type TimeRange = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export interface PerformanceDataPoint {
  date: string;
  value: number;
  timestamp: number;
}

export interface PortfolioPerformanceHistory {
  timeRange: TimeRange;
  data: PerformanceDataPoint[];
  startValue: number;
  endValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn?: number;
}

export interface StockPerformanceHistory {
  symbol: string;
  companyName: string;
  timeRange: TimeRange;
  data: PerformanceDataPoint[];
  startPrice: number;
  endPrice: number;
  priceChange: number;
  priceChangePercent: number;
}

export interface MarketIndexData {
  indexName: string;
  symbol: string;
  data: PerformanceDataPoint[];
  startValue: number;
  endValue: number;
  change: number;
  changePercent: number;
}

export interface PerformanceComparison {
  portfolio: PerformanceDataPoint[];
  marketIndex: PerformanceDataPoint[];
  portfolioReturn: number;
  marketReturn: number;
  outperformance: number;
}

export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  volatility?: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  bestDay?: {
    date: string;
    return: number;
  };
  worstDay?: {
    date: string;
    return: number;
  };
}
