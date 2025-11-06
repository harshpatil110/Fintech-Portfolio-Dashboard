import React from 'react';
import { Typography, Paper, Box } from '@mui/material';

export const Watchlist: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Watchlist
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Typography variant="body1">
          Monitor stocks you're interested in without owning them. Track prices and add to portfolio when ready.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Watchlist components will be implemented in future tasks.
        </Typography>
      </Paper>
    </Box>
  );
};