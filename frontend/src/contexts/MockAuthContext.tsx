import React, { createContext, useContext, ReactNode } from 'react';
import { User } from '../types/auth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: any) => Promise<void>;
  register: (userData: any) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: any) => Promise<void>;
}

const MockAuthContext = createContext<AuthContextType | undefined>(undefined);

// Export as useAuth so it works with existing components
export const useAuth = (): AuthContextType => {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error('useAuth must be used within a MockAuthProvider');
  }
  return context;
};

interface MockAuthProviderProps {
  children: ReactNode;
}

// Mock user data
const mockUser: User = {
  id: 'mock-user-id-123',
  email: 'harsh@example.com',
  firstName: 'Harsh',
  lastName: 'Patil',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const MockAuthProvider: React.FC<MockAuthProviderProps> = ({ children }) => {
  const value: AuthContextType = {
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    login: async () => {},
    register: async () => {},
    logout: async () => {},
    updateProfile: async () => {},
  };

  return <MockAuthContext.Provider value={value}>{children}</MockAuthContext.Provider>;
};
