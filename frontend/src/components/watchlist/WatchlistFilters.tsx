import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Paper,
  Typography
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { WatchlistFilters as WatchlistFiltersType } from '../../types/watchlist';

interface WatchlistFiltersProps {
  filters: WatchlistFiltersType;
  onFiltersChange: (filters: WatchlistFiltersType) => void;
}

export const WatchlistFilters: React.FC<WatchlistFiltersProps> = ({
  filters,
  onFiltersChange
}) => {
  const handleQuickFilterChange = (
    _event: React.MouseEvent<HTMLElement>,
    newFilters: string[]
  ) => {
    onFiltersChange({
      ...filters,
      alertsOnly: newFilters.includes('alerts'),
      gainersOnly: newFilters.includes('gainers'),
      losersOnly: newFilters.includes('losers')
    });
  };

  const getActiveQuickFilters = () => {
    const active: string[] = [];
    if (filters.alertsOnly) active.push('alerts');
    if (filters.gainersOnly) active.push('gainers');
    if (filters.losersOnly) active.push('losers');
    return active;
  };

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle2" gutterBottom>
        Filters & Sorting
      </Typography>

      <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} gap={2} mt={2}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Sort By</InputLabel>
          <Select
            value={filters.sortBy || 'addedAt'}
            label="Sort By"
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                sortBy: e.target.value as WatchlistFiltersType['sortBy']
              })
            }
          >
            <MenuItem value="addedAt">Date Added</MenuItem>
            <MenuItem value="symbol">Symbol</MenuItem>
            <MenuItem value="companyName">Company Name</MenuItem>
            <MenuItem value="currentPrice">Price</MenuItem>
            <MenuItem value="changePercent">Change %</MenuItem>
            <MenuItem value="alertPrice">Alert Price</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Order</InputLabel>
          <Select
            value={filters.sortOrder || 'desc'}
            label="Order"
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                sortOrder: e.target.value as 'asc' | 'desc'
              })
            }
          >
            <MenuItem value="asc">Ascending</MenuItem>
            <MenuItem value="desc">Descending</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="Search"
          placeholder="Search symbol or name"
          value={filters.filterValue || ''}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              filterBy: e.target.value ? 'symbol' : undefined,
              filterValue: e.target.value || undefined
            })
          }
          sx={{ flex: 1, minWidth: 200 }}
        />
      </Box>

      <Box mt={2}>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          Quick Filters
        </Typography>
        <ToggleButtonGroup
          value={getActiveQuickFilters()}
          onChange={handleQuickFilterChange}
          size="small"
          sx={{ mt: 0.5 }}
        >
          <ToggleButton value="alerts">
            <NotificationsActiveIcon sx={{ mr: 0.5, fontSize: 18 }} />
            Alerts
          </ToggleButton>
          <ToggleButton value="gainers">
            <TrendingUpIcon sx={{ mr: 0.5, fontSize: 18 }} />
            Gainers
          </ToggleButton>
          <ToggleButton value="losers">
            <TrendingDownIcon sx={{ mr: 0.5, fontSize: 18 }} />
            Losers
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Paper>
  );
};
