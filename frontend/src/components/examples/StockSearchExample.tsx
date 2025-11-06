import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, Alert } from '@mui/material';
import { StockSearch } from '../common';
import { StockSearchResult } from '../../types/market';

const StockSearchExample: React.FC = () => {
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);

  const handleStockSelect = (stock: StockSearchResult) => {
    setSelectedStock(stock);
    console.log('Selected stock:', stock);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Stock Search Component Demo
      </Typography>
      
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Search for stocks by symbol or company name. The component includes autocomplete,
        debounced search, and validation features.
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Basic Stock Search
          </Typography>
          <StockSearch
            onStockSelect={handleStockSelect}
            placeholder="Search for stocks (e.g., AAPL, Microsoft)"
            autoFocus
          />
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Stock Search with Validation
          </Typography>
          <StockSearch
            onStockSelect={handleStockSelect}
            placeholder="Search with validation enabled"
            showValidation
            maxResults={5}
          />
        </CardContent>
      </Card>

      {selectedStock && (
        <Alert severity="success" sx={{ mt: 2 }}>
          <Typography variant="subtitle2">
            Selected Stock: {selectedStock.symbol} - {selectedStock.companyName}
          </Typography>
          <Typography variant="body2">
            Exchange: {selectedStock.exchange} | Type: {selectedStock.type}
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default StockSearchExample;