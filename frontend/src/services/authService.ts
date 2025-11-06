import axios from 'axios';
import { 
  AuthResponse, 
  LoginCredentials, 
  RegisterData, 
  PasswordResetRequest, 
  PasswordResetData,
  UpdateProfileData,
  User
} from '../types/auth';
import { AuthTokenManager, getAuthHeader } from '../utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const authApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
authApi.interceptors.request.use((config) => {
  const authHeader = getAuthHeader();
  if ('Authorization' in authHeader) {
    config.headers.Authorization = authHeader.Authorization;
  }
  return config;
});

// Response interceptor to handle token refresh
authApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = AuthTokenManager.getRefreshToken();
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken
          });
          
          const { token, refreshToken: newRefreshToken } = response.data;
          const user = AuthTokenManager.getUser();
          
          if (user) {
            AuthTokenManager.setTokens({
              user,
              token,
              refreshToken: newRefreshToken
            });
            
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return authApi(originalRequest);
          }
        }
      } catch (refreshError) {
        AuthTokenManager.clearTokens();
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await authApi.post('/auth/login', credentials);
    const authResponse = response.data;
    AuthTokenManager.setTokens(authResponse);
    return authResponse;
  },

  async register(userData: RegisterData): Promise<AuthResponse> {
    const response = await authApi.post('/auth/register', userData);
    const authResponse = response.data;
    AuthTokenManager.setTokens(authResponse);
    return authResponse;
  },

  async logout(): Promise<void> {
    try {
      await authApi.post('/auth/logout');
    } finally {
      AuthTokenManager.clearTokens();
    }
  },

  async requestPasswordReset(data: PasswordResetRequest): Promise<void> {
    await authApi.post('/auth/password-reset-request', data);
  },

  async resetPassword(data: PasswordResetData): Promise<void> {
    await authApi.post('/auth/password-reset', data);
  },

  async updateProfile(data: UpdateProfileData): Promise<User> {
    const response = await authApi.put('/auth/profile', data);
    const updatedUser = response.data.user;
    
    // Update stored user data
    const currentAuth = {
      user: updatedUser,
      token: AuthTokenManager.getToken()!,
      refreshToken: AuthTokenManager.getRefreshToken()!
    };
    AuthTokenManager.setTokens(currentAuth);
    
    return updatedUser;
  },

  async getCurrentUser(): Promise<User> {
    const response = await authApi.get('/auth/me');
    return response.data.user;
  },

  isAuthenticated(): boolean {
    return AuthTokenManager.isAuthenticated();
  },

  getCurrentUserFromStorage(): User | null {
    return AuthTokenManager.getUser();
  }
};