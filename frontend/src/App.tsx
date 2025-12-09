import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { MockAuthProvider } from './contexts/MockAuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './components/dashboard/Dashboard';
import { Portfolio } from './components/portfolio/Portfolio';
import { Watchlist } from './components/watchlist/Watchlist';
import { Analytics } from './components/analytics/Analytics';
import { ErrorBoundary, OfflineIndicator } from './components/common';
import './App.css';
import './styles/responsive.css';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: '44px', // Touch-friendly minimum size
          '@media (max-width: 600px)': {
            minHeight: '48px', // Larger on mobile
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: '44px',
          minHeight: '44px',
          '@media (max-width: 600px)': {
            minWidth: '48px',
            minHeight: '48px',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          '@media (max-width: 900px)': {
            padding: '8px',
            fontSize: '0.875rem',
          },
        },
      },
    },
  },
});

function App() {
  console.log('App component rendering');
  
  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <ToastProvider>
            <MockAuthProvider>
              <OfflineIndicator />
              <Routes>
                {/* Main routes - no auth required for demo */}
                <Route
                  path="/dashboard"
                  element={
                    <Layout>
                      <Dashboard />
                    </Layout>
                  }
                />
                <Route
                  path="/portfolio"
                  element={
                    <Layout>
                      <Portfolio />
                    </Layout>
                  }
                />
                <Route
                  path="/watchlist"
                  element={
                    <Layout>
                      <Watchlist />
                    </Layout>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <Layout>
                      <Analytics />
                    </Layout>
                  }
                />
                
                {/* Default redirect */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                
                {/* Catch all route - redirect to dashboard */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </MockAuthProvider>
          </ToastProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;