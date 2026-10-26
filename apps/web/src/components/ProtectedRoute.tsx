import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type UserRole = 'ADMIN' | 'CLIENT_OWNER' | 'CLIENT_VIEWER' | 'CLIENT_RECEPTIONIST';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole | UserRole[];
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="flex items-center gap-3 text-sm text-[#777169]">
          <svg className="w-5 h-5 animate-spin text-[#0c0a09]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(user.role)) {
      if (user.role === 'ADMIN') {
        return <Navigate to="/admin" replace />;
      }
      if (user.role === 'CLIENT_RECEPTIONIST') {
        const slug = user.tenantSlug || '';
        return <Navigate to={slug ? `/${slug}/receptionist` : '/receptionist'} replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
  }
  
  return <>{children}</>;
}
