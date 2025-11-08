import { useEffect } from 'react';
import { Alert, Snackbar } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import WifiIcon from '@mui/icons-material/Wifi';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../contexts/ToastContext';

const OfflineIndicator: React.FC = () => {
  const { isOnline, wasOffline } = useOnlineStatus();
  const { showWarning, showSuccess } = useToast();

  useEffect(() => {
    if (!isOnline) {
      showWarning('You are currently offline. Some features may be unavailable.');
    } else if (wasOffline) {
      showSuccess('Connection restored! You are back online.');
    }
  }, [isOnline, wasOffline, showWarning, showSuccess]);

  return (
    <Snackbar
      open={!isOnline}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        severity="warning"
        icon={<WifiOffIcon />}
        sx={{ width: '100%' }}
      >
        You are offline. Some features may not work properly.
      </Alert>
    </Snackbar>
  );
};

export default OfflineIndicator;
