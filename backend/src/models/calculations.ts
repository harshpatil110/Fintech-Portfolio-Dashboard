import { StockPosition, Portfolio, PortfolioSummary } from './Portfolio';
import { StockQuote } from './MarketData';

/**
 * Portfolio calculation utilities
 */
export class PortfolioCalculations {
  
  /**
   * Calculate current market value for a stock position
   */
  static calculateMarketValue(position: StockPosition, currentPrice: number): number {
    return this.roundToDecimal(position.quantity * currentPrice, 2);
  }

  /**
   * Calculate gain/loss for a stock position
   */
  static calculateGainLoss(position: StockPosition, currentPrice: number): {
    gainLoss: number;
    gainLossPercent: number;
  } {
    const marketValue = this.calculateMarketValue(position, currentPrice);
    const costBasis = this.roundToDecimal(position.quantity * position.averageCost, 2);
    const gainLoss = this.roundToDecimal(marketValue - costBasis, 2);
    const gainLossPercent = costBasis > 0 ? this.roundToDecimal((gainLoss / costBasis) * 100, 4) : 0;
    
    return { gainLoss, gainLossPercent };
  }

  /**
   * Update stock position with current market data
   */
  static updatePositionWithMarketData(position: StockPosition, quote: StockQuote): StockPosition {
    const { gainLoss, gainLossPercent } = this.calculateGainLoss(position, quote.currentPrice);
    const marketValue = this.calculateMarketValue(position, quote.currentPrice);
    
    return {
      ...position,
      currentPrice: quote.currentPrice,
      marketValue,
      gainLoss,
      gainLossPercent
    };
  }

  /**
   * Calculate portfolio totals
   */
  static calculatePortfolioTotals(positions: StockPosition[]): {
    totalValue: number;
    totalGainLoss: number;
    totalGainLossPercent: number;
    totalCostBasis: number;
  } {
    let totalValue = 0;
    let totalCostBasis = 0;
    
    positions.forEach(position => {
      if (position.marketValue !== undefined) {
        totalValue += position.marketValue;
      }
      totalCostBasis += position.quantity * position.averageCost;
    });
    
    const totalGainLoss = this.roundToDecimal(totalValue - totalCostBasis, 2);
    const totalGainLossPercent = totalCostBasis > 0 ? 
      this.roundToDecimal((totalGainLoss / totalCostBasis) * 100, 4) : 0;
    
    return {
      totalValue: this.roundToDecimal(totalValue, 2),
      totalGainLoss,
      totalGainLossPercent,
      totalCostBasis: this.roundToDecimal(totalCostBasis, 2)
    };
  }

  /**
   * Calculate position allocation percentages
   */
  static calculatePositionAllocations(positions: StockPosition[]): Array<StockPosition & { allocationPercent: number }> {
    const { totalValue } = this.calculatePortfolioTotals(positions);
    
    return positions.map(position => ({
      ...position,
      allocationPercent: totalValue > 0 && position.marketValue ? 
        this.roundToDecimal((position.marketValue / totalValue) * 100, 2) : 0
    }));
  }

  /**
   * Generate portfolio summary
   */
  static generatePortfolioSummary(positions: StockPosition[]): PortfolioSummary {
    const totals = this.calculatePortfolioTotals(positions);
    
    // Sort positions by gain/loss percentage
    const sortedByPerformance = [...positions].sort((a, b) => {
      const aPercent = a.gainLossPercent || 0;
      const bPercent = b.gainLossPercent || 0;
      return bPercent - aPercent;
    });
    
    return {
      totalValue: totals.totalValue,
      totalGainLoss: totals.totalGainLoss,
      totalGainLossPercent: totals.totalGainLossPercent,
      positionCount: positions.length,
      topPerformers: sortedByPerformance.slice(0, 3),
      worstPerformers: sortedByPerformance.slice(-3).reverse()
    };
  }

  /**
   * Calculate portfolio performance over time
   */
  static calculatePortfolioPerformance(
    historicalValues: Array<{ date: Date; value: number }>,
    timeRange: '1D' | '1W' | '1M' | '3M' | '1Y'
  ): {
    startValue: number;
    endValue: number;
    totalReturn: number;
    totalReturnPercent: number;
    annualizedReturn?: number;
  } {
    if (historicalValues.length < 2) {
      return {
        startValue: 0,
        endValue: 0,
        totalReturn: 0,
        totalReturnPercent: 0
      };
    }
    
    const sortedValues = historicalValues.sort((a, b) => a.date.getTime() - b.date.getTime());
    const startValue = sortedValues[0].value;
    const endValue = sortedValues[sortedValues.length - 1].value;
    const totalReturn = this.roundToDecimal(endValue - startValue, 2);
    const totalReturnPercent = startValue > 0 ? 
      this.roundToDecimal((totalReturn / startValue) * 100, 4) : 0;
    
    // Calculate annualized return for periods longer than 1 day
    let annualizedReturn: number | undefined;
    if (timeRange !== '1D' && sortedValues.length > 1) {
      const daysDiff = Math.abs(
        (sortedValues[sortedValues.length - 1].date.getTime() - sortedValues[0].date.getTime()) / 
        (1000 * 60 * 60 * 24)
      );
      
      if (daysDiff > 0 && startValue > 0) {
        const yearsElapsed = daysDiff / 365.25;
        annualizedReturn = this.roundToDecimal(
          (Math.pow(endValue / startValue, 1 / yearsElapsed) - 1) * 100, 
          4
        );
      }
    }
    
    return {
      startValue: this.roundToDecimal(startValue, 2),
      endValue: this.roundToDecimal(endValue, 2),
      totalReturn,
      totalReturnPercent,
      annualizedReturn
    };
  }

  /**
   * Calculate diversification metrics
   */
  static calculateDiversificationMetrics(positions: StockPosition[]): {
    concentrationRisk: number; // Percentage of portfolio in largest position
    numberOfPositions: number;
    averagePositionSize: number;
    largestPosition: StockPosition | null;
  } {
    if (positions.length === 0) {
      return {
        concentrationRisk: 0,
        numberOfPositions: 0,
        averagePositionSize: 0,
        largestPosition: null
      };
    }
    
    const positionsWithAllocations = this.calculatePositionAllocations(positions);
    const largestPosition = positionsWithAllocations.reduce((largest, current) => 
      current.allocationPercent > largest.allocationPercent ? current : largest
    );
    
    const { totalValue } = this.calculatePortfolioTotals(positions);
    const averagePositionSize = totalValue / positions.length;
    
    return {
      concentrationRisk: this.roundToDecimal(largestPosition.allocationPercent, 2),
      numberOfPositions: positions.length,
      averagePositionSize: this.roundToDecimal(averagePositionSize, 2),
      largestPosition
    };
  }

  /**
   * Round number to specified decimal places
   */
  private static roundToDecimal(value: number, decimals: number): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
}