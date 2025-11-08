import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Box, Paper, Typography, useTheme } from '@mui/material';
import { PerformanceComparison } from '../../types/performance';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface ComparisonChartProps {
  comparisonData: PerformanceComparison;
  height?: number;
}

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  comparisonData,
  height = 300
}) => {
  const theme = useTheme();

  const chartData = useMemo(() => {
    // Normalize data to percentage change from start
    const normalizeData = (data: { date: string; value: number }[]) => {
      if (data.length === 0) return [];
      const startValue = data[0].value;
      return data.map(point => ((point.value - startValue) / startValue) * 100);
    };

    const portfolioNormalized = normalizeData(comparisonData.portfolio);
    const marketNormalized = normalizeData(comparisonData.marketIndex);

    const labels = comparisonData.portfolio.map(point => {
      const date = new Date(point.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      labels,
      datasets: [
        {
          label: 'Your Portfolio',
          data: portfolioNormalized,
          borderColor: theme.palette.primary.main,
          backgroundColor: 'transparent',
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: theme.palette.primary.main,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: 2
        },
        {
          label: 'Market Index (S&P 500)',
          data: marketNormalized,
          borderColor: theme.palette.grey[500],
          backgroundColor: 'transparent',
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: theme.palette.grey[500],
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: 2,
          borderDash: [5, 5]
        }
      ]
    };
  }, [comparisonData, theme]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 15,
          color: theme.palette.text.primary
        }
      },
      tooltip: {
        backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
        titleColor: theme.palette.text.primary,
        bodyColor: theme.palette.text.primary,
        borderColor: theme.palette.divider,
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';
            return `${context.dataset.label}: ${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          maxRotation: 0,
          autoSkipPadding: 20,
          color: theme.palette.text.secondary
        }
      },
      y: {
        grid: {
          color: theme.palette.divider
        },
        ticks: {
          callback: (value) => `${value}%`,
          color: theme.palette.text.secondary
        }
      }
    }
  }), [theme]);

  const outperformance = comparisonData.outperformance;
  const isOutperforming = outperformance > 0;

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Portfolio vs Market
        </Typography>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="caption" color="text.secondary">
            Outperformance
          </Typography>
          <Typography
            variant="body1"
            fontWeight={600}
            color={isOutperforming ? 'success.main' : 'error.main'}
          >
            {isOutperforming ? '+' : ''}{outperformance.toFixed(2)}%
          </Typography>
        </Box>
      </Box>
      <Box sx={{ height }}>
        <Line data={chartData} options={options} />
      </Box>
    </Paper>
  );
};
