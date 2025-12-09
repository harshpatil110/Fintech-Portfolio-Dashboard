import { 
  AuthResponse, 
  LoginCredentials, 
  RegisterData, 
  PasswordResetRequest, 
  PasswordResetData,
  UpdateProfileData,
  User
} from '../types/auth';
import { AuthTokenManager } from '../utils/auth';
import { noRetryApiClient, apiCall } from '../utils/apiClient';

// Use no-retry client for auth operations (they're not idempotent)
const authApi = noRetryApiClient;

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const authResponse = await apiCall(() => authApi.post<AuthResponse>('/auth/login', credentials));
    AuthTokenManager.setTokens(authResponse);
    return authResponse;
  },

  async register(userData: RegisterData): Promise<AuthResponse> {
    const authResponse = await apiCall(() => authApi.post<AuthResponse>('/auth/register', userData));
    AuthTokenManager.setTokens(authResponse);
    return authResponse;
  },

  async logout(): Promise<void> {
    try {
      await apiCall(() => authApi.post('/auth/logout'));
    } finally {
      AuthTokenManager.clearTokens();
    }
  },

  async requestPasswordReset(data: PasswordResetRequest): Promise<void> {
    await apiCall(() => authApi.post('/auth/password-reset-request', data));
  },

  async resetPassword(data: PasswordResetData): Promise<void> {
    await apiCall(() => authApi.post('/auth/password-reset', data));
  },

  async updateProfile(data: UpdateProfileData): Promise<User> {
    const response = await apiCall(() => authApi.put<{ user: User }>('/auth/profile', data));
    const updatedUser = response.user;
    
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
    const response = await apiCall(() => authApi.get<{ user: User }>('/auth/me'));
    return response.user;
  },

  isAuthenticated(): boolean {
    return AuthTokenManager.isAuthenticated();
  },

  getCurrentUserFromStorage(): User | null {
    return AuthTokenManager.getUser();
  }
};