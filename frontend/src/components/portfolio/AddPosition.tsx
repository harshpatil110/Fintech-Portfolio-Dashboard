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
  InputAdornment
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import StockSearch from '../common/StockSearch';
import { StockSearchResult } from '../../types/market';
import { CreateStockPositionRequest } from '../../types/portfolio';
import { portfolioService } from '../../services/portfolioService';

interface AddPositionProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  selectedStock: StockSearchResult | null;
  quantity: string;
  averageCost: string;
  purchaseDate: Date | null;
}

interface FormErrors {
  stock?: string;
  quantity?: string;
  averageCost?: string;
  purchaseDate?: string;
}

export const AddPosition: React.FC<AddPositionProps> = ({
  open,
  onClose,
  onSuccess
}) => {
  const [formData, setFormData] = useState<FormData>({
    selectedStock: null,
    quantity: '',
    averageCost: '',
    purchaseDate: new Date()
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Validate stock selection
    if (!formData.selectedStock) {
      newErrors.stock = 'Please select a stock';
    }

    // Validate quantity
    if (!formData.quantity.trim()) {
      newErrors.quantity = 'Quantity is required';
    } else {
      const quantity = parseFloat(formData.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        newErrors.quantity = 'Quantity must be a positive number';
      } else if (quantity > 1000000) {
        newErrors.quantity = 'Quantity cannot exceed 1,000,000 shares';
      }
    }

    // Validate average cost
    if (!formData.averageCost.trim()) {
      newErrors.averageCost = 'Average cost is required';
    } else {
      const cost = parseFloat(formData.averageCost);
      if (isNaN(cost) || cost <= 0) {
        newErrors.averageCost = 'Average cost must be a positive number';
      } else if (cost > 100000) {
        newErrors.averageCost = 'Average cost cannot exceed $100,000 per share';
      }
    }

    // Validate purchase date
    if (!formData.purchaseDate) {
      newErrors.purchaseDate = 'Purchase date is required';
    } else if (formData.purchaseDate > new Date()) {
      newErrors.purchaseDate = 'Purchase date cannot be in the future';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStockSelect = (stock: StockSearchResult) => {
    setFormData(prev => ({ ...prev, selectedStock: stock }));
    setErrors(prev => ({ ...prev, stock: undefined }));
  };

  const handleQuantityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    // Allow only numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setFormData(prev => ({ ...prev, quantity: value }));
      setErrors(prev => ({ ...prev, quantity: undefined }));
    }
  };

  const handleAverageCostChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    // Allow only numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setFormData(prev => ({ ...prev, averageCost: value }));
      setErrors(prev => ({ ...prev, averageCost: undefined }));
    }
  };

  const handleDateChange = (date: Date | null) => {
    setFormData(prev => ({ ...prev, purchaseDate: date }));
    setErrors(prev => ({ ...prev, purchaseDate: undefined }));
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const positionData: CreateStockPositionRequest = {
        symbol: formData.selectedStock!.symbol,
        companyName: formData.selectedStock!.companyName,
        quantity: parseFloat(formData.quantity),
        averageCost: parseFloat(formData.averageCost),
        purchaseDate: formData.purchaseDate!.toISOString().split('T')[0]
      };

      await portfolioService.addPosition(positionData);
      
      // Reset form
      setFormData({
        selectedStock: null,
        quantity: '',
        averageCost: '',
        purchaseDate: new Date()
      });
      setErrors({});
      
      onSuccess();
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add position';
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        selectedStock: null,
        quantity: '',
        averageCost: '',
        purchaseDate: new Date()
      });
      setErrors({});
      setSubmitError(null);
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isSubmitting}
    >
      <DialogTitle>
        <Typography variant="h6" component="div">
          Add Stock Position
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Add a new stock position to your portfolio
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          {submitError && (
            <Alert severity="error" onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Stock Selection *
            </Typography>
            <StockSearch
              onStockSelect={handleStockSelect}
              placeholder="Search for a stock (e.g., AAPL, Apple Inc.)"
              showValidation
              disabled={isSubmitting}
            />
            {errors.stock && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                {errors.stock}
              </Typography>
            )}
            {formData.selectedStock && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'success.light', borderRadius: 1 }}>
                <Typography variant="body2" color="success.dark">
                  Selected: {formData.selectedStock.symbol} - {formData.selectedStock.companyName}
                </Typography>
              </Box>
            )}
          </Box>

          <TextField
            label="Quantity"
            value={formData.quantity}
            onChange={handleQuantityChange}
            error={!!errors.quantity}
            helperText={errors.quantity || 'Number of shares purchased'}
            disabled={isSubmitting}
            required
            InputProps={{
              endAdornment: <InputAdornment position="end">shares</InputAdornment>
            }}
          />

          <TextField
            label="Average Cost"
            value={formData.averageCost}
            onChange={handleAverageCostChange}
            error={!!errors.averageCost}
            helperText={errors.averageCost || 'Average price paid per share'}
            disabled={isSubmitting}
            required
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
              endAdornment: <InputAdornment position="end">per share</InputAdornment>
            }}
          />

          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="Purchase Date"
              value={formData.purchaseDate}
              onChange={handleDateChange}
              disabled={isSubmitting}
              maxDate={new Date()}
              slotProps={{
                textField: {
                  required: true,
                  error: !!errors.purchaseDate,
                  helperText: errors.purchaseDate || 'Date when the shares were purchased'
                }
              }}
            />
          </LocalizationProvider>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button 
          onClick={handleClose} 
          disabled={isSubmitting}
          color="inherit"
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={20} /> : undefined}
        >
          {isSubmitting ? 'Adding...' : 'Add Position'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};