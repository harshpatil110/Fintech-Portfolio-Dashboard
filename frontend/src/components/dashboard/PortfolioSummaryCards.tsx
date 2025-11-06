import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  AccountBalance,
  Assessment
} from '@mui/icons-material';
import { PortfolioPerformance } from '../../types/portfolio';

interface PortfolioSummaryCardsProps {
  performance: PortfolioPerformance;
  isLoading?: boolean;
}

export const PortfolioSummaryCards: React.FC<PortfolioSummaryCardsProps> = ({
  performance,
  isLoading = false
}) => {
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

  const getGainLossColor = (value: number): 'success' | 'error' | 'default' => {
    if (value > 0) return 'success';
    if (value < 0) return 'error';
    return 'default';
  };

  const cards = [
    {
      title: 'Total Portfolio Value',
      value: formatCurrency(performance.totalValue),
      icon: <AccountBalance />,
      color: 'primary' as const,
      subtitle: `${performance.positionCount} positions`
    },
    {
      title: 'Total Cost Basis',
      value: formatCurrency(performance.totalCostBasis),
      icon: <Assessment />,
      color: 'info' as const,
      subtitle: 'Amount invested'
    },
    {
      title: 'Total Gain/Loss',
      value: formatCurrency(performance.totalGainLoss),
      icon: performance.totalGainLoss >= 0 ? <TrendingUp /> : <TrendingDown />,
      color: getGainLossColor(performance.totalGainLoss),
      subtitle: formatPercentage(performance.totalGainLossPercent),
      isGainLoss: true
    }
  ];

  if (isLoading) {
    return (
      <Grid container spacing={3}>
        {[1, 2, 3].map((index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ 
                    width: 40, 
                    height: 40, 
                    bgcolor: 'grey.200', 
                    borderRadius: 1,
                    mr: 2
                  }} />
                  <Typography variant="h6" color="text.secondary">
                    Loading...
                  </Typography>
                </Box>
                <Typography variant="h4" sx={{ mb: 1 }}>
                  --
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  --
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Grid container spacing={3}>
      {cards.map((card, index) => (
        <Grid item xs={12} sm={6} md={4} key={index}>
          <Card 
            sx={{ 
              height: '100%',
              transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: 4
              }
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: `${card.color}.light`,
                    color: `${card.color}.main`,
                    mr: 2
                  }}
                >
                  {card.icon}
                </Box>
                <Typography variant="h6" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {card.title}
                </Typography>
              </Box>
              
              <Typography 
                variant="h4" 
                sx={{ 
                  mb: 1,
                  fontWeight: 'bold',
                  color: card.isGainLoss ? `${card.color}.main` : 'text.primary'
                }}
              >
                {card.value}
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  {card.subtitle}
                </Typography>
                {card.isGainLoss && (
                  <Chip
                    label={formatPercentage(performance.totalGainLossPercent)}
                    color={card.color}
                    size="small"
                    variant="outlined"
                  />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};