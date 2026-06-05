import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

function ProtectedRoute({ allowedRoles, children }) {
  const { authLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="container">
        <div className="empty-panel auth-guard">
          Verification de votre acces a la plateforme en cours...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to={user?.role === 'regie' ? '/regie' : '/source'} replace />;
  }

  return children;
}

export default ProtectedRoute;
