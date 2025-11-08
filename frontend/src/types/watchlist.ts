export interface WatchlistItem {
  id: string;
  userId: string;
  symbol: string;
  companyName: string;
  currentPrice?: number;
  change?: number;
  changePercent?: number;
  alertPrice?: number;
  addedAt: string;
}

export interface WatchlistSummary {
  totalItems: number;
  filteredItems?: number;
  itemsWithAlerts: number;
  triggeredAlerts: WatchlistItem[];
}

export interface WatchlistResponse {
  message: string;
  data: {
    items: WatchlistItem[];
    summary: WatchlistSummary;
  };
  timestamp: string;
}

export interface AddToWatchlistRequest {
  symbol: string;
  companyName: string;
  alertPrice?: number;
}

export interface UpdateWatchlistItemRequest {
  alertPrice?: number;
}

export interface WatchlistFilters {
  sortBy?: 'symbol' | 'companyName' | 'currentPrice' | 'change' | 'changePercent' | 'alertPrice' | 'addedAt';
  sortOrder?: 'asc' | 'desc';
  filterBy?: 'symbol' | 'companyName';
  filterValue?: string;
  alertsOnly?: boolean;
  gainersOnly?: boolean;
  losersOnly?: boolean;
}

export interface BulkAddToWatchlistRequest {
  stocks: AddToWatchlistRequest[];
}

export interface BulkAddResult {
  summary: {
    requested: number;
    added: number;
    skipped: number;
    errors: number;
  };
  results: {
    added: WatchlistItem[];
    skipped: Array<{ symbol: string; reason: string }>;
    errors: Array<{ symbol: string; reason: string }>;
  };
}
