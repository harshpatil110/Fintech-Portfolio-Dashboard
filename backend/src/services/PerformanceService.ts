import { PortfolioRepository } from '../repositories/PortfolioRepository';
import { MarketDataService } from './MarketDataService';
import { StockPosition } from '../models/Portfolio';

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

export class PerformanceService {
  constructor(
    private portfolioRepository: PortfolioRepository,
    private marketDataService: MarketDataService
  ) {}

  /**
   * Get date range based on time range selection
   */
  private getDateRange(timeRange: TimeRange): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case '1D':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '1W':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '1M':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case '3M':
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case '1Y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      case 'ALL':
        startDate.setFullYear(endDate.getFullYear() - 10); // 10 years max
        break;
    }

    return { startDate, endDate };
  }

  /**
   * Calculate annualized return
   */
  private calculateAnnualizedReturn(totalReturnPercent: number, days: number): number {
    if (days === 0) return 0;
    const years = days / 365;
    return (Math.pow(1 + totalReturnPercent / 100, 1 / years) - 1) * 100;
  }

  /**
   * Calculate volatility (standard deviation of returns)
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / returns.length;
    
    return Math.sqrt(variance) * Math.sqrt(252); // Annualized
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(values: number[]): number {
    if (values.length < 2) return 0;
    
    let maxDrawdown = 0;
    let peak = values[0];
    
    for (const value of values) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = ((peak - value) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }

  /**
   * Generate mock historical data for portfolio
   * In production, this would query actual historical transaction and price data
   */
  private async generatePortfolioHistory(
    positions: StockPosition[],
    timeRange: TimeRange
  ): Promise<PerformanceDataPoint[]> {
    const { startDate, endDate } = this.getDateRange(timeRange);
    const dataPoints: PerformanceDataPoint[] = [];
    
    // Calculate current portfolio value
    const currentValue = positions.reduce((sum, pos) => {
      return sum + (pos.marketValue || pos.quantity * pos.averageCost);
    }, 0);
    
    // Calculate cost basis
    const costBasis = positions.reduce((sum, pos) => {
      return sum + (pos.quantity * pos.averageCost);
    }, 0);
    
    // Generate data points (simplified - in production would use actual historical data)
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const interval = Math.max(1, Math.floor(days / 50)); // Max 50 data points
    
    for (let i = 0; i <= days; i += interval) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      // Simulate portfolio growth from cost basis to current value
      const progress = i / days;
      const value = costBasis + (currentValue - costBasis) * progress;
      
      // Add some realistic variation
      const variation = Math.sin(i / 5) * (currentValue * 0.02);
      
      dataPoints.push({
        date: date.toISOString(),
        value: Math.max(0, value + variation),
        timestamp: date.getTime()
      });
    }
    
    return dataPoints;
  }

  /**
   * Get portfolio performance history
   */
  async getPortfolioPerformance(
    userId: string,
    timeRange: TimeRange
  ): Promise<PortfolioPerformanceHistory> {
    const portfolios = await this.portfolioRepository.findByUserId(userId);
    
    if (portfolios.length === 0 || !portfolios[0].positions || portfolios[0].positions.length === 0) {
      return {
        timeRange,
        data: [],
        startValue: 0,
        endValue: 0,
        totalReturn: 0,
        totalReturnPercent: 0,
        annualizedReturn: 0
      };
    }
    
    const portfolio = portfolios[0];
    const data = await this.generatePortfolioHistory(portfolio.positions!, timeRange);
    
    const startValue = data.length > 0 ? data[0].value : 0;
    const endValue = data.length > 0 ? data[data.length - 1].value : 0;
    const totalReturn = endValue - startValue;
    const totalReturnPercent = startValue > 0 ? (totalReturn / startValue) * 100 : 0;
    
    const { startDate, endDate } = this.getDateRange(timeRange);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const annualizedReturn = this.calculateAnnualizedReturn(totalReturnPercent, days);
    
    return {
      timeRange,
      data,
      startValue,
      endValue,
      totalReturn,
      totalReturnPercent,
      annualizedReturn
    };
  }

  /**
   * Get stock performance history
   */
  async getStockPerformance(
    symbol: string,
    timeRange: TimeRange
  ): Promise<StockPerformanceHistory> {
    try {
      // Get current quote
      const quote = await this.marketDataService.getQuote(symbol);
      
      // Generate historical data (simplified)
      const { startDate, endDate } = this.getDateRange(timeRange);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const interval = Math.max(1, Math.floor(days / 50));
      
      const data: PerformanceDataPoint[] = [];
      const currentPrice = quote.currentPrice;
      const priceChange = quote.change;
      const startPrice = currentPrice - priceChange;
      
      for (let i = 0; i <= days; i += interval) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        
        const progress = i / days;
        const price = startPrice + (currentPrice - startPrice) * progress;
        const variation = Math.sin(i / 3) * (currentPrice * 0.01);
        
        data.push({
          date: date.toISOString(),
          value: Math.max(0, price + variation),
          timestamp: date.getTime()
        });
      }
      
      return {
        symbol: quote.symbol,
        companyName: quote.companyName,
        timeRange,
        data,
        startPrice,
        endPrice: currentPrice,
        priceChange,
        priceChangePercent: quote.changePercent
      };
    } catch (error) {
      console.error(`Failed to get stock performance for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get portfolio vs market comparison
   */
  async getPerformanceComparison(
    userId: string,
    timeRange: TimeRange,
    indexSymbol: string = 'SPY'
  ): Promise<PerformanceComparison> {
    const portfolioPerf = await this.getPortfolioPerformance(userId, timeRange);
    
    // Get market index performance
    const indexPerf = await this.getStockPerformance(indexSymbol, timeRange);
    
    // Normalize both to same length
    const portfolioData = portfolioPerf.data;
    const marketData = indexPerf.data.map(point => ({
      date: point.date,
      value: point.value,
      timestamp: point.timestamp
    }));
    
    const portfolioReturn = portfolioPerf.totalReturnPercent;
    const marketReturn = indexPerf.priceChangePercent;
    const outperformance = portfolioReturn - marketReturn;
    
    return {
      portfolio: portfolioData,
      marketIndex: marketData,
      portfolioReturn,
      marketReturn,
      outperformance
    };
  }

  /**
   * Get detailed performance metrics
   */
  async getPerformanceMetrics(
    userId: string,
    timeRange: TimeRange
  ): Promise<PerformanceMetrics> {
    const portfolioPerf = await this.getPortfolioPerformance(userId, timeRange);
    
    if (portfolioPerf.data.length < 2) {
      return {
        totalReturn: 0,
        totalReturnPercent: 0,
        annualizedReturn: 0
      };
    }
    
    // Calculate daily returns
    const dailyReturns: number[] = [];
    for (let i = 1; i < portfolioPerf.data.length; i++) {
      const prevValue = portfolioPerf.data[i - 1].value;
      const currValue = portfolioPerf.data[i].value;
      if (prevValue > 0) {
        dailyReturns.push(((currValue - prevValue) / prevValue) * 100);
      }
    }
    
    // Calculate volatility
    const volatility = this.calculateVolatility(dailyReturns);
    
    // Calculate Sharpe ratio (assuming 2% risk-free rate)
    const riskFreeRate = 2;
    const excessReturn = (portfolioPerf.annualizedReturn || 0) - riskFreeRate;
    const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0;
    
    // Calculate max drawdown
    const values = portfolioPerf.data.map(d => d.value);
    const maxDrawdown = this.calculateMaxDrawdown(values);
    
    // Find best and worst days
    let bestDay = { date: '', return: -Infinity };
    let worstDay = { date: '', return: Infinity };
    
    dailyReturns.forEach((ret, index) => {
      if (ret > bestDay.return) {
        bestDay = {
          date: portfolioPerf.data[index + 1].date,
          return: ret
        };
      }
      if (ret < worstDay.return) {
        worstDay = {
          date: portfolioPerf.data[index + 1].date,
          return: ret
        };
      }
    });
    
    return {
      totalReturn: portfolioPerf.totalReturn,
      totalReturnPercent: portfolioPerf.totalReturnPercent,
      annualizedReturn: portfolioPerf.annualizedReturn || 0,
      volatility,
      sharpeRatio,
      maxDrawdown,
      bestDay: bestDay.return !== -Infinity ? bestDay : undefined,
      worstDay: worstDay.return !== Infinity ? worstDay : undefined
    };
  }
}
