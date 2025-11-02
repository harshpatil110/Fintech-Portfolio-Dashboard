export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  id: string;
  userId: string;
  currency: string;
  timezone: string;
  dashboardLayout: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface UpdateUserPreferencesRequest {
  currency?: string;
  timezone?: string;
  dashboardLayout?: string[];
}