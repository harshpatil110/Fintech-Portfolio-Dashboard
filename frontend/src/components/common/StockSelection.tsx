import React, { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  Snackbar,
  Grid,
  Card,
  CardContent,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import StockSearch from './StockSearch';
import StockDetails from './StockDetails';
import { StockSearchResult } from '../../types/market';

export interface StockSelectionProps {
  onAddToPortfolio?: (stock: StockSearchResult) => Promise<void> | void;
  onAddToWatchlist?: (stock: StockSearchResult) => Promise<void> | void;
  title?: string;
  subtitle?: string;
  showPortfolioAction?: boolean;
  showWatchlistAction?: boolean;
  variant?: 'modal' | 'inline';
  className?: string;
}

interface NotificationState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
}

const StockSelection: React.FC<StockSelectionProps> = ({
  onAddToPortfolio,
  onAddToWatchlist,
  title = "Stock Selection",
  subtitle = "Search and select stocks to add to your portfolio or watchlist",
  showPortfolioAction = true,
  showWatchlistAction = true,
  variant = 'inline',
  className = ''
}) => {
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState<{
    portfolio: boolean;
    watchlist: boolean;
  }>({
    portfolio: false,
    watchlist: false
  });
  const [notification, setNotification] = useState<NotificationState>({
    open: false,
    message: '',
    severity: 'success'
  });

  const handleStockSelect = useCallback((stock: StockSearchResult) => {
    setSelectedStock(stock);
    if (variant === 'modal') {
      setShowDetails(true);
    }
  }, [variant]);

  const showNotification = (message: string, severity: NotificationState['severity'] = 'success') => {
    setNotification({
      open: true,
      message,
      severity
    });
  };

  const handleCloseNotification = () => {
    setNotification(prev => ({ ...prev, open: false }));
  };

  const handleAddToPortfolio = async (stock: StockSearchResult) => {
    if (!onAddToPortfolio) return;

    setLoading(prev => ({ ...prev, portfolio: true }));
    
    try {
      await onAddToPortfolio(stock);
      showNotification(`${stock.symbol} added to portfolio successfully!`, 'success');
      
      if (variant === 'modal') {
        setShowDetails(false);
        setSelectedStock(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add stock to portfolio';
      showNotification(errorMessage, 'error');
    } finally {
      setLoading(prev => ({ ...prev, portfolio: false }));
    }
  };

  const handleAddToWatchlist = async (stock: StockSearchResult) => {
    if (!onAddToWatchlist) return;

    setLoading(prev => ({ ...prev, watchlist: true }));
    
    try {
      await onAddToWatchlist(stock);
      showNotification(`${stock.symbol} added to watchlist successfully!`, 'success');
      
      if (variant === 'modal') {
        setShowDetails(false);
        setSelectedStock(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add stock to watchlist';
      showNotification(errorMessage, 'error');
    } finally {
      setLoading(prev => ({ ...prev, watchlist: false }));
    }
  };

  const handleCloseDetails = () => {
    setShowDetails(false);
    setSelectedStock(null);
  };

  const renderInlineVariant = () => (
    <Box className={className}>
      <Paper elevation={2} sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            {title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Search Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <SearchIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Search Stocks</Typography>
            </Box>
            
            <StockSearch
              onStockSelect={handleStockSelect}
              placeholder="Search for stocks (e.g., AAPL, Apple Inc.)"
              showValidation={true}
              maxResults={8}
            />
          </CardContent>
        </Card>

        {/* Selected Stock Details */}
        {selectedStock && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <StockDetails
                stock={selectedStock}
                open={true}
                onClose={() => setSelectedStock(null)}
                variant="sidebar"
                showActions={false}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, height: 'fit-content' }}>
                <Typography variant="h6" gutterBottom>
                  Actions
                </Typography>
                
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {showPortfolioAction && onAddToPortfolio && (
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={() => handleAddToPortfolio(selectedStock)}
                      disabled={loading.portfolio}
                      fullWidth
                    >
                      {loading.portfolio ? 'Adding...' : 'Add to Portfolio'}
                    </Button>
                  )}
                  
                  {showWatchlistAction && onAddToWatchlist && (
                    <Button
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      onClick={() => handleAddToWatchlist(selectedStock)}
                      disabled={loading.watchlist}
                      fullWidth
                    >
                      {loading.watchlist ? 'Adding...' : 'Add to Watchlist'}
                    </Button>
                  )}
                </Box>

                {selectedStock && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Selected Stock
                    </Typography>
                    <Typography variant="body1" fontWeight="bold">
                      {selectedStock.symbol}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selectedStock.companyName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {selectedStock.exchange}
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* Empty State */}
        {!selectedStock && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <SearchIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Stock Selected
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use the search above to find and select a stock
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );

  const renderModalVariant = () => (
    <Box className={className}>
      <StockSearch
        onStockSelect={handleStockSelect}
        placeholder="Search for stocks to view details"
        showValidation={true}
        maxResults={10}
      />
      
      <StockDetails
        stock={selectedStock}
        open={showDetails}
        onClose={handleCloseDetails}
        onAddToPortfolio={showPortfolioAction && onAddToPortfolio ? handleAddToPortfolio : undefined}
        onAddToWatchlist={showWatchlistAction && onAddToWatchlist ? handleAddToWatchlist : undefined}
        variant="modal"
        showActions={showPortfolioAction || showWatchlistAction}
      />
    </Box>
  );

  return (
    <>
      {variant === 'inline' ? renderInlineVariant() : renderModalVariant()}
      
      {/* Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={handleCloseNotification} 
          severity={notification.severity}
          variant="filled"
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default StockSelection;