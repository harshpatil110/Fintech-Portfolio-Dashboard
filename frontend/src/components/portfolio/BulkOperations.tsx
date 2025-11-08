import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { StockPosition, BulkOperationRequest, UpdateStockPositionRequest } from '../../types/portfolio';
import { portfolioService } from '../../services/portfolioService';

interface BulkOperationsProps {
  open: boolean;
  onClose: () => void;
  selectedPositions: StockPosition[];
  onSuccess: () => void;
}

export const BulkOperations: React.FC<BulkOperationsProps> = ({
  open,
  onClose,
  selectedPositions,
  onSuccess
}) => {
  const [operation, setOperation] = useState<'delete' | 'update'>('delete');
  const [updateData, setUpdateData] = useState<Partial<UpdateStockPositionRequest>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setOperation('delete');
    setUpdateData({});
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (selectedPositions.length === 0) {
      setError('No positions selected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const request: BulkOperationRequest = {
        operation,
        positionIds: selectedPositions.map(p => p.id),
        updateData: operation === 'update' ? updateData : undefined
      };

      const result = await portfolioService.performBulkOperation(request);

      if (result.failed.length > 0) {
        const failedCount = result.failed.length;
        const successCount = result.successful.length;
        setError(`Operation completed with ${failedCount} failures out of ${failedCount + successCount} positions`);
      }

      onSuccess();
      
      if (result.failed.length === 0) {
        handleClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to perform bulk operation');
    } finally {
      setLoading(false);
    }
  };

  const isUpdateDataValid = () => {
    if (operation === 'delete') return true;
    return Object.keys(updateData).length > 0 && 
           Object.values(updateData).some(value => value !== undefined && value !== '');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Bulk Operations ({selectedPositions.length} positions selected)
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Selected Positions:
          </Typography>
          <List dense>
            {selectedPositions.map((position) => (
              <ListItem key={position.id} sx={{ py: 0.5 }}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={position.symbol} size="small" color="primary" />
                      <Typography variant="body2">
                        {position.companyName}
                      </Typography>
                    </Box>
                  }
                  secondary={`${position.quantity} shares @ $${position.averageCost}`}
                />
              </ListItem>
            ))}
          </List>
        </Box>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Operation</InputLabel>
          <Select
            value={operation}
            label="Operation"
            onChange={(e) => setOperation(e.target.value as 'delete' | 'update')}
          >
            <MenuItem value="delete">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DeleteIcon fontSize="small" />
                Delete Positions
              </Box>
            </MenuItem>
            <MenuItem value="update">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EditIcon fontSize="small" />
                Update Positions
              </Box>
            </MenuItem>
          </Select>
        </FormControl>

        {operation === 'update' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6">
              Update Data (leave fields empty to keep current values):
            </Typography>
            
            <TextField
              label="Quantity"
              type="number"
              value={updateData.quantity || ''}
              onChange={(e) => setUpdateData({
                ...updateData,
                quantity: e.target.value ? parseFloat(e.target.value) : undefined
              })}
              inputProps={{ min: 0.001, step: 0.001 }}
              fullWidth
            />
            
            <TextField
              label="Average Cost"
              type="number"
              value={updateData.averageCost || ''}
              onChange={(e) => setUpdateData({
                ...updateData,
                averageCost: e.target.value ? parseFloat(e.target.value) : undefined
              })}
              inputProps={{ min: 0.01, step: 0.01 }}
              fullWidth
            />
            
            <TextField
              label="Purchase Date"
              type="date"
              value={updateData.purchaseDate || ''}
              onChange={(e) => setUpdateData({
                ...updateData,
                purchaseDate: e.target.value || undefined
              })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>
        )}

        {operation === 'delete' && (
          <Alert severity="warning">
            This action will permanently delete the selected positions. This cannot be undone.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color={operation === 'delete' ? 'error' : 'primary'}
          disabled={loading || !isUpdateDataValid()}
          startIcon={loading ? <CircularProgress size={20} /> : (operation === 'delete' ? <DeleteIcon /> : <EditIcon />)}
        >
          {loading ? 'Processing...' : (operation === 'delete' ? 'Delete Positions' : 'Update Positions')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};