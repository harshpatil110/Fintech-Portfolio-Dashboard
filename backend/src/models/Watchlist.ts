export interface Watchlist {
  id: string;
  userId: string;
  stocks: WatchlistItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  symbol: string;
  companyName: string;
  alertPrice?: number;
  addedAt: Date;
  currentPrice?: number;
  change?: number;
  changePercent?: number;
}

export interface CreateWatchlistItemRequest {
  symbol: string;
  companyName: string;
  alertPrice?: number;
}

export interface UpdateWatchlistItemRequest {
  alertPrice?: number;
}

export interface WatchlistSummary {
  totalItems: number;
  itemsWithAlerts: number;
  triggeredAlerts: WatchlistItem[];
}