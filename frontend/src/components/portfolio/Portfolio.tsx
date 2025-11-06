import React from 'react';
import { Typography, Paper, Box } from '@mui/material';

export const Portfolio: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Portfolio Management
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Typography variant="body1">
          Manage your stock positions here. Add, edit, or remove positions from your portfolio.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Portfolio management components will be implemented in future tasks.
        </Typography>
      </Paper>
    </Box>
  );
};