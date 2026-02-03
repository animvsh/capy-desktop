import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';

/**
 * Custom hook for authentication
 * Provides easy access to auth state and actions
 */
export const useAuth = () => {
  const {
    user,
    session,
    isLoading,
    isInitialized,
    error,
    initialize,
    login,
    signup,
    loginWithGoogle,
    logout,
    resetPassword,
    clearError,
  } = useAuthStore();

  // Initialize auth on first mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Computed properties
  const isAuthenticated = !!session && !!user;
  const userEmail = user?.email ?? null;
  const userId = user?.id ?? null;
  const userMetadata = user?.user_metadata ?? {};

  // Wrapped login with validation
  const handleLogin = useCallback(async (email: string, password: string) => {
    if (!email || !password) {
      return { success: false, error: 'Email and password are required' };
    }
    return login(email, password);
  }, [login]);

  // Wrapped signup with validation
  const handleSignup = useCallback(async (email: string, password: string, confirmPassword?: string) => {
    if (!email || !password) {
      return { success: false, error: 'Email and password are required' };
    }
    if (confirmPassword && password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match' };
    }
    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }
    return signup(email, password);
  }, [signup]);

  // Wrapped password reset with validation
  const handleResetPassword = useCallback(async (email: string) => {
    if (!email) {
      return { success: false, error: 'Email is required' };
    }
    return resetPassword(email);
  }, [resetPassword]);

  return {
    // State
    user,
    session,
    isLoading,
    isInitialized,
    error,
    
    // Computed
    isAuthenticated,
    userEmail,
    userId,
    userMetadata,

    // Actions
    login: handleLogin,
    signup: handleSignup,
    loginWithGoogle,
    logout,
    resetPassword: handleResetPassword,
    clearError,
  };
};

/**
 * Hook to require authentication
 * Returns the user or null, and redirects/shows login if not authenticated
 */
export const useRequireAuth = () => {
  const auth = useAuth();
  
  return {
    ...auth,
    // This will be true once we've checked auth and there's no user
    shouldShowLogin: auth.isInitialized && !auth.isAuthenticated,
  };
};

export default useAuth;
