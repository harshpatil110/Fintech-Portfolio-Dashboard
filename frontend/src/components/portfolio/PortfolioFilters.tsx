import React, { useState } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  Typography,
  Paper,
  Grid,
  Switch,
  FormControlLabel,
  Collapse,
  IconButton
} from '@mui/material';
import {
  FilterList as FilterIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { PortfolioFilters } from '../../types/portfolio';

interface PortfolioFiltersProps {
  filters: PortfolioFilters;
  onFiltersChange: (filters: PortfolioFilters) => void;
  onApplyFilters: () => void;
  availableSymbols?: string[];
}

export const PortfolioFiltersComponent: React.FC<PortfolioFiltersProps> = ({
  filters,
  onFiltersChange,
  onApplyFilters
}) => {
  const [expanded, setExpanded] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');

  const handleFilterChange = (key: keyof PortfolioFilters, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const handleAddSymbol = () => {
    if (symbolInput.trim() && !filters.symbols?.includes(symbolInput.trim().toUpperCase())) {
      const newSymbols = [...(filters.symbols || []), symbolInput.trim().toUpperCase()];
      handleFilterChange('symbols', newSymbols);
      setSymbolInput('');
    }
  };

  const handleRemoveSymbol = (symbol: string) => {
    const newSymbols = filters.symbols?.filter(s => s !== symbol) || [];
    handleFilterChange('symbols', newSymbols.length > 0 ? newSymbols : undefined);
  };

  const clearAllFilters = () => {
    onFiltersChange({
      sortBy: 'symbol',
      sortOrder: 'asc'
    });
    onApplyFilters();
  };

  const hasActiveFilters = () => {
    return !!(
      filters.symbols?.length ||
      filters.minValue ||
      filters.maxValue ||
      filters.gainersOnly ||
      filters.losersOnly ||
      (filters.sortBy && filters.sortBy !== 'symbol') ||
      (filters.sortOrder && filters.sortOrder !== 'asc')
    );
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: expanded ? 2 : 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterIcon />
          <Typography variant="h6">Filters & Sorting</Typography>
          {hasActiveFilters() && (
            <Chip
              label="Active"
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {hasActiveFilters() && (
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={clearAllFilters}
            >
              Clear All
            </Button>
          )}
          <IconButton onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Grid container spacing={2}>
          {/* Symbol Filter */}
          <Grid item xs={12} md={6}>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Filter by Symbols
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  size="small"
                  placeholder="Enter symbol (e.g., AAPL)"
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddSymbol()}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleAddSymbol}
                  disabled={!symbolInput.trim()}
                >
                  Add
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {filters.symbols?.map((symbol) => (
                  <Chip
                    key={symbol}
                    label={symbol}
                    size="small"
                    onDelete={() => handleRemoveSymbol(symbol)}
                    color="primary"
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>
          </Grid>

          {/* Value Range Filter */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" gutterBottom>
              Value Range
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                label="Min Value"
                type="number"
                value={filters.minValue || ''}
                onChange={(e) => handleFilterChange('minValue', e.target.value ? parseFloat(e.target.value) : undefined)}
                inputProps={{ min: 0, step: 100 }}
              />
              <TextField
                size="small"
                label="Max Value"
                type="number"
                value={filters.maxValue || ''}
                onChange={(e) => handleFilterChange('maxValue', e.target.value ? parseFloat(e.target.value) : undefined)}
                inputProps={{ min: 0, step: 100 }}
              />
            </Box>
          </Grid>

          {/* Performance Filter */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" gutterBottom>
              Performance Filter
            </Typography>
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={filters.gainersOnly || false}
                    onChange={(e) => {
                      handleFilterChange('gainersOnly', e.target.checked || undefined);
                      if (e.target.checked) {
                        handleFilterChange('losersOnly', undefined);
                      }
                    }}
                  />
                }
                label="Gainers Only"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={filters.losersOnly || false}
                    onChange={(e) => {
                      handleFilterChange('losersOnly', e.target.checked || undefined);
                      if (e.target.checked) {
                        handleFilterChange('gainersOnly', undefined);
                      }
                    }}
                  />
                }
                label="Losers Only"
              />
            </Box>
          </Grid>

          {/* Sorting */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" gutterBottom>
              Sorting
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={filters.sortBy || 'symbol'}
                  label="Sort By"
                  onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                >
                  <MenuItem value="symbol">Symbol</MenuItem>
                  <MenuItem value="value">Market Value</MenuItem>
                  <MenuItem value="gainLoss">Gain/Loss</MenuItem>
                  <MenuItem value="gainLossPercent">Gain/Loss %</MenuItem>
                  <MenuItem value="allocation">Allocation</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Order</InputLabel>
                <Select
                  value={filters.sortOrder || 'asc'}
                  label="Order"
                  onChange={(e) => handleFilterChange('sortOrder', e.target.value as 'asc' | 'desc')}
                >
                  <MenuItem value="asc">Ascending</MenuItem>
                  <MenuItem value="desc">Descending</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
          <Button
            variant="contained"
            onClick={onApplyFilters}
            startIcon={<FilterIcon />}
          >
            Apply Filters
          </Button>
        </Box>
      </Collapse>
    </Paper>
  );
};