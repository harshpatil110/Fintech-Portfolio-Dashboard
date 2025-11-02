import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import marketRoutes from './market';
import portfolioRoutes from './portfolio';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/market', marketRoutes);
router.use('/portfolio', portfolioRoutes);

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
      },
      market: {
        quote: 'GET /api/market/quote/:symbol',
        batchQuotes: 'POST /api/market/quotes',
        search: 'GET /api/market/search?q=query',
        history: 'GET /api/market/history/:symbol?period=daily',
        validate: 'GET /api/market/validate/:symbol',
        status: 'GET /api/market/status'
      },
      portfolio: {
        addPosition: 'POST /api/portfolio/position',
        updatePosition: 'PUT /api/portfolio/position/:id',
        removePosition: 'DELETE /api/portfolio/position/:id'
      }
    },
    timestamp: new Date()
  });
});

export default router;