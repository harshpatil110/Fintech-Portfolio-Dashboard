import React from 'react';
import { Box, Paper, Typography, Divider } from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import { TrendingUp, TrendingDown, ShowChart } from '@mui/icons-material';
import { PerformanceMetrics as PerformanceMetricsType } from '../../types/performance';

interface PerformanceMetricsProps {
  metrics: PerformanceMetricsType;
}

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  color?: 'success' | 'error' | 'primary' | 'default';
  icon?: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, subtitle, color = 'default', icon }) => {
  const getColor = () => {
    switch (color) {
      case 'success':
        return 'success.main';
      case 'error':
        return 'error.main';
      case 'primary':
        return 'primary.main';
      default:
        return 'text.primary';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {icon}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Typography variant="h6" fontWeight={600} color={getColor()}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Box>
  );
};

export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({ metrics }) => {
  const totalReturnColor = metrics.totalReturn >= 0 ? 'success' : 'error';
  const annualizedReturnColor = metrics.annualizedReturn >= 0 ? 'success' : 'error';

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Performance Metrics
      </Typography>
      <Divider sx={{ mb: 3 }} />
      
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Total Return"
            value={`$${metrics.totalReturn.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}`}
            subtitle={`${metrics.totalReturnPercent >= 0 ? '+' : ''}${metrics.totalReturnPercent.toFixed(2)}%`}
            color={totalReturnColor}
            icon={metrics.totalReturn >= 0 ? <TrendingUp fontSize="small" /> : <TrendingDown fontSize="small" />}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Annualized Return"
            value={`${metrics.annualizedReturn >= 0 ? '+' : ''}${metrics.annualizedReturn.toFixed(2)}%`}
            color={annualizedReturnColor}
            icon={<ShowChart fontSize="small" />}
          />
        </Grid>

        {metrics.volatility !== undefined && (
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Volatility"
              value={`${metrics.volatility.toFixed(2)}%`}
              subtitle="Standard Deviation"
              color="primary"
            />
          </Grid>
        )}

        {metrics.sharpeRatio !== undefined && (
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Sharpe Ratio"
              value={metrics.sharpeRatio.toFixed(2)}
              subtitle="Risk-adjusted return"
              color="primary"
            />
          </Grid>
        )}

        {metrics.maxDrawdown !== undefined && (
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Max Drawdown"
              value={`${metrics.maxDrawdown.toFixed(2)}%`}
              subtitle="Largest peak-to-trough decline"
              color="error"
            />
          </Grid>
        )}

        {metrics.bestDay && (
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Best Day"
              value={`+${metrics.bestDay.return.toFixed(2)}%`}
              subtitle={new Date(metrics.bestDay.date).toLocaleDateString()}
              color="success"
            />
          </Grid>
        )}

        {metrics.worstDay && (
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Worst Day"
              value={`${metrics.worstDay.return.toFixed(2)}%`}
              subtitle={new Date(metrics.worstDay.date).toLocaleDateString()}
              color="error"
            />
          </Grid>
        )}
      </Grid>
    </Paper>
  );
};
