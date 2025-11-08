import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Grid,
  CircularProgress,
  Alert,
  Paper,
  Tabs,
  Tab
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { TimeRange, PortfolioPerformanceHistory, PerformanceComparison, PerformanceMetrics as PerformanceMetricsType } from '../../types/performance';
import { performanceService } from '../../services/performanceService';
import { TimeRangeSelector } from './TimeRangeSelector';
import { PortfolioChart } from './PortfolioChart';
import { ComparisonChart } from './ComparisonChart';
import { PerformanceMetrics } from './PerformanceMetrics';
import { StockPerformanceList } from './StockPerformanceList';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
};

export const Analytics: React.FC = () => {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>('1M');
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [portfolioPerformance, setPortfolioPerformance] = useState<PortfolioPerformanceHistory | null>(null);
  const [comparison, setComparison] = useState<PerformanceComparison | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetricsType | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadPerformanceData();
    }
  }, [user?.id, timeRange]);

  const loadPerformanceData = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError(null);

    try {
      const [perfData, compData, metricsData] = await Promise.all([
        performanceService.getPortfolioPerformance(user.id, timeRange),
        performanceService.getPerformanceComparison(user.id, timeRange),
        performanceService.getPerformanceMetrics(user.id, timeRange)
      ]);

      setPortfolioPerformance(perfData);
      setComparison(compData);
      setMetrics(metricsData);
    } catch (err) {
      console.error('Failed to load performance data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  if (!user) {
    return (
      <Box>
        <Alert severity="warning">Please log in to view analytics</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Analytics & Performance
      </Typography>

      <TimeRangeSelector
        value={timeRange}
        onChange={setTimeRange}
        disabled={loading}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Paper sx={{ mb: 3 }}>
            <Tabs value={tabValue} onChange={handleTabChange} aria-label="analytics tabs">
              <Tab label="Overview" />
              <Tab label="Comparison" />
              <Tab label="Individual Stocks" />
            </Tabs>
          </Paper>

          <TabPanel value={tabValue} index={0}>
            <Grid container spacing={3}>
              {metrics && (
                <Grid item xs={12}>
                  <PerformanceMetrics metrics={metrics} />
                </Grid>
              )}
              {portfolioPerformance && (
                <Grid item xs={12}>
                  <PortfolioChart
                    data={portfolioPerformance.data}
                    title="Portfolio Value Over Time"
                    height={400}
                  />
                </Grid>
              )}
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            {comparison && (
              <ComparisonChart comparisonData={comparison} height={400} />
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <StockPerformanceList timeRange={timeRange} />
          </TabPanel>
        </>
      )}
    </Box>
  );
};