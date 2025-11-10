import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Paper,
  CircularProgress,
  Divider,
} from '@mui/material';
import { UpdateProfileData } from '../../types/auth';
import { validateEmail, validateName } from '../../utils/validation';
import { useAuth } from '../../hooks/useAuthHook';

export const UserProfile: React.FC = () => {
  const { user, updateProfile, logout, isLoading } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState<UpdateProfileData>({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
  });
  
  const [errors, setErrors] = useState<Partial<UpdateProfileData>>({});
  const [submitError, setSubmitError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const handleInputChange = (field: keyof UpdateProfileData) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    // Clear messages
    if (submitError) {
      setSubmitError('');
    }
    if (successMessage) {
      setSuccessMessage('');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<UpdateProfileData> = {};

    // Validate first name
    const firstNameValidation = validateName(formData.firstName, 'First name');
    if (!firstNameValidation.isValid) {
      newErrors.firstName = firstNameValidation.errors[0];
    }

    // Validate last name
    const lastNameValidation = validateName(formData.lastName, 'Last name');
    if (!lastNameValidation.isValid) {
      newErrors.lastName = lastNameValidation.errors[0];
    }

    // Validate email
    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.isValid) {
      newErrors.email = emailValidation.errors[0];
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEdit = () => {
    setIsEditing(true);
    setFormData({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
    });
    setErrors({});
    setSubmitError('');
    setSuccessMessage('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
    });
    setErrors({});
    setSubmitError('');
    setSuccessMessage('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile(formData);
      setIsEditing(false);
      setSuccessMessage('Profile updated successfully!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || 
                          error.message || 
                          'Failed to update profile. Please try again.';
      setSubmitError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!user) {
    return (
      <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: 'auto', mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          User Profile
        </Typography>
        <Alert severity="error">
          No user data available. Please sign in again.
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        User Profile
      </Typography>

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {submitError}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label="First Name"
          value={formData.firstName}
          onChange={handleInputChange('firstName')}
          error={!!errors.firstName}
          helperText={errors.firstName}
          margin="normal"
          required
          disabled={!isEditing}
          InputProps={{
            readOnly: !isEditing,
          }}
        />

        <TextField
          fullWidth
          label="Last Name"
          value={formData.lastName}
          onChange={handleInputChange('lastName')}
          error={!!errors.lastName}
          helperText={errors.lastName}
          margin="normal"
          required
          disabled={!isEditing}
          InputProps={{
            readOnly: !isEditing,
          }}
        />

        <TextField
          fullWidth
          label="Email Address"
          type="email"
          value={formData.email}
          onChange={handleInputChange('email')}
          error={!!errors.email}
          helperText={errors.email}
          margin="normal"
          required
          disabled={!isEditing}
          InputProps={{
            readOnly: !isEditing,
          }}
        />

        <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {!isEditing ? (
            <Button
              variant="contained"
              onClick={handleEdit}
              disabled={isLoading}
            >
              Edit Profile
            </Button>
          ) : (
            <>
              <Button
                type="submit"
                variant="contained"
                disabled={isSaving}
              >
                {isSaving ? <CircularProgress size={24} /> : 'Save Changes'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </>
          )}
        </Box>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box>
        <Typography variant="h6" gutterBottom>
          Account Information
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Member since: {new Date(user.createdAt).toLocaleDateString()}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Last updated: {new Date(user.updatedAt).toLocaleDateString()}
        </Typography>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box>
        <Typography variant="h6" gutterBottom>
          Account Actions
        </Typography>
        <Button
          variant="outlined"
          color="error"
          onClick={handleLogout}
          disabled={isLoading}
        >
          Sign Out
        </Button>
      </Box>
    </Paper>
  );
};