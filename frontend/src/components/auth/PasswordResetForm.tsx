import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Paper,
  Link,
  CircularProgress,
} from '@mui/material';
import { PasswordResetRequest, PasswordResetData } from '../../types/auth';
import { validateEmail, validatePassword, validatePasswordConfirmation } from '../../utils/validation';
import { authService } from '../../services/authService';

interface PasswordResetFormProps {
  onSwitchToLogin: () => void;
  resetToken?: string;
}

export const PasswordResetForm: React.FC<PasswordResetFormProps> = ({
  onSwitchToLogin,
  resetToken,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isRequestSent, setIsRequestSent] = useState(false);
  const [isResetComplete, setIsResetComplete] = useState(false);
  
  // Request form state
  const [requestData, setRequestData] = useState<PasswordResetRequest>({
    email: '',
  });
  const [requestErrors, setRequestErrors] = useState<Partial<PasswordResetRequest>>({});
  
  // Reset form state
  const [resetData, setResetData] = useState<PasswordResetData>({
    token: resetToken || '',
    password: '',
    confirmPassword: '',
  });
  const [resetErrors, setResetErrors] = useState<Partial<PasswordResetData>>({});
  
  const [submitError, setSubmitError] = useState<string>('');

  const handleRequestInputChange = (field: keyof PasswordResetRequest) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setRequestData(prev => ({ ...prev, [field]: value }));
    
    if (requestErrors[field]) {
      setRequestErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    if (submitError) {
      setSubmitError('');
    }
  };

  const handleResetInputChange = (field: keyof PasswordResetData) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setResetData(prev => ({ ...prev, [field]: value }));
    
    if (resetErrors[field]) {
      setResetErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    if (submitError) {
      setSubmitError('');
    }
  };

  const validateRequestForm = (): boolean => {
    const newErrors: Partial<PasswordResetRequest> = {};

    const emailValidation = validateEmail(requestData.email);
    if (!emailValidation.isValid) {
      newErrors.email = emailValidation.errors[0];
    }

    setRequestErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateResetForm = (): boolean => {
    const newErrors: Partial<PasswordResetData> = {};

    if (!resetData.token) {
      newErrors.token = 'Reset token is required';
    }

    const passwordValidation = validatePassword(resetData.password);
    if (!passwordValidation.isValid) {
      newErrors.password = passwordValidation.errors[0];
    }

    const confirmPasswordValidation = validatePasswordConfirmation(
      resetData.password,
      resetData.confirmPassword
    );
    if (!confirmPasswordValidation.isValid) {
      newErrors.confirmPassword = confirmPasswordValidation.errors[0];
    }

    setResetErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRequestSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateRequestForm()) {
      return;
    }

    setIsLoading(true);
    try {
      await authService.requestPasswordReset(requestData);
      setIsRequestSent(true);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || 
                          error.message || 
                          'Failed to send reset email. Please try again.';
      setSubmitError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateResetForm()) {
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword(resetData);
      setIsResetComplete(true);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || 
                          error.message || 
                          'Failed to reset password. Please try again.';
      setSubmitError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (isResetComplete) {
    return (
      <Paper elevation={3} sx={{ p: 4, maxWidth: 400, mx: 'auto', mt: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Password Reset Complete
        </Typography>
        
        <Alert severity="success" sx={{ mb: 2 }}>
          Your password has been successfully reset. You can now sign in with your new password.
        </Alert>

        <Button
          fullWidth
          variant="contained"
          onClick={onSwitchToLogin}
          sx={{ mt: 2 }}
        >
          Sign In
        </Button>
      </Paper>
    );
  }

  if (isRequestSent && !resetToken) {
    return (
      <Paper elevation={3} sx={{ p: 4, maxWidth: 400, mx: 'auto', mt: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Check Your Email
        </Typography>
        
        <Alert severity="info" sx={{ mb: 2 }}>
          We've sent a password reset link to {requestData.email}. 
          Please check your email and follow the instructions to reset your password.
        </Alert>

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Link
            component="button"
            type="button"
            onClick={onSwitchToLogin}
          >
            Back to Sign In
          </Link>
        </Box>
      </Paper>
    );
  }

  if (resetToken) {
    return (
      <Paper elevation={3} sx={{ p: 4, maxWidth: 400, mx: 'auto', mt: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Reset Password
        </Typography>
        
        <Box component="form" onSubmit={handleResetSubmit} sx={{ mt: 2 }}>
          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {submitError}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Reset Token"
            value={resetData.token}
            onChange={handleResetInputChange('token')}
            error={!!resetErrors.token}
            helperText={resetErrors.token}
            margin="normal"
            required
            disabled={!!resetToken}
          />

          <TextField
            fullWidth
            label="New Password"
            type="password"
            value={resetData.password}
            onChange={handleResetInputChange('password')}
            error={!!resetErrors.password}
            helperText={resetErrors.password}
            margin="normal"
            required
            autoComplete="new-password"
          />

          <TextField
            fullWidth
            label="Confirm New Password"
            type="password"
            value={resetData.confirmPassword}
            onChange={handleResetInputChange('confirmPassword')}
            error={!!resetErrors.confirmPassword}
            helperText={resetErrors.confirmPassword}
            margin="normal"
            required
            autoComplete="new-password"
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={24} /> : 'Reset Password'}
          </Button>

          <Box sx={{ textAlign: 'center' }}>
            <Link
              component="button"
              type="button"
              onClick={onSwitchToLogin}
            >
              Back to Sign In
            </Link>
          </Box>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 400, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Reset Password
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter your email address and we'll send you a link to reset your password.
      </Typography>
      
      <Box component="form" onSubmit={handleRequestSubmit} sx={{ mt: 2 }}>
        {submitError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {submitError}
          </Alert>
        )}

        <TextField
          fullWidth
          label="Email Address"
          type="email"
          value={requestData.email}
          onChange={handleRequestInputChange('email')}
          error={!!requestErrors.email}
          helperText={requestErrors.email}
          margin="normal"
          required
          autoComplete="email"
          autoFocus
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 3, mb: 2 }}
          disabled={isLoading}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Send Reset Link'}
        </Button>

        <Box sx={{ textAlign: 'center' }}>
          <Link
            component="button"
            type="button"
            onClick={onSwitchToLogin}
          >
            Back to Sign In
          </Link>
        </Box>
      </Box>
    </Paper>
  );
};