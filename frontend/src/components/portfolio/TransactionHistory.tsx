import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Chip,
  Box,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  History as HistoryIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  TrendingDown as SellIcon
} from '@mui/icons-material';
import { TransactionHistory } from '../../types/portfolio';
import { portfolioService } from '../../services/portfolioService';
import { useAuth } from '../../hooks/useAuthHook';

interface TransactionHistoryProps {
  open: boolean;
  onClose: () => void;
}

export const TransactionHistoryComponent: React.FC<TransactionHistoryProps> = ({
  open,
  onClose
}) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user?.id) {
      fetchTransactionHistory();
    }
  }, [open, user?.id]);

  const fetchTransactionHistory = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError(null);
    
    try {
      const history = await portfolioService.getTransactionHistory(user.id, 100);
      setTransactions(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'BUY':
        return <AddIcon fontSize="small" color="success" />;
      case 'SELL':
        return <SellIcon fontSize="small" color="error" />;
      case 'UPDATE':
        return <EditIcon fontSize="small" color="primary" />;
      case 'DELETE':
        return <DeleteIcon fontSize="small" color="error" />;
      default:
        return <HistoryIcon fontSize="small" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'BUY':
        return 'success';
      case 'SELL':
        return 'error';
      case 'UPDATE':
        return 'primary';
      case 'DELETE':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon />
          Transaction History
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && transactions.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary">
              No transaction history found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your portfolio transactions will appear here once you start adding positions.
            </Typography>
          </Box>
        )}

        {!loading && !error && transactions.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Symbol</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Total Value</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(transaction.transactionDate)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getTransactionIcon(transaction.transactionType)}
                        <Chip
                          label={transaction.transactionType}
                          size="small"
                          color={getTransactionColor(transaction.transactionType) as any}
                          variant="outlined"
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={transaction.symbol}
                        size="small"
                        color="primary"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {transaction.quantity ? transaction.quantity.toLocaleString() : '-'}
                    </TableCell>
                    <TableCell align="right">
                      {transaction.price ? formatCurrency(transaction.price) : '-'}
                    </TableCell>
                    <TableCell align="right">
                      {transaction.totalValue ? formatCurrency(transaction.totalValue) : '-'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {transaction.notes || '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};