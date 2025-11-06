import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Chip,
  Divider
} from '@mui/material';
import {
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';
import { StockPosition } from '../../types/portfolio';
import { portfolioService } from '../../services/portfolioService';

interface RemovePositionProps {
  open: boolean;
  position: StockPosition | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const RemovePosition: React.FC<RemovePositionProps> = ({
  open,
  position,
  onClose,
  onSuccess
}) => {
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemove = async () => {
    if (!position) return;

    setIsRemoving(true);
    setRemoveError(null);

    try {
      await portfolioService.removePosition(position.id);
      onSuccess();
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove position';
      setRemoveError(errorMessage);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleClose = () => {
    if (!isRemoving) {
      setRemoveError(null);
      onClose();
    }
  };

  if (!position) {
    return null;
  }

  const costBasis = position.quantity * position.averageCost;
  const marketValue = position.marketValue || (position.currentPrice ? position.quantity * position.currentPrice : costBasis);
  const gainLoss = position.gainLoss || (marketValue - costBasis);
  const gainLossPercent = position.gainLossPercent || ((gainLoss / costBasis) * 100);
  const isGain = gainLoss >= 0;

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isRemoving}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          <Typography variant="h6" component="div">
            Remove Position
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {removeError && (
            <Alert severity="error" onClose={() => setRemoveError(null)}>
              {removeError}
            </Alert>
          )}

          <Alert severity="warning" icon={<WarningIcon />}>
            <Typography variant="body2">
              Are you sure you want to remove this position from your portfolio? This action cannot be undone.
            </Typography>
          </Alert>

          {/* Position Details */}
          <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Chip 
                label={position.symbol} 
                color="primary" 
                size="small" 
              />
              <Typography variant="subtitle1" fontWeight="medium">
                {position.companyName}
              </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Quantity
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  {position.quantity.toLocaleString()} shares
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Average Cost
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  ${position.averageCost.toFixed(2)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Cost Basis
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  ${costBasis.toFixed(2)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Current Price
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  {position.currentPrice ? `$${position.currentPrice.toFixed(2)}` : 'N/A'}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Market Value
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  ${marketValue.toFixed(2)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Gain/Loss
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {isGain ? (
                    <TrendingUpIcon fontSize="small" color="success" />
                  ) : (
                    <TrendingDownIcon fontSize="small" color="error" />
                  )}
                  <Typography 
                    variant="body2" 
                    fontWeight="medium"
                    color={isGain ? 'success.main' : 'error.main'}
                  >
                    ${Math.abs(gainLoss).toFixed(2)} ({gainLossPercent >= 0 ? '+' : ''}{gainLossPercent.toFixed(2)}%)
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Purchase Date
              </Typography>
              <Typography variant="body2" fontWeight="medium">
                {new Date(position.purchaseDate).toLocaleDateString()}
              </Typography>
            </Box>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            Note: Removing this position will not affect your actual stock holdings. 
            This only removes the position from your portfolio tracking.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button 
          onClick={handleClose} 
          disabled={isRemoving}
          color="inherit"
        >
          Cancel
        </Button>
        <Button 
          onClick={handleRemove}
          variant="contained"
          color="error"
          disabled={isRemoving}
          startIcon={isRemoving ? <CircularProgress size={20} /> : <WarningIcon />}
        >
          {isRemoving ? 'Removing...' : 'Remove Position'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};