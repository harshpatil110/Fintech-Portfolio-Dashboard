import React, { useState } from 'react';
import { Container, Box } from '@mui/material';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { PasswordResetForm } from './PasswordResetForm';

type AuthMode = 'login' | 'register' | 'password-reset';

interface AuthPageProps {
  initialMode?: AuthMode;
  resetToken?: string;
}

export const AuthPage: React.FC<AuthPageProps> = ({ 
  initialMode = 'login',
  resetToken 
}) => {
  const [mode, setMode] = useState<AuthMode>(resetToken ? 'password-reset' : initialMode);

  const switchToLogin = () => setMode('login');
  const switchToRegister = () => setMode('register');
  const switchToPasswordReset = () => setMode('password-reset');

  return (
    <Container maxWidth="sm">
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
        {mode === 'login' && (
          <LoginForm
            onSwitchToRegister={switchToRegister}
            onSwitchToPasswordReset={switchToPasswordReset}
          />
        )}
        
        {mode === 'register' && (
          <RegisterForm onSwitchToLogin={switchToLogin} />
        )}
        
        {mode === 'password-reset' && (
          <PasswordResetForm
            onSwitchToLogin={switchToLogin}
            resetToken={resetToken}
          />
        )}
      </Box>
    </Container>
  );
};