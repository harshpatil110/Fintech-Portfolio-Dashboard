import React, { useState, useEffect } from 'react';
import {
  Typography,
  Paper,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { usePortfolio } from '../../hooks/usePortfolio';
import { StockPosition } from '../../types/portfolio';
import { AddPosition } from './AddPosition';
import { EditPosition } from './EditPosition';
import { RemovePosition } from './RemovePosition';

export const Portfolio: React.FC = () => {
  const { user } = useAuth();
  const { portfolio, loading, error, refetch } = usePortfolio(user?.id || '');
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<StockPosition | null>(null);

  const handleAddPosition = () => {
    setAddDialogOpen(true);
  };

  const handleEditPosition = (position: StockPosition) => {
    setSelectedPosition(position);
    setEditDialogOpen(true);
  };

  const handleRemovePosition = (position: StockPosition) => {
    setSelectedPosition(position);
    setRemoveDialogOpen(true);
  };

  const handleDialogClose = () => {
    setAddDialogOpen(false);
    setEditDialogOpen(false);
    setRemoveDialogOpen(false);
    setSelectedPosition(null);
  };

  const handleSuccess = () => {
    refetch();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Portfolio Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddPosition}
          disabled={!user}
        >
          Add Position
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!user && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Please log in to manage your portfolio positions.
        </Alert>
      )}

      <Paper sx={{ overflow: 'hidden' }}>
        {portfolio?.positions && portfolio.positions.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Stock</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Avg Cost</TableCell>
                  <TableCell align="right">Current Price</TableCell>
                  <TableCell align="right">Market Value</TableCell>
                  <TableCell align="right">Gain/Loss</TableCell>
                  <TableCell align="right">%</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {portfolio.positions.map((position) => {
                  const costBasis = position.quantity * position.averageCost;
                  const marketValue = position.marketValue || (position.currentPrice ? position.quantity * position.currentPrice : costBasis);
                  const gainLoss = position.gainLoss || (marketValue - costBasis);
                  const gainLossPercent = position.gainLossPercent || ((gainLoss / costBasis) * 100);
                  const isGain = gainLoss >= 0;

                  return (
                    <TableRow key={position.id} hover>
                      <TableCell>
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Chip 
                              label={position.symbol} 
                              size="small" 
                              color="primary"
                            />
                          </Box>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {position.companyName}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {position.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(position.averageCost)}
                      </TableCell>
                      <TableCell align="right">
                        {position.currentPrice ? formatCurrency(position.currentPrice) : 'N/A'}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(marketValue)}
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                          {isGain ? (
                            <TrendingUpIcon fontSize="small" color="success" />
                          ) : (
                            <TrendingDownIcon fontSize="small" color="error" />
                          )}
                          <Typography 
                            variant="body2" 
                            color={isGain ? 'success.main' : 'error.main'}
                            fontWeight="medium"
                          >
                            {formatCurrency(Math.abs(gainLoss))}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography 
                          variant="body2" 
                          color={isGain ? 'success.main' : 'error.main'}
                          fontWeight="medium"
                        >
                          {formatPercent(gainLossPercent)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Edit Position">
                            <IconButton 
                              size="small" 
                              onClick={() => handleEditPosition(position)}
                              color="primary"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove Position">
                            <IconButton 
                              size="small" 
                              onClick={() => handleRemovePosition(position)}
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No positions in your portfolio
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Start building your portfolio by adding your first stock position.
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddPosition}
              disabled={!user}
            >
              Add Your First Position
            </Button>
          </Box>
        )}
      </Paper>

      {/* Dialogs */}
      <AddPosition
        open={addDialogOpen}
        onClose={handleDialogClose}
        onSuccess={handleSuccess}
      />

      <EditPosition
        open={editDialogOpen}
        position={selectedPosition}
        onClose={handleDialogClose}
        onSuccess={handleSuccess}
      />

      <RemovePosition
        open={removeDialogOpen}
        position={selectedPosition}
        onClose={handleDialogClose}
        onSuccess={handleSuccess}
      />
    </Box>
  );
};