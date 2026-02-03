import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Login } from './Login';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * AuthGuard - Protects routes/components that require authentication
 * 
 * Usage:
 * <AuthGuard>
 *   <ProtectedContent />
 * </AuthGuard>
 * 
 * Or with custom fallback:
 * <AuthGuard fallback={<CustomLoginPage />}>
 *   <ProtectedContent />
 * </AuthGuard>
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ children, fallback }) => {
  const { isAuthenticated, isInitialized, isLoading } = useAuth();

  // Show loading state while initializing
  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          {/* Loading spinner */}
          <div className="relative">
            <div className="w-12 h-12 border-4 border-gray-800 rounded-full" />
            <div className="absolute top-0 left-0 w-12 h-12 border-4 border-orange-500 rounded-full border-t-transparent animate-spin" />
          </div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <>{fallback ?? <Login />}</>;
  }

  // Render protected content
  return <>{children}</>;
};

/**
 * Higher-order component version of AuthGuard
 * 
 * Usage:
 * const ProtectedPage = withAuth(MyPage);
 */
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  const WithAuthComponent: React.FC<P> = (props) => {
    return (
      <AuthGuard fallback={fallback}>
        <WrappedComponent {...props} />
      </AuthGuard>
    );
  };

  WithAuthComponent.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithAuthComponent;
}

export default AuthGuard;
