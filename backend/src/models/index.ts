// User models
export * from './User';

// Portfolio models
export * from './Portfolio';

// Market data models
export * from './MarketData';

// Watchlist models
export * from './Watchlist';

// Utility classes
export * from './validation';
export * from './calculations';

// Common response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: Date;
  };
}

// WebSocket message types
export interface WebSocketMessage<T = any> {
  type: 'PRICE_UPDATE' | 'PORTFOLIO_UPDATE' | 'MARKET_STATUS' | 'ERROR';
  data: T;
  timestamp: Date;
}

export interface PriceUpdateMessage {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: Date;
}

export interface MarketStatusMessage {
  status: 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS';
  nextOpen?: Date;
  nextClose?: Date;
}