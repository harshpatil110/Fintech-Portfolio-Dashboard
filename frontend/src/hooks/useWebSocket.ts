import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './useAuthHook';
import { AuthTokenManager } from '../utils/auth';

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'quote' | 'error' | 'heartbeat' | 'market_status';
  data?: any;
  timestamp?: string;
}

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
  marketStatus: 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS';
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  quotes: Map<string, StockQuote>;
  marketStatus: string | null;
  subscribe: (symbols: string[]) => void;
  unsubscribe: (symbols?: string[]) => void;
  error: string | null;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export const useWebSocket = (): UseWebSocketReturn => {
  const { isAuthenticated } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const [isConnected, setIsConnected] = useState(false);
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(new Map());
  const [marketStatus, setMarketStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  const connect = useCallback(() => {
    const token = AuthTokenManager.getToken();
    if (!isAuthenticated || !token) {
      setConnectionState('disconnected');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setConnectionState('connecting');
      setError(null);

      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/market?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionState('connected');
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
          setError('Failed to parse server message');
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setConnectionState('disconnected');
        wsRef.current = null;

        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          scheduleReconnect();
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error occurred');
        setConnectionState('error');
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setError('Failed to establish connection');
      setConnectionState('error');
    }
  }, [isAuthenticated]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectAttemptsRef.current += 1;
    const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);

    console.log(`Scheduling reconnect attempt ${reconnectAttemptsRef.current} in ${delay}ms`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'quote':
        if (message.data?.quotes && Array.isArray(message.data.quotes)) {
          setQuotes(prevQuotes => {
            const newQuotes = new Map(prevQuotes);
            message.data.quotes.forEach((quote: StockQuote) => {
              newQuotes.set(quote.symbol, quote);
            });
            return newQuotes;
          });
        }
        break;

      case 'market_status':
        if (message.data?.status) {
          setMarketStatus(message.data.status);
        }
        break;

      case 'error':
        console.error('WebSocket server error:', message.data?.message);
        setError(message.data?.message || 'Server error');
        break;

      case 'heartbeat':
        // Handle heartbeat - connection is alive
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (err) {
        console.error('Failed to send WebSocket message:', err);
        setError('Failed to send message');
      }
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }, []);

  const subscribe = useCallback((symbols: string[]) => {
    if (symbols.length === 0) return;

    const validSymbols = symbols.filter(symbol => symbol && symbol.trim().length > 0);
    if (validSymbols.length === 0) return;

    sendMessage({
      type: 'subscribe',
      data: { symbols: validSymbols },
      timestamp: new Date().toISOString()
    });
  }, [sendMessage]);

  const unsubscribe = useCallback((symbols?: string[]) => {
    sendMessage({
      type: 'unsubscribe',
      data: symbols ? { symbols } : {},
      timestamp: new Date().toISOString()
    });
  }, [sendMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionState('disconnected');
    setQuotes(new Map());
    setMarketStatus(null);
    setError(null);
  }, []);

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    quotes,
    marketStatus,
    subscribe,
    unsubscribe,
    error,
    connectionState
  };
};