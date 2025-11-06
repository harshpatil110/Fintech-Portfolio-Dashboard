import React, { useState, useEffect } from 'react';
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
  InputAdornment,
  Chip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { StockPosition, UpdateStockPositionRequest } from '../../types/portfolio';
import { portfolioService } from '../../services/portfolioService';

interface EditPositionProps {
  open: boolean;
  position: StockPosition | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  quantity: string;
  averageCost: string;
  purchaseDate: Date | null;
}

interface FormErrors {
  quantity?: string;
  averageCost?: string;
  purchaseDate?: string;
}

export const EditPosition: React.FC<EditPositionProps> = ({
  open,
  position,
  onClose,
  onSuccess
}) => {
  const [formData, setFormData] = useState<FormData>({
    quantity: '',
    averageCost: '',
    purchaseDate: null
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize form data when position changes
  useEffect(() => {
    if (position) {
      setFormData({
        quantity: position.quantity.toString(),
        averageCost: position.averageCost.toString(),
        purchaseDate: new Date(position.purchaseDate)
      });
      setErrors({});
      setSubmitError(null);
    }
  }, [position]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

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

  const hasChanges = (): boolean => {
    if (!position) return false;
    
    return (
      parseFloat(formData.quantity) !== position.quantity ||
      parseFloat(formData.averageCost) !== position.averageCost ||
      formData.purchaseDate?.toISOString().split('T')[0] !== position.purchaseDate
    );
  };

  const handleSubmit = async () => {
    if (!position || !validateForm()) {
      return;
    }

    if (!hasChanges()) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const updates: UpdateStockPositionRequest = {
        quantity: parseFloat(formData.quantity),
        averageCost: parseFloat(formData.averageCost),
        purchaseDate: formData.purchaseDate!.toISOString().split('T')[0]
      };

      await portfolioService.updatePosition(position.id, updates);
      
      onSuccess();
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update position';
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      // Reset form to original values
      if (position) {
        setFormData({
          quantity: position.quantity.toString(),
          averageCost: position.averageCost.toString(),
          purchaseDate: new Date(position.purchaseDate)
        });
      }
      setErrors({});
      setSubmitError(null);
      onClose();
    }
  };

  if (!position) {
    return null;
  }

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
          Edit Position
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Chip 
            label={position.symbol} 
            color="primary" 
            size="small" 
          />
          <Typography variant="body2" color="text.secondary">
            {position.companyName}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          {submitError && (
            <Alert severity="error" onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          <TextField
            label="Quantity"
            value={formData.quantity}
            onChange={handleQuantityChange}
            error={!!errors.quantity}
            helperText={errors.quantity || 'Number of shares owned'}
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

          {position.currentPrice && (
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Current Market Information
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Current Price:
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  ${position.currentPrice.toFixed(2)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Estimated Market Value:
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  ${(parseFloat(formData.quantity || '0') * position.currentPrice).toFixed(2)}
                </Typography>
              </Box>
            </Box>
          )}
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
          disabled={isSubmitting || !hasChanges()}
          startIcon={isSubmitting ? <CircularProgress size={20} /> : undefined}
        >
          {isSubmitting ? 'Updating...' : 'Update Position'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};