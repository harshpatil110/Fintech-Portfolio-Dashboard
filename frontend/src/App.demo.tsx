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
import { UserProfile } from './components/auth/UserProfile';
import { ErrorBoundary } from './components/common';

// Re-export useAuth from MockAuthContext for components to use
export { useAuth } from './contexts/MockAuthContext';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <ToastProvider>
            <MockAuthProvider>
              <Layout>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/portfolio" element={<Portfolio />} />
                  <Route path="/watchlist" element={<Watchlist />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/profile" element={<UserProfile />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Layout>
            </MockAuthProvider>
          </ToastProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
