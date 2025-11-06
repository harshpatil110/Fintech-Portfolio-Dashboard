import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Chip,
  useTheme
} from '@mui/material';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { StockPosition } from '../../types/portfolio';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

interface PortfolioAllocationChartProps {
  positions: StockPosition[];
  isLoading?: boolean;
}

export const PortfolioAllocationChart: React.FC<PortfolioAllocationChartProps> = ({
  positions,
  isLoading = false
}) => {
  const theme = useTheme();

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(1)}%`;
  };

  // Generate colors for the chart
  const generateColors = (count: number): string[] => {
    const colors = [
      theme.palette.primary.main,
      theme.palette.secondary.main,
      theme.palette.success.main,
      theme.palette.warning.main,
      theme.palette.error.main,
      theme.palette.info.main,
      '#9C27B0', // Purple
      '#FF5722', // Deep Orange
      '#795548', // Brown
      '#607D8B', // Blue Grey
    ];
    
    // If we need more colors, generate them
    while (colors.length < count) {
      const hue = (colors.length * 137.508) % 360; // Golden angle approximation
      colors.push(`hsl(${hue}, 70%, 50%)`);
    }
    
    return colors.slice(0, count);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Portfolio Allocation
          </Typography>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: 300
          }}>
            <Typography variant="body1" color="text.secondary">
              Loading allocation data...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Portfolio Allocation
          </Typography>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: 300,
            flexDirection: 'column'
          }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              No positions in portfolio
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Add some stocks to see your allocation
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Sort positions by market value (descending) and take top 10
  const sortedPositions = [...positions]
    .filter(pos => pos.marketValue && pos.marketValue > 0)
    .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
    .slice(0, 10);

  const colors = generateColors(sortedPositions.length);

  const chartData = {
    labels: sortedPositions.map(pos => pos.symbol),
    datasets: [
      {
        data: sortedPositions.map(pos => pos.marketValue || 0),
        backgroundColor: colors,
        borderColor: colors.map(color => color),
        borderWidth: 2,
        hoverBorderWidth: 3,
      },
    ],
  };

  const chartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false, // We'll create a custom legend
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const position = sortedPositions[context.dataIndex];
            const value = formatCurrency(position.marketValue || 0);
            const percentage = formatPercentage(position.allocationPercent || 0);
            return `${position.symbol}: ${value} (${percentage})`;
          },
        },
      },
    },
    cutout: '60%', // Creates the doughnut hole
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Portfolio Allocation
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 3 }}>
          {/* Chart */}
          <Box sx={{ width: 300, height: 300, position: 'relative' }}>
            <Doughnut data={chartData} options={chartOptions} />
            {/* Center text showing total positions */}
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}
            >
              <Typography variant="h4" sx={{ fontWeight: 'bold', lineHeight: 1 }}>
                {positions.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {positions.length === 1 ? 'Position' : 'Positions'}
              </Typography>
            </Box>
          </Box>

          {/* Legend */}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
              {sortedPositions.map((position, index) => (
                <ListItem key={position.id} sx={{ px: 0 }}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      backgroundColor: colors[index],
                      mr: 2,
                      flexShrink: 0
                    }}
                  />
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          {position.symbol}
                        </Typography>
                        <Chip
                          label={formatPercentage(position.allocationPercent || 0)}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.75rem', height: 20 }}
                        />
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {position.companyName}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ fontWeight: 'medium' }}>
                          {formatCurrency(position.marketValue || 0)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
            
            {positions.length > 10 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Showing top 10 positions by value
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};