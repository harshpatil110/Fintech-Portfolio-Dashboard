import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { useAuth } from '../../contexts/AuthContext';
import { watchlistService } from '../../services/watchlistService';
import { WatchlistItem, WatchlistFilters as WatchlistFiltersType } from '../../types/watchlist';
import { WatchlistItemCard } from './WatchlistItemCard';
import { AddToWatchlist } from './AddToWatchlist';
import { WatchlistFilters } from './WatchlistFilters';
import { BulkOperations } from './BulkOperations';
import { AddPosition } from '../portfolio/AddPosition';
import { useWebSocket } from '../../hooks/useWebSocket';
import { marketService } from '../../services/marketService';

export const Watchlist: React.FC = () => {
  const { user } = useAuth();
  const { isConnected, quotes, subscribe, unsubscribe, connectionState } = useWebSocket();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkAddDialogOpen, setBulkAddDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [addToPortfolioDialogOpen, setAddToPortfolioDialogOpen] = useState(false);
  const [selectedStockForPortfolio, setSelectedStockForPortfolio] = useState<{
    symbol: string;
    companyName: string;
  } | null>(null);
  const [filters, setFilters] = useState<WatchlistFiltersType>({
    sortBy: 'addedAt',
    sortOrder: 'desc'
  });

  const loadWatchlist = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await watchlistService.getWatchlist(user.id, filters);
      setWatchlistItems(response.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watchlist');
    } finally {
      setIsLoading(false);
    }
  }, [user, filters]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // Subscribe to WebSocket updates for watchlist symbols
  useEffect(() => {
    if (isConnected && watchlistItems.length > 0) {
      const symbols = watchlistItems.map(item => item.symbol);
      subscribe(symbols);

      return () => {
        unsubscribe(symbols);
      };
    }
  }, [isConnected, watchlistItems, subscribe, unsubscribe]);

  // Update watchlist items with real-time quotes
  useEffect(() => {
    if (quotes.size > 0) {
      setWatchlistItems(prevItems =>
        prevItems.map(item => {
          const quote = quotes.get(item.symbol);
          if (quote) {
            return {
              ...item,
              currentPrice: quote.currentPrice,
              change: quote.change,
              changePercent: quote.changePercent
            };
          }
          return item;
        })
      );
    }
  }, [quotes]);

  const handleAddToWatchlist = async (
    symbol: string,
    companyName: string,
    alertPrice?: number
  ) => {
    try {
      await watchlistService.addToWatchlist({ symbol, companyName, alertPrice });
      setSuccessMessage(`${symbol} added to watchlist`);
      await loadWatchlist();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to watchlist');
      throw err;
    }
  };

  const handleRemoveFromWatchlist = async (symbol: string) => {
    if (!user) return;

    try {
      await watchlistService.removeFromWatchlist(user.id, symbol);
      setSuccessMessage(`${symbol} removed from watchlist`);
      await loadWatchlist();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove from watchlist');
    }
  };

  const handleClearWatchlist = async () => {
    if (!user) return;

    try {
      await watchlistService.clearWatchlist(user.id);
      setSuccessMessage('Watchlist cleared');
      await loadWatchlist();
      setClearDialogOpen(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear watchlist');
    }
  };

  const handleUpdateAlert = async (symbol: string, alertPrice?: number) => {
    if (!user) return;

    try {
      await watchlistService.updateWatchlistItem(user.id, symbol, { alertPrice });
      setSuccessMessage(
        alertPrice ? `Alert set for ${symbol}` : `Alert removed for ${symbol}`
      );
      await loadWatchlist();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update alert');
    }
  };

  const handleAddToPortfolio = (symbol: string, companyName: string) => {
    setSelectedStockForPortfolio({ symbol, companyName });
    setAddToPortfolioDialogOpen(true);
  };

  const handlePortfolioAdded = () => {
    setAddToPortfolioDialogOpen(false);
    setSelectedStockForPortfolio(null);
    setSuccessMessage('Position added to portfolio');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleBulkAdd = async (symbols: string[]) => {
    try {
      // Get company names for symbols
      const stocksToAdd = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const quote = await marketService.getQuote(symbol);
            return {
              symbol,
              companyName: quote.companyName
            };
          } catch {
            return {
              symbol,
              companyName: symbol
            };
          }
        })
      );

      const result = await watchlistService.bulkAddToWatchlist({ stocks: stocksToAdd });
      
      const addedCount = result.summary.added;
      const skippedCount = result.summary.skipped;
      const errorCount = result.summary.errors;

      let message = `Added ${addedCount} stock${addedCount !== 1 ? 's' : ''}`;
      if (skippedCount > 0) message += `, skipped ${skippedCount}`;
      if (errorCount > 0) message += `, ${errorCount} failed`;

      setSuccessMessage(message);
      await loadWatchlist();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk add stocks');
      throw err;
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box 
        display="flex" 
        flexDirection={isMobile ? 'column' : 'row'}
        justifyContent="space-between" 
        alignItems={isMobile ? 'flex-start' : 'center'} 
        mb={isMobile ? 2 : 3}
        gap={isMobile ? 2 : 0}
      >
        <Box>
          <Typography variant={isMobile ? 'h5' : 'h4'} component="h1" gutterBottom>
            Watchlist
          </Typography>
          {!isMobile && (
            <Typography variant="body2" color="text.secondary">
              Monitor stocks you're interested in without owning them
            </Typography>
          )}
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap">
          {watchlistItems.length > 0 && !isMobile && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSweepIcon />}
              onClick={() => setClearDialogOpen(true)}
              size="small"
            >
              Clear All
            </Button>
          )}
          {!isMobile && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setBulkAddDialogOpen(true)}
              size="small"
            >
              Bulk Add
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddDialogOpen(true)}
            size={isMobile ? 'medium' : 'medium'}
          >
            {isMobile ? 'Add' : 'Add Stock'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      {watchlistItems.length > 0 && (
        <Box mb={2} display="flex" gap={1} alignItems="center" flexWrap="wrap">
          <Chip 
            label={`${watchlistItems.length} / 50 stocks`} 
            size={isMobile ? 'small' : 'medium'}
          />
          {watchlistItems.filter((item) => item.alertPrice).length > 0 && (
            <Chip
              label={`${watchlistItems.filter((item) => item.alertPrice).length} alerts`}
              color="primary"
              variant="outlined"
              size={isMobile ? 'small' : 'medium'}
            />
          )}
          <Chip
            label={
              connectionState === 'connected'
                ? 'Live Updates'
                : connectionState === 'connecting'
                ? 'Connecting...'
                : 'Offline'
            }
            color={
              connectionState === 'connected'
                ? 'success'
                : connectionState === 'connecting'
                ? 'warning'
                : 'default'
            }
            size="small"
            variant="outlined"
          />
        </Box>
      )}

      {watchlistItems.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            Your watchlist is empty
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Start adding stocks to monitor their prices and performance
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddDialogOpen(true)}
          >
            Add Your First Stock
          </Button>
        </Paper>
      ) : (
        <>
          <WatchlistFilters filters={filters} onFiltersChange={setFilters} />

          <Box>
            {watchlistItems.map((item) => (
              <WatchlistItemCard
                key={item.id}
                item={item}
                onRemove={handleRemoveFromWatchlist}
                onAddToPortfolio={handleAddToPortfolio}
                onUpdateAlert={handleUpdateAlert}
              />
            ))}
          </Box>
        </>
      )}

      <AddToWatchlist
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdd={handleAddToWatchlist}
      />

      <BulkOperations
        open={bulkAddDialogOpen}
        onClose={() => setBulkAddDialogOpen(false)}
        onBulkAdd={handleBulkAdd}
      />

      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear Watchlist</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove all {watchlistItems.length} stocks from your
            watchlist? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleClearWatchlist} color="error" variant="contained">
            Clear All
          </Button>
        </DialogActions>
      </Dialog>

      {selectedStockForPortfolio && (
        <AddPosition
          open={addToPortfolioDialogOpen}
          onClose={() => {
            setAddToPortfolioDialogOpen(false);
            setSelectedStockForPortfolio(null);
          }}
          onSuccess={handlePortfolioAdded}
          preselectedStock={selectedStockForPortfolio}
        />
      )}
    </Box>
  );
};