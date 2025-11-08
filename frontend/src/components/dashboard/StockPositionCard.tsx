import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Fade,
  useTheme
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  MoreVert
} from '@mui/icons-material';
import { StockPosition } from '../../types/portfolio';
import { StockQuote } from '../../hooks/useWebSocket';

interface StockPositionCardProps {
  position: StockPosition;
  quote?: StockQuote;
  isLoading?: boolean;
  onClick?: () => void;
  onMenuClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const StockPositionCard: React.FC<StockPositionCardProps> = ({
  position,
  quote,
  onClick,
  onMenuClick
}) => {
  const theme = useTheme();
  const [priceAnimation, setPriceAnimation] = useState<'up' | 'down' | null>(null);
  const [previousPrice, setPreviousPrice] = useState<number | null>(null);

  // Handle price change animations
  useEffect(() => {
    if (quote && previousPrice !== null && quote.currentPrice !== previousPrice) {
      const direction = quote.currentPrice > previousPrice ? 'up' : 'down';
      setPriceAnimation(direction);
      
      const timer = setTimeout(() => {
        setPriceAnimation(null);
      }, 1000);

      return () => clearTimeout(timer);
    }
    
    if (quote) {
      setPreviousPrice(quote.currentPrice);
    }
  }, [quote?.currentPrice, previousPrice]);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Use real-time quote data if available, otherwise fall back to position data
  const currentPrice = quote?.currentPrice ?? position.currentPrice ?? 0;
  const change = quote?.change ?? (currentPrice - (position.averageCost || 0));
  const changePercent = quote?.changePercent ?? 0;
  
  // Calculate position-specific metrics
  const marketValue = currentPrice * position.quantity;
  const costBasis = position.averageCost * position.quantity;
  const positionGainLoss = marketValue - costBasis;
  const positionGainLossPercent = costBasis > 0 ? (positionGainLoss / costBasis) * 100 : 0;

  const getGainLossColor = (value: number) => {
    if (value > 0) return theme.palette.success.main;
    if (value < 0) return theme.palette.error.main;
    return theme.palette.text.secondary;
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp fontSize="small" />;
    if (value < 0) return <TrendingDown fontSize="small" />;
    return <TrendingFlat fontSize="small" />;
  };

  const getPriceAnimationStyle = () => {
    if (!priceAnimation) return {};
    
    return {
      backgroundColor: priceAnimation === 'up' 
        ? theme.palette.success.light 
        : theme.palette.error.light,
      transition: 'background-color 0.3s ease-in-out',
    };
  };

  const isMarketOpen = quote?.marketStatus === 'OPEN';
  const isAfterHours = quote?.marketStatus === 'AFTER_HOURS' || quote?.marketStatus === 'PRE_MARKET';

  return (
    <Card 
      sx={{ 
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease-in-out',
        '&:hover': onClick ? {
          transform: 'translateY(-2px)',
          boxShadow: 4
        } : {},
        ...getPriceAnimationStyle()
      }}
      onClick={onClick}
    >
      <CardContent sx={{ pb: 2 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                {position.symbol}
              </Typography>
              {quote && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: isMarketOpen 
                        ? theme.palette.success.main 
                        : isAfterHours 
                        ? theme.palette.warning.main 
                        : theme.palette.grey[400]
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {isMarketOpen ? 'Live' : isAfterHours ? 'AH' : 'Closed'}
                  </Typography>
                </Box>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary" noWrap>
              {position.companyName}
            </Typography>
          </Box>
          
          {onMenuClick && (
            <IconButton size="small" onClick={onMenuClick}>
              <MoreVert />
            </IconButton>
          )}
        </Box>

        {/* Current Price */}
        <Box sx={{ mb: 2 }}>
          <Fade in={true} key={currentPrice}>
            <Typography 
              variant="h5" 
              sx={{ 
                fontWeight: 'bold',
                color: priceAnimation === 'up' 
                  ? theme.palette.success.main 
                  : priceAnimation === 'down' 
                  ? theme.palette.error.main 
                  : 'text.primary'
              }}
            >
              {formatCurrency(currentPrice)}
            </Typography>
          </Fade>
          
          {quote && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', color: getGainLossColor(change) }}>
                {getTrendIcon(change)}
                <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'medium' }}>
                  {formatCurrency(Math.abs(change))}
                </Typography>
              </Box>
              <Chip
                label={formatPercentage(changePercent)}
                size="small"
                color={changePercent > 0 ? 'success' : changePercent < 0 ? 'error' : 'default'}
                variant="outlined"
                sx={{ fontSize: '0.75rem', height: 20 }}
              />
            </Box>
          )}
        </Box>

        {/* Position Details */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Shares:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
              {position.quantity.toLocaleString()}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Avg Cost:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
              {formatCurrency(position.averageCost)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Market Value:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
              {formatCurrency(marketValue)}
            </Typography>
          </Box>

          {/* Position Gain/Loss */}
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              pt: 1,
              borderTop: `1px solid ${theme.palette.divider}`
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Total Gain/Loss:
            </Typography>
            <Box sx={{ textAlign: 'right' }}>
              <Typography 
                variant="body2" 
                sx={{ 
                  fontWeight: 'bold',
                  color: getGainLossColor(positionGainLoss)
                }}
              >
                {formatCurrency(positionGainLoss)}
              </Typography>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: getGainLossColor(positionGainLoss),
                  display: 'block'
                }}
              >
                {formatPercentage(positionGainLossPercent)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Last Updated */}
        {quote && (
          <Box sx={{ mt: 2, pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="caption" color="text.secondary">
              Updated: {new Date(quote.timestamp).toLocaleTimeString()}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};