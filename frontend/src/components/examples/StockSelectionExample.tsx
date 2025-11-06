import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Tabs,
  Tab,
  Paper,
  Alert
} from '@mui/material';
import { StockSelection } from '../common';
import { StockSearchResult } from '../../types/market';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`stock-selection-tabpanel-${index}`}
      aria-labelledby={`stock-selection-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
};

const StockSelectionExample: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [portfolioStocks, setPortfolioStocks] = useState<StockSearchResult[]>([]);
  const [watchlistStocks, setWatchlistStocks] = useState<StockSearchResult[]>([]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleAddToPortfolio = async (stock: StockSearchResult) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if stock already exists
    if (portfolioStocks.some(s => s.symbol === stock.symbol)) {
      throw new Error(`${stock.symbol} is already in your portfolio`);
    }
    
    setPortfolioStocks(prev => [...prev, stock]);
  };

  const handleAddToWatchlist = async (stock: StockSearchResult) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Check if stock already exists
    if (watchlistStocks.some(s => s.symbol === stock.symbol)) {
      throw new Error(`${stock.symbol} is already in your watchlist`);
    }
    
    // Check watchlist limit
    if (watchlistStocks.length >= 50) {
      throw new Error('Watchlist is full (maximum 50 stocks)');
    }
    
    setWatchlistStocks(prev => [...prev, stock]);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Stock Selection Examples
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        This page demonstrates the StockSelection component in different configurations.
      </Typography>

      <Paper sx={{ width: '100%', mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="Inline Variant" />
          <Tab label="Modal Variant" />
          <Tab label="Portfolio Only" />
          <Tab label="Watchlist Only" />
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        <StockSelection
          onAddToPortfolio={handleAddToPortfolio}
          onAddToWatchlist={handleAddToWatchlist}
          title="Add Stocks to Portfolio or Watchlist"
          subtitle="Search for stocks and add them to your portfolio or watchlist with detailed company information"
          variant="inline"
        />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Modal variant shows stock details in a popup dialog when a stock is selected.
          </Alert>
          <StockSelection
            onAddToPortfolio={handleAddToPortfolio}
            onAddToWatchlist={handleAddToWatchlist}
            variant="modal"
          />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <StockSelection
          onAddToPortfolio={handleAddToPortfolio}
          title="Add Stocks to Portfolio"
          subtitle="Search and add stocks to your investment portfolio"
          showPortfolioAction={true}
          showWatchlistAction={false}
          variant="inline"
        />
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <StockSelection
          onAddToWatchlist={handleAddToWatchlist}
          title="Add Stocks to Watchlist"
          subtitle="Search and add stocks to monitor in your watchlist"
          showPortfolioAction={false}
          showWatchlistAction={true}
          variant="inline"
        />
      </TabPanel>

      {/* Current State Display */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Current State (Demo)
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Paper sx={{ p: 2, flex: 1, minWidth: 250 }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Portfolio ({portfolioStocks.length})
            </Typography>
            {portfolioStocks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No stocks in portfolio
              </Typography>
            ) : (
              portfolioStocks.map((stock, index) => (
                <Box key={index} sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight="medium">
                    {stock.symbol} - {stock.companyName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stock.exchange}
                  </Typography>
                </Box>
              ))
            )}
          </Paper>

          <Paper sx={{ p: 2, flex: 1, minWidth: 250 }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Watchlist ({watchlistStocks.length}/50)
            </Typography>
            {watchlistStocks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No stocks in watchlist
              </Typography>
            ) : (
              watchlistStocks.map((stock, index) => (
                <Box key={index} sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight="medium">
                    {stock.symbol} - {stock.companyName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stock.exchange}
                  </Typography>
                </Box>
              ))
            )}
          </Paper>
        </Box>
      </Box>
    </Container>
  );
};

export default StockSelectionExample;