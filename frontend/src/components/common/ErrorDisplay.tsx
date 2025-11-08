import { Alert, AlertTitle, Box, Button, Collapse } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useState } from 'react';

interface ErrorDisplayProps {
  error: Error | string | null;
  title?: string;
  onRetry?: () => void;
  showDetails?: boolean;
  severity?: 'error' | 'warning' | 'info';
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  title = 'Error',
  onRetry,
  showDetails = false,
  severity = 'error',
}) => {
  const [showFullError, setShowFullError] = useState(false);

  if (!error) return null;

  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? null : error.stack;

  return (
    <Box sx={{ my: 2 }}>
      <Alert 
        severity={severity}
        action={
          onRetry && (
            <Button
              color="inherit"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={onRetry}
            >
              Retry
            </Button>
          )
        }
      >
        <AlertTitle>{title}</AlertTitle>
        {errorMessage}
        
        {showDetails && errorStack && (
          <>
            <Button
              size="small"
              onClick={() => setShowFullError(!showFullError)}
              sx={{ mt: 1, p: 0, minWidth: 'auto' }}
            >
              {showFullError ? 'Hide' : 'Show'} Details
            </Button>
            <Collapse in={showFullError}>
              <Box
                component="pre"
                sx={{
                  mt: 1,
                  p: 1,
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: 200,
                }}
              >
                {errorStack}
              </Box>
            </Collapse>
          </>
        )}
      </Alert>
    </Box>
  );
};

export default ErrorDisplay;
