import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Fintech Portfolio API',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        changePassword: 'POST /api/auth/change-password',
        validate: 'POST /api/auth/validate',
        forgotPassword: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password'
      },
      users: {
        profile: 'GET /api/users/profile',
        updateProfile: 'PUT /api/users/profile',
        preferences: 'GET /api/users/preferences',
        updatePreferences: 'PUT /api/users/preferences',
        deleteAccount: 'DELETE /api/users/account',
        emailAvailability: 'GET /api/users/email-availability/:email'
      }
    },
    timestamp: new Date()
  });
});

export default router;