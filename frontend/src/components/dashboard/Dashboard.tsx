import React from 'react';
import {
  Typography,
  Box,
  Alert,
  Container,
  Grid,
  Paper,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { usePortfolio } from '../../hooks/usePortfolio';
import { PortfolioSummaryCards } from './PortfolioSummaryCards';
import { PortfolioAllocationChart } from './PortfolioAllocationChart';
import { ErrorDisplay, SkeletonLoader } from '../common';

export const Dashboard: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { data: portfolioData, isLoading, error, refetch } = usePortfolio(user?.id || null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  if (!isAuthenticated || !user) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="warning">
          Please log in to view your portfolio dashboard.
        </Alert>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Portfolio Dashboard
          </Typography>
        </Box>
        <SkeletonLoader variant="dashboard" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Portfolio Dashboard
          </Typography>
        </Box>
        <ErrorDisplay
          error={error}
          title="Failed to load portfolio"
          onRetry={() => refetch()}
        />
      </Container>
    );
  }

  const { portfolio, summary, performance } = portfolioData?.data || {};

  return (
    <Container maxWidth="lg" sx={{ mt: isMobile ? 2 : isTablet ? 3 : 4, mb: isMobile ? 2 : isTablet ? 3 : 4 }}>
      {/* Header */}
      <Box sx={{ mb: isMobile ? 2 : isTablet ? 3 : 4 }}>
        <Typography
          variant={isMobile ? 'h5' : 'h4'}
          component="h1"
          gutterBottom
        >
          Portfolio Dashboard
        </Typography>
        <Typography
          variant={isMobile ? 'body2' : 'body1'}
          color="text.secondary"
        >
          Welcome back, {user.firstName}! Here's your portfolio overview.
        </Typography>
      </Box>

      {/* Portfolio Summary Cards */}
      {performance && (
        <Box sx={{ mb: isMobile ? 2 : isTablet ? 3 : 4 }}>
          <PortfolioSummaryCards
            performance={performance}
            isLoading={isLoading}
          />
        </Box>
      )}

      {/* Portfolio Content */}
      <Grid container spacing={isMobile ? 2 : 3}>
        {/* Portfolio Allocation Chart */}
        <Grid item xs={12} lg={8}>
          <PortfolioAllocationChart
            positions={portfolio?.positions || []}
            isLoading={isLoading}
          />
        </Grid>

        {/* Quick Stats */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: isMobile ? 2 : 3, height: 'fit-content' }}>
            <Typography variant={isMobile ? 'subtitle1' : 'h6'} gutterBottom>
              Quick Stats
            </Typography>

            {summary && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 1.5 : 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Total Positions:
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                    {summary.positionCount}
                  </Typography>
                </Box>

                {summary.topPerformers.length > 0 && (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: isMobile ? 1 : 2, mb: 1 }}>
                      Top Performer
                    </Typography>
                    <Box sx={{ pl: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {summary.topPerformers[0].symbol}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {summary.topPerformers[0].companyName}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="success.main"
                        sx={{ fontWeight: 'medium' }}
                      >
                        +{summary.topPerformers[0].gainLossPercent?.toFixed(2)}%
                      </Typography>
                    </Box>
                  </>
                )}

                {summary.worstPerformers.length > 0 && (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: isMobile ? 1 : 2, mb: 1 }}>
                      Needs Attention
                    </Typography>
                    <Box sx={{ pl: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {summary.worstPerformers[0].symbol}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {summary.worstPerformers[0].companyName}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="error.main"
                        sx={{ fontWeight: 'medium' }}
                      >
                        {summary.worstPerformers[0].gainLossPercent?.toFixed(2)}%
                      </Typography>
                    </Box>
                  </>
                )}

                {summary.positionCount === 0 && (
                  <Box sx={{ textAlign: 'center', py: isMobile ? 2 : 3 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Your portfolio is empty
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Add some stocks to get started
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};