export interface StockQuote {
  symbol: string;
  companyName: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  timestamp: Date;
  marketStatus: MarketStatus;
}

export interface HistoricalData {
  symbol: string;
  data: PricePoint[];
}

export interface PricePoint {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataCache {
  id: string;
  symbol: string;
  price: number;
  previousClose: number;
  changeAmount: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  timestamp: Date;
  marketStatus: MarketStatus;
}

export interface HistoricalPrice {
  id: string;
  symbol: string;
  date: Date;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  createdAt: Date;
}

export type MarketStatus = 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS';

export interface StockSearchResult {
  symbol: string;
  companyName: string;
  exchange: string;
  type: string;
}

export interface BatchQuoteRequest {
  symbols: string[];
}

export interface MarketDataResponse<T> {
  data: T;
  timestamp: Date;
  source: 'cache' | 'api';
  isStale?: boolean;
}