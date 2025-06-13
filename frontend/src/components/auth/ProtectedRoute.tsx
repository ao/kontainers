import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { UserRole } from 'kontainers-shared';

interface ProtectedRouteProps {
  requiredRole?: UserRole;
}

/**
 * A wrapper component that protects routes requiring authentication
 * Redirects to login if user is not authenticated
 * Can also check for specific roles if requiredRole is provided
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredRole }) => {
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const location = useLocation();
  
  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-700">Verifying authentication...</p>
        </div>
      </div>
    );
  }
  
  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // If role check is required and user doesn't have the required role
  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  // If authenticated and has required role, render the child routes
  return <Outlet />;
};

export default ProtectedRoute;