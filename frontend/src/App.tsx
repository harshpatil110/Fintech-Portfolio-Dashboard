import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ProtectedRoute } from './components/routing/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { AuthPage } from './components/auth/AuthPage';
import { UserProfile } from './components/auth/UserProfile';
import { Dashboard } from './components/dashboard/Dashboard';
import { Portfolio } from './components/portfolio/Portfolio';
import { Watchlist } from './components/watchlist/Watchlist';
import { Analytics } from './components/analytics/Analytics';
import StockSelectionExample from './components/examples/StockSelectionExample';
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
            <AuthProvider>
              <OfflineIndicator />
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<AuthPage />} />
                <Route path="/register" element={<AuthPage initialMode="register" />} />
                <Route path="/reset-password" element={<AuthPage initialMode="password-reset" />} />
                
                {/* Protected routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Dashboard />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/portfolio"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Portfolio />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/watchlist"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Watchlist />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Analytics />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <UserProfile />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/examples/stock-selection"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <StockSelectionExample />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                
                {/* Default redirect */}
                <Route path="/" element={<Navigate to="/login" replace />} />
                
                {/* Catch all route - redirect to login */}
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </AuthProvider>
          </ToastProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;