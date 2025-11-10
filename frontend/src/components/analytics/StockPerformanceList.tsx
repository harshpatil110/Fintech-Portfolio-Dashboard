import React, { useState, useEffect } from 'react';
import { Grid, CircularProgress, Alert, Box, Typography } from '@mui/material';
import { useAuth } from '../../hooks/useAuthHook';
import { usePortfolio } from '../../hooks/usePortfolio';
import { TimeRange, StockPerformanceHistory } from '../../types/performance';
import { performanceService } from '../../services/performanceService';
import { StockPerformanceChart } from './StockPerformanceChart';

interface StockPerformanceListProps {
  timeRange: TimeRange;
}

export const StockPerformanceList: React.FC<StockPerformanceListProps> = ({ timeRange }) => {
  const { user } = useAuth();
  const portfolioQuery = usePortfolio(user?.id || null);
  const [stockPerformances, setStockPerformances] = useState<StockPerformanceHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const portfolio = portfolioQuery.data?.data?.portfolio;
  const positions = portfolio?.positions || [];

  useEffect(() => {
    if (positions.length > 0) {
      loadStockPerformances();
    }
  }, [positions.length, timeRange]);

  const loadStockPerformances = async () => {
    if (positions.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const symbols = positions.map((pos) => pos.symbol);
      const performances = await Promise.all(
        symbols.map((symbol) => performanceService.getStockPerformance(symbol, timeRange))
      );
      setStockPerformances(performances);
    } catch (err) {
      console.error('Failed to load stock performances:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stock performances');
    } finally {
      setLoading(false);
    }
  };

  if (portfolioQuery.isLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (positions.length === 0) {
    return (
      <Alert severity="info">
        Add stocks to your portfolio to view individual performance charts
      </Alert>
    );
  }

  if (stockPerformances.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No performance data available
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={3}>
      {stockPerformances.map((performance) => (
        <Grid item xs={12} md={6} key={performance.symbol}>
          <StockPerformanceChart performanceData={performance} />
        </Grid>
      ))}
    </Grid>
  );
};
