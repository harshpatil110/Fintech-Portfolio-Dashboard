import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Box, Button, Container, Typography } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
  },
});

function LoginPage() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        gap: 2
      }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Fintech Portfolio Dashboard
        </Typography>
        <Typography variant="h5" color="text.secondary" gutterBottom>
          Login Page
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
          <Button variant="contained" size="large">
            Login
          </Button>
          <Button variant="outlined" size="large">
            Register
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

function SimpleApp() {
  console.log('SimpleApp rendering');
  
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default SimpleApp;
