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
  CircularProgress,
  Typography,
  Chip
} from '@mui/material';

interface BulkOperationsProps {
  open: boolean;
  onClose: () => void;
  onBulkAdd: (symbols: string[]) => Promise<void>;
}

export const BulkOperations: React.FC<BulkOperationsProps> = ({
  open,
  onClose,
  onBulkAdd
}) => {
  const [symbolsText, setSymbolsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parseSymbols = (text: string): string[] => {
    return text
      .split(/[\s,;]+/)
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0 && /^[A-Z0-9.-]+$/.test(s));
  };

  const handleSubmit = async () => {
    const symbols = parseSymbols(symbolsText);

    if (symbols.length === 0) {
      setError('Please enter at least one valid stock symbol');
      return;
    }

    if (symbols.length > 10) {
      setError('You can add a maximum of 10 stocks at once');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onBulkAdd(symbols);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add stocks');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSymbolsText('');
    setError(null);
    setIsSubmitting(false);
    onClose();
  };

  const previewSymbols = parseSymbols(symbolsText);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bulk Add to Watchlist</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" gutterBottom>
            Enter multiple stock symbols separated by commas, spaces, or line breaks
          </Typography>

          <TextField
            multiline
            rows={6}
            fullWidth
            variant="outlined"
            value={symbolsText}
            onChange={(e) => setSymbolsText(e.target.value)}
            placeholder="AAPL, MSFT, GOOGL&#10;TSLA&#10;AMZN"
            sx={{ mt: 2 }}
            disabled={isSubmitting}
          />

          {previewSymbols.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Symbols to add ({previewSymbols.length}/10):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {previewSymbols.slice(0, 10).map((symbol) => (
                  <Chip key={symbol} label={symbol} size="small" />
                ))}
                {previewSymbols.length > 10 && (
                  <Chip
                    label={`+${previewSymbols.length - 10} more`}
                    size="small"
                    color="warning"
                  />
                )}
              </Box>
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
          disabled={previewSymbols.length === 0 || isSubmitting}
        >
          {isSubmitting ? <CircularProgress size={24} /> : `Add ${previewSymbols.length} Stocks`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
