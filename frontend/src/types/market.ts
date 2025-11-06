export interface StockQuote {
  symbol: string;
  companyName: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  timestamp: string;
  marketStatus: MarketStatus;
}

export interface StockSearchResult {
  symbol: string;
  companyName: string;
  exchange: string;
  type: string;
}

export interface MarketDataResponse<T> {
  data: T;
  timestamp: string;
  source: 'cache' | 'api' | 'mixed';
  isStale?: boolean;
  warning?: string;
}

export interface StockSearchResponse extends MarketDataResponse<StockSearchResult[]> {
  query: string;
}

export interface StockValidationResponse extends MarketDataResponse<{
  symbol: string;
  isValid: boolean;
}> {}

export type MarketStatus = 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS';

export interface StockSearchProps {
  onStockSelect: (stock: StockSearchResult) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  showValidation?: boolean;
  maxResults?: number;
}

export interface StockSearchState {
  query: string;
  results: StockSearchResult[];
  isLoading: boolean;
  error: string | null;
  isOpen: boolean;
  selectedIndex: number;
  validationStatus: 'idle' | 'validating' | 'valid' | 'invalid';
}