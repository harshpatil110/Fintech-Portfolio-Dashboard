import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Alert,
  CircularProgress,
  Tooltip,
  Paper
} from '@mui/material';
import {
  Close as CloseIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  Business as BusinessIcon,
  Schedule as ScheduleIcon,
  AttachMoney as AttachMoneyIcon,
  ShowChart as ShowChartIcon
} from '@mui/icons-material';
import { StockQuote, StockSearchResult } from '../../types/market';
import { marketService } from '../../services/marketService';

export interface StockDetailsProps {
  stock: StockSearchResult | null;
  open: boolean;
  onClose: () => void;
  onAddToPortfolio?: (stock: StockSearchResult) => void;
  onAddToWatchlist?: (stock: StockSearchResult) => void;
  variant?: 'modal' | 'sidebar';
  showActions?: boolean;
}

const StockDetails: React.FC<StockDetailsProps> = ({
  stock,
  open,
  onClose,
  onAddToPortfolio,
  onAddToWatchlist,
  variant = 'modal',
  showActions = true
}) => {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch quote data when stock changes
  useEffect(() => {
    if (stock && open) {
      fetchQuoteData(stock.symbol);
    } else {
      setQuote(null);
      setError(null);
    }
  }, [stock, open]);

  const fetchQuoteData = async (symbol: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const quoteData = await marketService.getQuote(symbol);
      setQuote(quoteData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch stock data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToPortfolio = () => {
    if (stock && onAddToPortfolio) {
      onAddToPortfolio(stock);
    }
  };

  const handleAddToWatchlist = () => {
    if (stock && onAddToWatchlist) {
      onAddToWatchlist(stock);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatNumber = (value: number): string => {
    if (value >= 1e12) {
      return `$${(value / 1e12).toFixed(2)}T`;
    } else if (value >= 1e9) {
      return `$${(value / 1e9).toFixed(2)}B`;
    } else if (value >= 1e6) {
      return `$${(value / 1e6).toFixed(2)}M`;
    } else if (value >= 1e3) {
      return `$${(value / 1e3).toFixed(2)}K`;
    }
    return formatCurrency(value);
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1e9) {
      return `${(volume / 1e9).toFixed(2)}B`;
    } else if (volume >= 1e6) {
      return `${(volume / 1e6).toFixed(2)}M`;
    } else if (volume >= 1e3) {
      return `${(volume / 1e3).toFixed(2)}K`;
    }
    return volume.toLocaleString();
  };

  const getMarketStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'success';
      case 'CLOSED':
        return 'default';
      case 'PRE_MARKET':
      case 'AFTER_HOURS':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getMarketStatusText = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'Market Open';
      case 'CLOSED':
        return 'Market Closed';
      case 'PRE_MARKET':
        return 'Pre-Market';
      case 'AFTER_HOURS':
        return 'After Hours';
      default:
        return status;
    }
  };

  const getPriceChangeIcon = (change: number) => {
    return change >= 0 ? (
      <TrendingUpIcon color="success" fontSize="small" />
    ) : (
      <TrendingDownIcon color="error" fontSize="small" />
    );
  };

  const getPriceChangeColor = (change: number) => {
    return change >= 0 ? 'success.main' : 'error.main';
  };

  const renderContent = () => {
    if (!stock) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Select a stock to view details
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ p: variant === 'modal' ? 0 : 2 }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <BusinessIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h5" component="h2" fontWeight="bold">
              {stock.symbol}
            </Typography>
            <Chip 
              label={stock.exchange} 
              size="small" 
              variant="outlined" 
              sx={{ ml: 1 }}
            />
          </Box>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {stock.companyName}
          </Typography>
          
          {quote && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Chip
                label={getMarketStatusText(quote.marketStatus)}
                color={getMarketStatusColor(quote.marketStatus) as any}
                size="small"
                icon={<ScheduleIcon />}
              />
              <Typography variant="caption" color="text.secondary">
                Last updated: {new Date(quote.timestamp).toLocaleString()}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Quote Data */}
        {quote && !loading && (
          <>
            {/* Price Information */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Current Price
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h4" component="span" fontWeight="bold">
                    {formatCurrency(quote.currentPrice)}
                  </Typography>
                  <Box sx={{ ml: 2, display: 'flex', alignItems: 'center' }}>
                    {getPriceChangeIcon(quote.change)}
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        ml: 0.5, 
                        color: getPriceChangeColor(quote.change),
                        fontWeight: 'medium'
                      }}
                    >
                      {quote.change >= 0 ? '+' : ''}{formatCurrency(quote.change)}
                    </Typography>
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        ml: 1, 
                        color: getPriceChangeColor(quote.change),
                        fontWeight: 'medium'
                      }}
                    >
                      ({quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%)
                    </Typography>
                  </Box>
                </Box>
                
                <Typography variant="body2" color="text.secondary">
                  Previous Close: {formatCurrency(quote.previousClose)}
                </Typography>
              </CardContent>
            </Card>

            {/* Market Data Grid */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={6}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <AttachMoneyIcon color="primary" sx={{ mb: 1 }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    Market Cap
                  </Typography>
                  <Typography variant="h6" fontWeight="bold">
                    {formatNumber(quote.marketCap)}
                  </Typography>
                </Paper>
              </Grid>
              
              <Grid item xs={6}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <ShowChartIcon color="primary" sx={{ mb: 1 }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    Volume
                  </Typography>
                  <Typography variant="h6" fontWeight="bold">
                    {formatVolume(quote.volume)}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Company Information */}
            <Card>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Company Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Symbol
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {quote.symbol}
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Exchange
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {stock.exchange}
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">
                      Company Name
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {quote.companyName}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </>
        )}

        {/* Action Buttons */}
        {showActions && stock && (
          <Box sx={{ mt: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {onAddToPortfolio && (
              <Tooltip title="Add to Portfolio">
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleAddToPortfolio}
                  sx={{ flex: 1, minWidth: 140 }}
                >
                  Add to Portfolio
                </Button>
              </Tooltip>
            )}
            
            {onAddToWatchlist && (
              <Tooltip title="Add to Watchlist">
                <Button
                  variant="outlined"
                  startIcon={<VisibilityIcon />}
                  onClick={handleAddToWatchlist}
                  sx={{ flex: 1, minWidth: 140 }}
                >
                  Add to Watchlist
                </Button>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
    );
  };

  if (variant === 'sidebar') {
    return (
      <Paper 
        elevation={2} 
        sx={{ 
          height: '100%', 
          overflow: 'auto',
          display: open ? 'block' : 'none'
        }}
      >
        {renderContent()}
      </Paper>
    );
  }

  // Modal variant
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { minHeight: 400 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Stock Details</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers>
        {renderContent()}
      </DialogContent>
      
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StockDetails;