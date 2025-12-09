// Mock watchlist hook for demo mode
import { useState, useCallback } from 'react';
import { WatchlistItem, WatchlistFilters } from '../types/watchlist';

const mockWatchlistItems: WatchlistItem[] = [
  {
    id: '1',
    userId: 'mock-user-id',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    addedAt: new Date().toISOString(),
    currentPrice: 178.50,
    change: 2.35,
    changePercent: 1.33,
  },
  {
    id: '2',
    userId: 'mock-user-id',
    symbol: 'GOOGL',
    companyName: 'Alphabet Inc.',
    addedAt: new Date().toISOString(),
    currentPrice: 141.25,
    change: -1.20,
    changePercent: -0.84,
  },
  {
    id: '3',
    userId: 'mock-user-id',
    symbol: 'MSFT',
    companyName: 'Microsoft Corporation',
    addedAt: new Date().toISOString(),
    currentPrice: 378.90,
    change: 4.50,
    changePercent: 1.20,
    alertPrice: 400,
  },
];

export const useMockWatchlist = () => {
  const [items, setItems] = useState<WatchlistItem[]>(mockWatchlistItems);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const addItem = useCallback((symbol: string, companyName: string, alertPrice?: number) => {
    const newItem: WatchlistItem = {
      id: `${Date.now()}`,
      userId: 'mock-user-id',
      symbol,
      companyName,
      addedAt: new Date().toISOString(),
      currentPrice: Math.random() * 500 + 50,
      change: (Math.random() - 0.5) * 10,
      changePercent: (Math.random() - 0.5) * 5,
      alertPrice,
    };
    setItems(prev => [...prev, newItem]);
  }, []);

  const removeItem = useCallback((symbol: string) => {
    setItems(prev => prev.filter(item => item.symbol !== symbol));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const updateAlert = useCallback((symbol: string, alertPrice?: number) => {
    setItems(prev => prev.map(item => 
      item.symbol === symbol ? { ...item, alertPrice } : item
    ));
  }, []);

  return {
    items,
    isLoading,
    error,
    addItem,
    removeItem,
    clearAll,
    updateAlert,
    refetch: () => {},
  };
};
