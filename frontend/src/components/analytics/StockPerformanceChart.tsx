import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Box, Paper, Typography, useTheme, Chip } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { StockPerformanceHistory } from '../../types/performance';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface StockPerformanceChartProps {
  performanceData: StockPerformanceHistory;
  height?: number;
}

export const StockPerformanceChart: React.FC<StockPerformanceChartProps> = ({
  performanceData,
  height = 250
}) => {
  const theme = useTheme();
  const isPositive = performanceData.priceChangePercent >= 0;
  const chartColor = isPositive ? theme.palette.success.main : theme.palette.error.main;

  const chartData = useMemo(() => {
    const labels = performanceData.data.map(point => {
      const date = new Date(point.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const values = performanceData.data.map(point => point.value);

    return {
      labels,
      datasets: [
        {
          label: performanceData.symbol,
          data: values,
          borderColor: chartColor,
          backgroundColor: `${chartColor}10`,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: chartColor,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: 2
        }
      ]
    };
  }, [performanceData, chartColor]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
        titleColor: theme.palette.text.primary,
        bodyColor: theme.palette.text.primary,
        borderColor: theme.palette.divider,
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';
            return `$${value.toFixed(2)}`;
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
          autoSkipPadding: 15,
          color: theme.palette.text.secondary,
          font: {
            size: 11
          }
        }
      },
      y: {
        grid: {
          color: theme.palette.divider
        },
        ticks: {
          callback: (value) => `$${(value as number).toFixed(2)}`,
          color: theme.palette.text.secondary,
          font: {
            size: 11
          }
        }
      }
    }
  }), [theme]);

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {performanceData.symbol}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {performanceData.companyName}
          </Typography>
        </Box>
        <Chip
          icon={isPositive ? <TrendingUp /> : <TrendingDown />}
          label={`${isPositive ? '+' : ''}${performanceData.priceChangePercent.toFixed(2)}%`}
          color={isPositive ? 'success' : 'error'}
          size="small"
        />
      </Box>
      <Box sx={{ height }}>
        <Line data={chartData} options={options} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Start Price
          </Typography>
          <Typography variant="body2" fontWeight={500}>
            ${performanceData.startPrice.toFixed(2)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="caption" color="text.secondary">
            Current Price
          </Typography>
          <Typography variant="body2" fontWeight={500}>
            ${performanceData.endPrice.toFixed(2)}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};
