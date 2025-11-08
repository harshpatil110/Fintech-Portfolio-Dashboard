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
  Filler,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Box, Paper, Typography, useTheme } from '@mui/material';
import { PerformanceDataPoint } from '../../types/performance';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PortfolioChartProps {
  data: PerformanceDataPoint[];
  title?: string;
  height?: number;
  showArea?: boolean;
  color?: string;
}

export const PortfolioChart: React.FC<PortfolioChartProps> = ({
  data,
  title = 'Portfolio Performance',
  height = 300,
  showArea = true,
  color
}) => {
  const theme = useTheme();
  const primaryColor = color || theme.palette.primary.main;

  const chartData = useMemo(() => {
    const labels = data.map(point => {
      const date = new Date(point.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const values = data.map(point => point.value);

    return {
      labels,
      datasets: [
        {
          label: 'Portfolio Value',
          data: values,
          borderColor: primaryColor,
          backgroundColor: showArea
            ? `${primaryColor}20`
            : 'transparent',
          fill: showArea,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: primaryColor,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: 2
        }
      ]
    };
  }, [data, primaryColor, showArea]);

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
        padding: 12,
        displayColors: false,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';
            return `$${value.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}`;
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
          callback: (value) => {
            return `$${(value as number).toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            })}`;
          },
          color: theme.palette.text.secondary
        }
      }
    }
  }), [theme]);

  if (!data || data.length === 0) {
    return (
      <Paper sx={{ p: 3, height }}>
        <Typography variant="body2" color="text.secondary" align="center">
          No performance data available
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      {title && (
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
      )}
      <Box sx={{ height }}>
        <Line data={chartData} options={options} />
      </Box>
    </Paper>
  );
};
