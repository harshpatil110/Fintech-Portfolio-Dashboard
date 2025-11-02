import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { StockQuote, StockSearchResult, HistoricalData, PricePoint, MarketStatus } from '../models/MarketData';

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<StockQuote>;
  getBatchQuotes(symbols: string[]): Promise<StockQuote[]>;
  searchSymbols(query: string): Promise<StockSearchResult[]>;
  getHistoricalData(symbol: string, period?: string): Promise<HistoricalData>;
  validateSymbol(symbol: string): Promise<boolean>;
}

export class AlphaVantageProvider implements MarketDataProvider {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl = 'https://www.alphavantage.co/query';
  private rateLimitDelay = 12000; // 12 seconds between requests (5 requests per minute)
  private lastRequestTime = 0;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Alpha Vantage API key is required');
    }
    
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'Fintech-Portfolio-Dashboard/1.0'
      }
    });
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    await this.enforceRateLimit();
    
    try {
      const response = await this.client.get('', {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol.toUpperCase(),
          apikey: this.apiKey
        }
      });

      const data = response.data;
      
      if (data['Error Message']) {
        throw new Error(`Alpha Vantage API Error: ${data['Error Message']}`);
      }
      
      if (data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      const quote = data['Global Quote'];
      if (!quote || Object.keys(quote).length === 0) {
        throw new Error(`No data found for symbol: ${symbol}`);
      }

      return this.parseGlobalQuote(quote, symbol);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Market data API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  async getBatchQuotes(symbols: string[]): Promise<StockQuote[]> {
    // Alpha Vantage doesn't support batch requests, so we'll make individual requests
    // with rate limiting
    const quotes: StockQuote[] = [];
    
    for (const symbol of symbols) {
      try {
        const quote = await this.getQuote(symbol);
        quotes.push(quote);
      } catch (error) {
        console.error(`Failed to get quote for ${symbol}:`, error);
        // Continue with other symbols even if one fails
      }
    }
    
    return quotes;
  }

  async searchSymbols(query: string): Promise<StockSearchResult[]> {
    await this.enforceRateLimit();
    
    try {
      const response = await this.client.get('', {
        params: {
          function: 'SYMBOL_SEARCH',
          keywords: query,
          apikey: this.apiKey
        }
      });

      const data = response.data;
      
      if (data['Error Message']) {
        throw new Error(`Alpha Vantage API Error: ${data['Error Message']}`);
      }
      
      if (data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      const matches = data['bestMatches'] || [];
      return matches.slice(0, 10).map((match: any) => ({
        symbol: match['1. symbol'],
        companyName: match['2. name'],
        exchange: match['4. region'],
        type: match['3. type']
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Symbol search failed: ${error.message}`);
      }
      throw error;
    }
  }

  async getHistoricalData(symbol: string, period: string = 'daily'): Promise<HistoricalData> {
    await this.enforceRateLimit();
    
    try {
      const functionName = period === 'intraday' ? 'TIME_SERIES_INTRADAY' : 'TIME_SERIES_DAILY';
      const params: any = {
        function: functionName,
        symbol: symbol.toUpperCase(),
        apikey: this.apiKey
      };

      if (period === 'intraday') {
        params.interval = '5min';
      }

      const response = await this.client.get('', { params });
      const data = response.data;
      
      if (data['Error Message']) {
        throw new Error(`Alpha Vantage API Error: ${data['Error Message']}`);
      }
      
      if (data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      const timeSeriesKey = period === 'intraday' ? 'Time Series (5min)' : 'Time Series (Daily)';
      const timeSeries = data[timeSeriesKey];
      
      if (!timeSeries) {
        throw new Error(`No historical data found for symbol: ${symbol}`);
      }

      const pricePoints: PricePoint[] = Object.entries(timeSeries)
        .map(([dateStr, values]: [string, any]) => ({
          date: new Date(dateStr),
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseInt(values['5. volume'])
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      return {
        symbol: symbol.toUpperCase(),
        data: pricePoints
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Historical data request failed: ${error.message}`);
      }
      throw error;
    }
  }

  async validateSymbol(symbol: string): Promise<boolean> {
    try {
      await this.getQuote(symbol);
      return true;
    } catch (error) {
      return false;
    }
  }

  private parseGlobalQuote(quote: any, symbol: string): StockQuote {
    const currentPrice = parseFloat(quote['05. price']);
    const previousClose = parseFloat(quote['08. previous close']);
    const change = parseFloat(quote['09. change']);
    const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

    return {
      symbol: symbol.toUpperCase(),
      companyName: symbol.toUpperCase(), // Alpha Vantage doesn't provide company name in global quote
      currentPrice,
      previousClose,
      change,
      changePercent,
      volume: parseInt(quote['06. volume']),
      marketCap: 0, // Not provided by Alpha Vantage in global quote
      timestamp: new Date(),
      marketStatus: this.determineMarketStatus()
    };
  }

  private determineMarketStatus(): MarketStatus {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const hour = easternTime.getHours();
    const minute = easternTime.getMinutes();
    const dayOfWeek = easternTime.getDay();
    
    // Weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 'CLOSED';
    }
    
    // Market hours: 9:30 AM - 4:00 PM ET
    const marketOpenTime = 9 * 60 + 30; // 9:30 AM in minutes
    const marketCloseTime = 16 * 60; // 4:00 PM in minutes
    const currentTime = hour * 60 + minute;
    
    if (currentTime < marketOpenTime) {
      return currentTime >= 4 * 60 ? 'PRE_MARKET' : 'CLOSED'; // Pre-market starts at 4:00 AM
    } else if (currentTime >= marketOpenTime && currentTime < marketCloseTime) {
      return 'OPEN';
    } else if (currentTime >= marketCloseTime && currentTime < 20 * 60) {
      return 'AFTER_HOURS'; // After-hours until 8:00 PM
    } else {
      return 'CLOSED';
    }
  }
}

export class MarketDataService {
  private provider: MarketDataProvider;
  private fallbackProviders: MarketDataProvider[] = [];

  constructor(provider: MarketDataProvider) {
    this.provider = provider;
  }

  addFallbackProvider(provider: MarketDataProvider): void {
    this.fallbackProviders.push(provider);
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    return this.executeWithFallback(async (provider) => provider.getQuote(symbol));
  }

  async getBatchQuotes(symbols: string[]): Promise<StockQuote[]> {
    return this.executeWithFallback(async (provider) => provider.getBatchQuotes(symbols));
  }

  async searchSymbols(query: string): Promise<StockSearchResult[]> {
    return this.executeWithFallback(async (provider) => provider.searchSymbols(query));
  }

  async getHistoricalData(symbol: string, period?: string): Promise<HistoricalData> {
    return this.executeWithFallback(async (provider) => provider.getHistoricalData(symbol, period));
  }

  async validateSymbol(symbol: string): Promise<boolean> {
    try {
      return await this.executeWithFallback(async (provider) => provider.validateSymbol(symbol));
    } catch (error) {
      return false;
    }
  }

  private async executeWithFallback<T>(operation: (provider: MarketDataProvider) => Promise<T>): Promise<T> {
    const providers = [this.provider, ...this.fallbackProviders];
    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        return await operation(provider);
      } catch (error) {
        lastError = error as Error;
        console.warn(`Market data provider failed, trying fallback:`, error);
      }
    }

    throw lastError || new Error('All market data providers failed');
  }
}

// Factory function to create market data service based on configuration
export function createMarketDataService(): MarketDataService {
  const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
  
  if (!alphaVantageKey) {
    throw new Error('No market data provider API key configured. Please set ALPHA_VANTAGE_API_KEY in environment variables.');
  }

  const primaryProvider = new AlphaVantageProvider(alphaVantageKey);
  return new MarketDataService(primaryProvider);
}