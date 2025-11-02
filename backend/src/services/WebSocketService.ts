import WebSocket from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { createMarketDataService } from './MarketDataService';
import CacheService from './CacheService';
import { StockQuote } from '../models/MarketData';

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'quote' | 'error' | 'heartbeat' | 'market_status';
  data?: any;
  timestamp?: Date;
}

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
  subscribedSymbols?: Set<string>;
}

export class WebSocketService {
  private wss: WebSocket.Server;
  private marketDataService = createMarketDataService();
  private clients = new Map<string, AuthenticatedWebSocket>();
  private subscriptions = new Map<string, Set<string>>(); // symbol -> userIds
  private updateInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_FREQUENCY = 60000; // 1 minute
  private readonly HEARTBEAT_FREQUENCY = 30000; // 30 seconds

  constructor(server: Server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws/market',
      verifyClient: this.verifyClient.bind(this)
    });

    this.setupWebSocketServer();
    this.startPeriodicUpdates();
    this.startHeartbeat();
  }

  private verifyClient(info: any): boolean {
    try {
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        return false;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      info.req.userId = decoded.userId;
      return true;
    } catch (error) {
      console.error('WebSocket authentication failed:', error);
      return false;
    }
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: AuthenticatedWebSocket, req: any) => {
      const userId = req.userId;
      
      if (!userId) {
        ws.close(1008, 'Authentication required');
        return;
      }

      // Initialize WebSocket properties
      ws.userId = userId;
      ws.isAlive = true;
      ws.subscribedSymbols = new Set();

      // Store client connection
      this.clients.set(userId, ws);

      // Register session in cache
      CacheService.addWebSocketSession(userId, this.generateSessionId(), []);

      console.log(`WebSocket client connected: ${userId}`);

      // Send welcome message
      this.sendMessage(ws, {
        type: 'heartbeat',
        data: { message: 'Connected to market data stream' },
        timestamp: new Date()
      });

      // Handle incoming messages
      ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(ws, data);
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.handleDisconnect(userId);
      });

      // Handle WebSocket errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error);
        this.handleDisconnect(userId);
      });

      // Pong handler for heartbeat
      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  private handleMessage(ws: AuthenticatedWebSocket, data: WebSocket.Data): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(ws, message.data);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(ws, message.data);
          break;
        case 'heartbeat':
          this.sendMessage(ws, {
            type: 'heartbeat',
            data: { pong: true },
            timestamp: new Date()
          });
          break;
        default:
          this.sendError(ws, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.sendError(ws, 'Invalid message format');
    }
  }

  private async handleSubscribe(ws: AuthenticatedWebSocket, data: any): Promise<void> {
    try {
      const { symbols } = data;
      
      if (!Array.isArray(symbols) || symbols.length === 0) {
        this.sendError(ws, 'Invalid symbols array');
        return;
      }

      // Validate symbols (limit to 50 per user)
      if (symbols.length > 50) {
        this.sendError(ws, 'Maximum 50 symbols allowed per subscription');
        return;
      }

      const userId = ws.userId!;
      const validSymbols = symbols.map(s => s.toUpperCase()).filter(s => /^[A-Z0-9.-]+$/.test(s));

      // Update client subscriptions
      ws.subscribedSymbols = new Set(validSymbols);

      // Update global subscriptions map
      for (const symbol of validSymbols) {
        if (!this.subscriptions.has(symbol)) {
          this.subscriptions.set(symbol, new Set());
        }
        this.subscriptions.get(symbol)!.add(userId);
      }

      // Update cache
      await CacheService.updateWebSocketSymbols(userId, validSymbols);

      // Send current quotes for subscribed symbols
      await this.sendCurrentQuotes(ws, validSymbols);

      // Confirm subscription
      this.sendMessage(ws, {
        type: 'subscribe',
        data: { 
          symbols: validSymbols,
          message: `Subscribed to ${validSymbols.length} symbols`
        },
        timestamp: new Date()
      });

      console.log(`User ${userId} subscribed to symbols:`, validSymbols);
    } catch (error) {
      console.error('Error handling subscribe:', error);
      this.sendError(ws, 'Failed to process subscription');
    }
  }

  private handleUnsubscribe(ws: AuthenticatedWebSocket, data: any): void {
    try {
      const { symbols } = data;
      const userId = ws.userId!;

      if (Array.isArray(symbols)) {
        // Unsubscribe from specific symbols
        const symbolsToRemove = symbols.map(s => s.toUpperCase());
        
        for (const symbol of symbolsToRemove) {
          ws.subscribedSymbols?.delete(symbol);
          
          const subscribers = this.subscriptions.get(symbol);
          if (subscribers) {
            subscribers.delete(userId);
            if (subscribers.size === 0) {
              this.subscriptions.delete(symbol);
            }
          }
        }

        this.sendMessage(ws, {
          type: 'unsubscribe',
          data: { 
            symbols: symbolsToRemove,
            message: `Unsubscribed from ${symbolsToRemove.length} symbols`
          },
          timestamp: new Date()
        });
      } else {
        // Unsubscribe from all symbols
        const allSymbols = Array.from(ws.subscribedSymbols || []);
        
        for (const symbol of allSymbols) {
          const subscribers = this.subscriptions.get(symbol);
          if (subscribers) {
            subscribers.delete(userId);
            if (subscribers.size === 0) {
              this.subscriptions.delete(symbol);
            }
          }
        }

        ws.subscribedSymbols?.clear();

        this.sendMessage(ws, {
          type: 'unsubscribe',
          data: { 
            symbols: allSymbols,
            message: 'Unsubscribed from all symbols'
          },
          timestamp: new Date()
        });
      }

      // Update cache
      CacheService.updateWebSocketSymbols(userId, Array.from(ws.subscribedSymbols || []));

      console.log(`User ${userId} unsubscribed from symbols`);
    } catch (error) {
      console.error('Error handling unsubscribe:', error);
      this.sendError(ws, 'Failed to process unsubscription');
    }
  }

  private async sendCurrentQuotes(ws: AuthenticatedWebSocket, symbols: string[]): Promise<void> {
    try {
      // Try to get quotes from cache first
      const cachedQuotes = await CacheService.getCachedBatchQuotes(symbols);
      const quotesToSend: StockQuote[] = [];

      for (const symbol of symbols) {
        const cached = cachedQuotes.get(symbol);
        if (cached) {
          // Check if cached data is not too stale (within 5 minutes)
          const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
          if (cacheAge < 5 * 60 * 1000) {
            quotesToSend.push(cached);
          }
        }
      }

      // Send cached quotes immediately
      if (quotesToSend.length > 0) {
        this.sendMessage(ws, {
          type: 'quote',
          data: { quotes: quotesToSend, source: 'cache' },
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error sending current quotes:', error);
    }
  }

  private handleDisconnect(userId: string): void {
    const ws = this.clients.get(userId);
    
    if (ws) {
      // Remove from subscriptions
      for (const symbol of ws.subscribedSymbols || []) {
        const subscribers = this.subscriptions.get(symbol);
        if (subscribers) {
          subscribers.delete(userId);
          if (subscribers.size === 0) {
            this.subscriptions.delete(symbol);
          }
        }
      }

      // Remove client
      this.clients.delete(userId);

      // Remove from cache
      CacheService.removeWebSocketSession(userId);

      console.log(`WebSocket client disconnected: ${userId}`);
    }
  }

  private sendMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    }
  }

  private sendError(ws: AuthenticatedWebSocket, message: string): void {
    this.sendMessage(ws, {
      type: 'error',
      data: { message },
      timestamp: new Date()
    });
  }

  private broadcast(message: WebSocketMessage, userIds?: Set<string>): void {
    const targetUsers = userIds || new Set(this.clients.keys());
    
    for (const userId of targetUsers) {
      const ws = this.clients.get(userId);
      if (ws) {
        this.sendMessage(ws, message);
      }
    }
  }

  private startPeriodicUpdates(): void {
    this.updateInterval = setInterval(async () => {
      await this.updateMarketData();
    }, this.UPDATE_FREQUENCY);

    console.log(`Started periodic market data updates every ${this.UPDATE_FREQUENCY / 1000} seconds`);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (ws.isAlive === false) {
          console.log(`Terminating inactive WebSocket connection for user: ${ws.userId}`);
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, this.HEARTBEAT_FREQUENCY);

    console.log(`Started WebSocket heartbeat every ${this.HEARTBEAT_FREQUENCY / 1000} seconds`);
  }

  private async updateMarketData(): Promise<void> {
    try {
      const subscribedSymbols = Array.from(this.subscriptions.keys());
      
      if (subscribedSymbols.length === 0) {
        return;
      }

      console.log(`Updating market data for ${subscribedSymbols.length} symbols`);

      // Fetch fresh quotes (with rate limiting handled by the service)
      const quotes = await this.marketDataService.getBatchQuotes(subscribedSymbols);

      // Cache the fresh data
      await CacheService.cacheBatchQuotes(quotes, 900); // 15 minutes TTL

      // Send updates to subscribed clients
      for (const quote of quotes) {
        const subscribers = this.subscriptions.get(quote.symbol);
        if (subscribers && subscribers.size > 0) {
          this.broadcast({
            type: 'quote',
            data: { quotes: [quote], source: 'live' },
            timestamp: new Date()
          }, subscribers);
        }
      }

      // Update market status
      if (quotes.length > 0 && quotes[0]) {
        const marketStatus = quotes[0].marketStatus;
        await CacheService.cacheMarketStatus(marketStatus, 300); // 5 minutes TTL

        this.broadcast({
          type: 'market_status',
          data: { status: marketStatus },
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error updating market data:', error);
      
      // Send error to all connected clients
      this.broadcast({
        type: 'error',
        data: { message: 'Market data update failed' },
        timestamp: new Date()
      });
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Public methods for external use
  public getConnectedClients(): number {
    return this.clients.size;
  }

  public getSubscribedSymbols(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  public getSubscriptionCount(symbol: string): number {
    return this.subscriptions.get(symbol.toUpperCase())?.size || 0;
  }

  public async forceUpdate(symbols?: string[]): Promise<void> {
    const targetSymbols = symbols || Array.from(this.subscriptions.keys());
    
    if (targetSymbols.length > 0) {
      console.log(`Force updating market data for symbols:`, targetSymbols);
      
      try {
        const quotes = await this.marketDataService.getBatchQuotes(targetSymbols);
        await CacheService.cacheBatchQuotes(quotes, 900);

        for (const quote of quotes) {
          const subscribers = this.subscriptions.get(quote.symbol);
          if (subscribers && subscribers.size > 0) {
            this.broadcast({
              type: 'quote',
              data: { quotes: [quote], source: 'forced' },
              timestamp: new Date()
            }, subscribers);
          }
        }
      } catch (error) {
        console.error('Error in force update:', error);
      }
    }
  }

  public shutdown(): void {
    console.log('Shutting down WebSocket service...');
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    this.wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });

    this.wss.close();
    console.log('WebSocket service shut down complete');
  }
}

export default WebSocketService;