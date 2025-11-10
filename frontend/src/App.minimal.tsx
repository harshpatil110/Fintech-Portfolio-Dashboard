import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthPage } from './components/auth/AuthPage';
import { ErrorBoundary } from './components/common';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
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
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<AuthPage />} />
                <Route path="/register" element={<AuthPage initialMode="register" />} />
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
