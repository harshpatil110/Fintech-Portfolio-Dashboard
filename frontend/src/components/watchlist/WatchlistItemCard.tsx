import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { WatchlistItem } from '../../types/watchlist';
import { useSwipe } from '../../hooks/useSwipe';

interface WatchlistItemCardProps {
  item: WatchlistItem;
  onRemove: (symbol: string) => void;
  onAddToPortfolio: (symbol: string, companyName: string) => void;
  onUpdateAlert: (symbol: string, alertPrice?: number) => void;
}

export const WatchlistItemCard: React.FC<WatchlistItemCardProps> = ({
  item,
  onRemove,
  onAddToPortfolio,
  onUpdateAlert
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertPrice, setAlertPrice] = useState(item.alertPrice?.toString() || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isPositive = (item.changePercent || 0) >= 0;
  const isAlertTriggered = item.alertPrice && item.currentPrice && item.currentPrice <= item.alertPrice;

  // Swipe gesture for mobile delete
  const { ref: swipeRef } = useSwipe({
    onSwipeLeft: () => {
      if (isMobile) {
        setShowDeleteConfirm(true);
      }
    },
  });

  const handleSaveAlert = () => {
    const price = alertPrice ? parseFloat(alertPrice) : undefined;
    onUpdateAlert(item.symbol, price);
    setAlertDialogOpen(false);
  };

  const handleConfirmDelete = () => {
    onRemove(item.symbol);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <Card 
        ref={swipeRef as any}
        sx={{ 
          mb: 2, 
          position: 'relative',
          touchAction: isMobile ? 'pan-y' : 'auto', // Allow vertical scrolling but enable horizontal swipe
        }}
      >
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Box flex={1}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Typography variant="h6" component="div">
                  {item.symbol}
                </Typography>
                {isAlertTriggered && (
                  <Chip
                    icon={<NotificationsActiveIcon />}
                    label="Alert"
                    color="warning"
                    size="small"
                  />
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {item.companyName}
              </Typography>

              {item.currentPrice !== undefined && (
                <Box mt={2}>
                  <Typography variant="h5" component="div">
                    ${item.currentPrice.toFixed(2)}
                  </Typography>
                  {item.change !== undefined && item.changePercent !== undefined && (
                    <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                      {isPositive ? (
                        <TrendingUpIcon sx={{ color: 'success.main', fontSize: 20 }} />
                      ) : (
                        <TrendingDownIcon sx={{ color: 'error.main', fontSize: 20 }} />
                      )}
                      <Typography
                        variant="body2"
                        sx={{
                          color: isPositive ? 'success.main' : 'error.main',
                          fontWeight: 'medium'
                        }}
                      >
                        {isPositive ? '+' : ''}
                        {item.change.toFixed(2)} ({isPositive ? '+' : ''}
                        {item.changePercent.toFixed(2)}%)
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}

              {item.alertPrice && (
                <Box mt={1}>
                  <Typography variant="caption" color="text.secondary">
                    Alert Price: ${item.alertPrice.toFixed(2)}
                  </Typography>
                </Box>
              )}
            </Box>

            <Box display="flex" flexDirection="column" gap={1}>
              <Tooltip title={item.alertPrice ? 'Edit Alert' : 'Set Alert'}>
                <IconButton
                  size="small"
                  onClick={() => setAlertDialogOpen(true)}
                  color={item.alertPrice ? 'primary' : 'default'}
                >
                  {item.alertPrice ? <NotificationsActiveIcon /> : <NotificationsIcon />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove from Watchlist">
                <IconButton
                  size="small"
                  onClick={() => onRemove(item.symbol)}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          <Box mt={2}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => onAddToPortfolio(item.symbol, item.companyName)}
              fullWidth
            >
              Add to Portfolio
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Dialog open={alertDialogOpen} onClose={() => setAlertDialogOpen(false)}>
        <DialogTitle>Set Price Alert</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Get notified when {item.symbol} reaches your target price
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Alert Price"
            type="number"
            fullWidth
            variant="outlined"
            value={alertPrice}
            onChange={(e) => setAlertPrice(e.target.value)}
            inputProps={{ min: 0, step: 0.01 }}
            sx={{ mt: 2 }}
          />
          {item.currentPrice && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Current Price: ${item.currentPrice.toFixed(2)}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlertDialogOpen(false)}>Cancel</Button>
          {item.alertPrice && (
            <Button onClick={() => { onUpdateAlert(item.symbol, undefined); setAlertDialogOpen(false); }} color="error">
              Remove Alert
            </Button>
          )}
          <Button onClick={handleSaveAlert} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mobile swipe delete confirmation */}
      <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <DialogTitle>Remove from Watchlist?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove {item.symbol} from your watchlist?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
