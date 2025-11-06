import React from 'react';
import { Typography, Paper, Box } from '@mui/material';

export const Analytics: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Analytics & Performance
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Typography variant="body1">
          View detailed analytics, performance charts, and historical data for your portfolio.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Analytics components will be implemented in future tasks.
        </Typography>
      </Paper>
    </Box>
  );
};