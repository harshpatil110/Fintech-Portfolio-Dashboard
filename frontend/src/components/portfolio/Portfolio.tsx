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
  Tooltip,
  Checkbox,
  Toolbar,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  History as HistoryIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { usePortfolio } from '../../hooks/usePortfolio';
import { StockPosition, PortfolioFilters } from '../../types/portfolio';
import { portfolioService } from '../../services/portfolioService';
import { AddPosition } from './AddPosition';
import { EditPosition } from './EditPosition';
import { RemovePosition } from './RemovePosition';
import { TransactionHistoryComponent } from './TransactionHistory';
import { BulkOperations } from './BulkOperations';
import { PortfolioFiltersComponent } from './PortfolioFilters';

export const Portfolio: React.FC = () => {
  const { user } = useAuth();
  const { data: portfolioData, isLoading: loading, error, refetch } = usePortfolio(user?.id || '');
  const portfolio = portfolioData?.data?.portfolio;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<StockPosition | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<StockPosition[]>([]);
  const [filteredPositions, setFilteredPositions] = useState<StockPosition[]>([]);
  const [filters, setFilters] = useState<PortfolioFilters>({
    sortBy: 'symbol',
    sortOrder: 'asc'
  });
  const [filtersLoading, setFiltersLoading] = useState(false);

  // Initialize filtered positions when portfolio changes
  useEffect(() => {
    if (portfolio?.positions) {
      setFilteredPositions(portfolio.positions);
    }
  }, [portfolio?.positions]);

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

  const handleShowHistory = () => {
    setHistoryDialogOpen(true);
  };

  const handleBulkOperations = () => {
    setBulkDialogOpen(true);
  };

  const handleDialogClose = () => {
    setAddDialogOpen(false);
    setEditDialogOpen(false);
    setRemoveDialogOpen(false);
    setHistoryDialogOpen(false);
    setBulkDialogOpen(false);
    setSelectedPosition(null);
  };

  const handleSuccess = () => {
    refetch();
    setSelectedPositions([]);
    applyFilters();
  };

  const handleSelectPosition = (position: StockPosition, checked: boolean) => {
    if (checked) {
      setSelectedPositions([...selectedPositions, position]);
    } else {
      setSelectedPositions(selectedPositions.filter(p => p.id !== position.id));
    }
  };

  const handleSelectAll = () => {
    if (selectedPositions.length === filteredPositions.length) {
      setSelectedPositions([]);
    } else {
      setSelectedPositions([...filteredPositions]);
    }
  };

  const applyFilters = async () => {
    if (!user?.id) return;

    setFiltersLoading(true);
    try {
      const filtered = await portfolioService.getFilteredPositions(user.id, filters);
      setFilteredPositions(filtered);
    } catch (err) {
      console.error('Failed to apply filters:', err);
      // Fallback to original positions
      if (portfolio?.positions) {
        setFilteredPositions(portfolio.positions);
      }
    } finally {
      setFiltersLoading(false);
    }
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
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'flex-start' : 'center', 
        mb: isMobile ? 2 : 3,
        gap: isMobile ? 2 : 0,
      }}>
        <Typography variant={isMobile ? 'h5' : 'h4'} component="h1">
          Portfolio Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {!isMobile && (
            <Button
              variant="outlined"
              startIcon={<HistoryIcon />}
              onClick={handleShowHistory}
              disabled={!user}
            >
              History
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddPosition}
            disabled={!user}
            size={isMobile ? 'medium' : 'medium'}
          >
            {isMobile ? 'Add' : 'Add Position'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error.message || 'An error occurred while loading your portfolio'}
        </Alert>
      )}

      {!user && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Please log in to manage your portfolio positions.
        </Alert>
      )}

      {/* Filters */}
      {portfolio?.positions && portfolio.positions.length > 0 && (
        <PortfolioFiltersComponent
          filters={filters}
          onFiltersChange={setFilters}
          onApplyFilters={applyFilters}
          availableSymbols={portfolio.positions.map((p: StockPosition) => p.symbol)}
        />
      )}

      <Paper sx={{ overflow: 'hidden' }}>
        {/* Bulk Operations Toolbar */}
        {selectedPositions.length > 0 && (
          <Toolbar sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
            <Typography variant={isMobile ? 'body1' : 'h6'} sx={{ flex: 1 }}>
              {selectedPositions.length} position{selectedPositions.length > 1 ? 's' : ''} selected
            </Typography>
            <Button
              color="inherit"
              startIcon={<SettingsIcon />}
              onClick={handleBulkOperations}
              size={isMobile ? 'small' : 'medium'}
            >
              {isMobile ? 'Bulk' : 'Bulk Operations'}
            </Button>
          </Toolbar>
        )}

        {filteredPositions.length > 0 ? (
          isMobile ? (
            // Mobile Card View
            <Box sx={{ p: 2 }}>
              <Stack spacing={2}>
                {(filtersLoading ? portfolio?.positions || [] : filteredPositions).map((position: StockPosition) => {
                  const costBasis = position.quantity * position.averageCost;
                  const marketValue = position.marketValue || (position.currentPrice ? position.quantity * position.currentPrice : costBasis);
                  const gainLoss = position.gainLoss || (marketValue - costBasis);
                  const gainLossPercent = position.gainLossPercent || ((gainLoss / costBasis) * 100);
                  const isGain = gainLoss >= 0;

                  return (
                    <Card key={position.id} variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Chip label={position.symbol} size="small" color="primary" />
                              <Checkbox
                                size="small"
                                checked={selectedPositions.some(p => p.id === position.id)}
                                onChange={(e) => handleSelectPosition(position, e.target.checked)}
                              />
                            </Box>
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {position.companyName}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <IconButton 
                              size="small" 
                              onClick={() => handleEditPosition(position)}
                              color="primary"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              onClick={() => handleRemovePosition(position)}
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                        
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Quantity</Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {position.quantity.toLocaleString()}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Avg Cost</Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {formatCurrency(position.averageCost)}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Current Price</Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {position.currentPrice ? formatCurrency(position.currentPrice) : 'N/A'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Market Value</Typography>
                            <Typography variant="body2" fontWeight="medium">
                              {formatCurrency(marketValue)}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Gain/Loss</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Percentage</Typography>
                            <Typography 
                              variant="body2" 
                              color={isGain ? 'success.main' : 'error.main'}
                              fontWeight="medium"
                            >
                              {formatPercent(gainLossPercent)}
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </Box>
          ) : (
            // Desktop Table View
            <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selectedPositions.length > 0 && selectedPositions.length < filteredPositions.length}
                      checked={filteredPositions.length > 0 && selectedPositions.length === filteredPositions.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
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
                {(filtersLoading ? portfolio?.positions || [] : filteredPositions).map((position: StockPosition) => {
                  const costBasis = position.quantity * position.averageCost;
                  const marketValue = position.marketValue || (position.currentPrice ? position.quantity * position.currentPrice : costBasis);
                  const gainLoss = position.gainLoss || (marketValue - costBasis);
                  const gainLossPercent = position.gainLossPercent || ((gainLoss / costBasis) * 100);
                  const isGain = gainLoss >= 0;

                  return (
                    <TableRow key={position.id} hover selected={selectedPositions.some(p => p.id === position.id)}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedPositions.some(p => p.id === position.id)}
                          onChange={(e) => handleSelectPosition(position, e.target.checked)}
                        />
                      </TableCell>
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
          )
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {portfolio?.positions && portfolio.positions.length > 0 
                ? 'No positions match your current filters'
                : 'No positions in your portfolio'
              }
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {portfolio?.positions && portfolio.positions.length > 0 
                ? 'Try adjusting your filters to see more positions.'
                : 'Start building your portfolio by adding your first stock position.'
              }
            </Typography>
            {(!portfolio?.positions || portfolio.positions.length === 0) && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddPosition}
                disabled={!user}
              >
                Add Your First Position
              </Button>
            )}
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

      <TransactionHistoryComponent
        open={historyDialogOpen}
        onClose={handleDialogClose}
      />

      <BulkOperations
        open={bulkDialogOpen}
        onClose={handleDialogClose}
        selectedPositions={selectedPositions}
        onSuccess={handleSuccess}
      />
    </Box>
  );
};