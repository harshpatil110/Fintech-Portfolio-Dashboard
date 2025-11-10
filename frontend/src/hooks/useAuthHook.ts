// This file re-exports the auth hook
// Switch between MockAuthContext and AuthContext here

// For demo mode (no backend)
export { useAuth } from '../contexts/MockAuthContext';

// For production mode (with backend), uncomment this instead:
// export { useAuth } from '../contexts/AuthContext';
