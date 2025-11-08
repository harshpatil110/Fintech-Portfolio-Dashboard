import React from 'react';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import {
  Dashboard as DashboardIcon,
  TrendingUp as PortfolioIcon,
  Visibility as WatchlistIcon,
  BarChart as AnalyticsIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

export const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getValueFromPath = (path: string): number => {
    switch (path) {
      case '/dashboard':
        return 0;
      case '/portfolio':
        return 1;
      case '/watchlist':
        return 2;
      case '/analytics':
        return 3;
      default:
        return 0;
    }
  };

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    const paths = ['/dashboard', '/portfolio', '/watchlist', '/analytics'];
    navigate(paths[newValue]);
  };

  return (
    <Paper
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: { xs: 'block', md: 'none' },
      }}
      elevation={3}
    >
      <BottomNavigation
        value={getValueFromPath(location.pathname)}
        onChange={handleChange}
        showLabels
        sx={{
          height: 64,
          '& .MuiBottomNavigationAction-root': {
            minWidth: 'auto',
            padding: '6px 12px 8px',
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.75rem',
            '&.Mui-selected': {
              fontSize: '0.75rem',
            },
          },
        }}
      >
        <BottomNavigationAction
          label="Dashboard"
          icon={<DashboardIcon />}
          sx={{
            '&.Mui-selected': {
              color: 'primary.main',
            },
          }}
        />
        <BottomNavigationAction
          label="Portfolio"
          icon={<PortfolioIcon />}
          sx={{
            '&.Mui-selected': {
              color: 'primary.main',
            },
          }}
        />
        <BottomNavigationAction
          label="Watchlist"
          icon={<WatchlistIcon />}
          sx={{
            '&.Mui-selected': {
              color: 'primary.main',
            },
          }}
        />
        <BottomNavigationAction
          label="Analytics"
          icon={<AnalyticsIcon />}
          sx={{
            '&.Mui-selected': {
              color: 'primary.main',
            },
          }}
        />
      </BottomNavigation>
    </Paper>
  );
};
