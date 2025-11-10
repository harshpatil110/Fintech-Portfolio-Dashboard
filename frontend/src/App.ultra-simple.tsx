import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, AppBar, Toolbar, Typography, Container, Paper } from '@mui/material';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
  },
});

function SimpleDashboard() {
  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Fintech Portfolio Dashboard
          </Typography>
          <Typography variant="body2">
            Harsh Patil
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>
          Welcome, Harsh!
        </Typography>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 3, mt: 3 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" color="primary" gutterBottom>
              Total Portfolio Value
            </Typography>
            <Typography variant="h3">$0.00</Typography>
            <Typography variant="body2" color="text.secondary">
              No positions yet
            </Typography>
          </Paper>
          
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" color="primary" gutterBottom>
              Total Gain/Loss
            </Typography>
            <Typography variant="h3" color="success.main">$0.00</Typography>
            <Typography variant="body2" color="text.secondary">
              0.00%
            </Typography>
          </Paper>
          
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" color="primary" gutterBottom>
              Positions
            </Typography>
            <Typography variant="h3">0</Typography>
            <Typography variant="body2" color="text.secondary">
              Add stocks to get started
            </Typography>
          </Paper>
          
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" color="primary" gutterBottom>
              Watchlist
            </Typography>
            <Typography variant="h3">0</Typography>
            <Typography variant="body2" color="text.secondary">
              Track your favorite stocks
            </Typography>
          </Paper>
        </Box>
        
        <Paper sx={{ p: 3, mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            Getting Started
          </Typography>
          <Typography variant="body1" paragraph>
            Welcome to your Fintech Portfolio Dashboard! Here's what you can do:
          </Typography>
          <Box component="ul" sx={{ pl: 2 }}>
            <Typography component="li" variant="body1" paragraph>
              Add stocks to your portfolio to track their performance
            </Typography>
            <Typography component="li" variant="body1" paragraph>
              Create a watchlist to monitor stocks you're interested in
            </Typography>
            <Typography component="li" variant="body1" paragraph>
              View analytics and performance metrics
            </Typography>
            <Typography component="li" variant="body1">
              Track your gains and losses in real-time
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="*" element={<SimpleDashboard />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
