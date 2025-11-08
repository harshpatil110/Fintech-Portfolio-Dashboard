import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  CircularProgress
} from '@mui/material';
import StockSearch from '../common/StockSearch';
import { StockSearchResult } from '../../types/market';

interface AddToWatchlistProps {
  open: boolean;
  onClose: () => void;
  onAdd: (symbol: string, companyName: string, alertPrice?: number) => Promise<void>;
}

export const AddToWatchlist: React.FC<AddToWatchlistProps> = ({
  open,
  onClose,
  onAdd
}) => {
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
  const [alertPrice, setAlertPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStockSelect = (stock: StockSearchResult) => {
    setSelectedStock(stock);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedStock) {
      setError('Please select a stock');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const price = alertPrice ? parseFloat(alertPrice) : undefined;
      await onAdd(selectedStock.symbol, selectedStock.companyName, price);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to watchlist');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedStock(null);
    setAlertPrice('');
    setError(null);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add to Watchlist</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <StockSearch
            onStockSelect={handleStockSelect}
            placeholder="Enter stock symbol or company name"
          />

          {selectedStock && (
            <Box sx={{ mt: 3 }}>
              <Alert severity="info" sx={{ mb: 2 }}>
                Selected: {selectedStock.symbol} - {selectedStock.companyName}
              </Alert>

              <TextField
                label="Alert Price (Optional)"
                type="number"
                fullWidth
                variant="outlined"
                value={alertPrice}
                onChange={(e) => setAlertPrice(e.target.value)}
                inputProps={{ min: 0, step: 0.01 }}
                helperText="Get notified when the stock reaches this price"
              />
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!selectedStock || isSubmitting}
        >
          {isSubmitting ? <CircularProgress size={24} /> : 'Add to Watchlist'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
