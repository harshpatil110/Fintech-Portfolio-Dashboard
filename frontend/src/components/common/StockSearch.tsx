import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TextField,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Typography,
  Box,
  Chip,
  InputAdornment,
  Alert
} from '@mui/material';
import {
  Search as SearchIcon,
  TrendingUp as TrendingUpIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { StockSearchResult, StockSearchProps, StockSearchState } from '../../types/market';
import { marketService } from '../../services/marketService';
import { useDebounce } from '../../hooks/useDebounce';

const StockSearch: React.FC<StockSearchProps> = ({
  onStockSelect,
  placeholder = "Search stocks (e.g., AAPL, Apple Inc.)",
  disabled = false,
  autoFocus = false,
  className = '',
  showValidation = false,
  maxResults = 10
}) => {
  const [state, setState] = useState<StockSearchState>({
    query: '',
    results: [],
    isLoading: false,
    error: null,
    isOpen: false,
    selectedIndex: -1,
    validationStatus: 'idle'
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Debounce the search query to prevent excessive API calls
  const debouncedQuery = useDebounce(state.query, 300);

  // Handle search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim().length >= 1) {
      performSearch(debouncedQuery.trim());
    } else {
      setState(prev => ({
        ...prev,
        results: [],
        isOpen: false,
        error: null,
        validationStatus: 'idle'
      }));
    }
  }, [debouncedQuery]);

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setState(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async (query: string) => {
    setState(prev => ({ 
      ...prev, 
      isLoading: true, 
      error: null,
      validationStatus: showValidation ? 'validating' : 'idle'
    }));

    try {
      const results = await marketService.searchStocks(query);
      const limitedResults = results.slice(0, maxResults);

      // If showing validation and we have results, validate the first exact match
      let validationStatus: StockSearchState['validationStatus'] = 'idle';
      if (showValidation) {
        const exactMatch = limitedResults.find(
          result => result.symbol.toLowerCase() === query.toLowerCase()
        );
        
        if (exactMatch) {
          const isValid = await marketService.validateSymbol(exactMatch.symbol);
          validationStatus = isValid ? 'valid' : 'invalid';
        } else if (limitedResults.length === 0) {
          validationStatus = 'invalid';
        } else {
          validationStatus = 'idle';
        }
      }

      setState(prev => ({
        ...prev,
        results: limitedResults,
        isLoading: false,
        isOpen: limitedResults.length > 0,
        selectedIndex: -1,
        validationStatus
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Search failed';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        results: [],
        isOpen: false,
        validationStatus: showValidation ? 'invalid' : 'idle'
      }));
    }
  }, [maxResults, showValidation]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setState(prev => ({
      ...prev,
      query: value,
      selectedIndex: -1
    }));
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!state.isOpen || state.results.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex: prev.selectedIndex < prev.results.length - 1 
            ? prev.selectedIndex + 1 
            : 0
        }));
        break;

      case 'ArrowUp':
        event.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex: prev.selectedIndex > 0 
            ? prev.selectedIndex - 1 
            : prev.results.length - 1
        }));
        break;

      case 'Enter':
        event.preventDefault();
        if (state.selectedIndex >= 0 && state.selectedIndex < state.results.length) {
          handleStockSelect(state.results[state.selectedIndex]);
        }
        break;

      case 'Escape':
        setState(prev => ({ ...prev, isOpen: false, selectedIndex: -1 }));
        inputRef.current?.blur();
        break;
    }
  };

  const handleStockSelect = (stock: StockSearchResult) => {
    setState(prev => ({
      ...prev,
      query: `${stock.symbol} - ${stock.companyName}`,
      isOpen: false,
      selectedIndex: -1,
      validationStatus: 'valid'
    }));
    onStockSelect(stock);
  };

  const handleInputFocus = () => {
    if (state.results.length > 0) {
      setState(prev => ({ ...prev, isOpen: true }));
    }
  };

  const getValidationIcon = () => {
    switch (state.validationStatus) {
      case 'validating':
        return <CircularProgress size={20} />;
      case 'valid':
        return <CheckCircleIcon color="success" />;
      case 'invalid':
        return <ErrorIcon color="error" />;
      default:
        return null;
    }
  };

  const getValidationColor = (): 'error' | 'success' | undefined => {
    switch (state.validationStatus) {
      case 'invalid':
        return 'error';
      case 'valid':
        return 'success';
      default:
        return undefined;
    }
  };

  return (
    <Box ref={containerRef} className={className} sx={{ position: 'relative', width: '100%' }}>
      <TextField
        ref={inputRef}
        fullWidth
        value={state.query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleInputFocus}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        color={getValidationColor()}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              {state.isLoading ? (
                <CircularProgress size={20} />
              ) : (
                <SearchIcon color="action" />
              )}
            </InputAdornment>
          ),
          endAdornment: showValidation && getValidationIcon() ? (
            <InputAdornment position="end">
              {getValidationIcon()}
            </InputAdornment>
          ) : undefined,
        }}
        helperText={
          state.error ? state.error : 
          showValidation && state.validationStatus === 'invalid' ? 'Invalid stock symbol' :
          showValidation && state.validationStatus === 'valid' ? 'Valid stock symbol' :
          undefined
        }
        error={!!state.error || state.validationStatus === 'invalid'}
      />

      {state.isOpen && state.results.length > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1300,
            maxHeight: 400,
            overflow: 'auto',
            mt: 1
          }}
        >
          <List ref={listRef} dense>
            {state.results.map((stock, index) => (
              <ListItem
                key={`${stock.symbol}-${stock.exchange}`}
                button
                selected={index === state.selectedIndex}
                onClick={() => handleStockSelect(stock)}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: 'primary.light',
                    '&:hover': {
                      backgroundColor: 'primary.main',
                    },
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <TrendingUpIcon 
                    sx={{ mr: 2, color: 'primary.main' }} 
                    fontSize="small" 
                  />
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2" component="span" fontWeight="bold">
                          {stock.symbol}
                        </Typography>
                        <Chip 
                          label={stock.exchange} 
                          size="small" 
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {stock.companyName}
                      </Typography>
                    }
                  />
                </Box>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {state.isOpen && state.results.length === 0 && !state.isLoading && state.query.trim() && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1300,
            mt: 1,
            p: 2
          }}
        >
          <Typography variant="body2" color="text.secondary" align="center">
            No stocks found for "{state.query}"
          </Typography>
        </Paper>
      )}

      {state.error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {state.error}
        </Alert>
      )}
    </Box>
  );
};

export default StockSearch;