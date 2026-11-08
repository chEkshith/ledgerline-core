import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return (
      <div className="max-w-3xl mx-auto mt-16 p-8 bg-slate-900 border border-red-500/30 rounded-xl text-center">
        <h2 className="text-xl font-bold text-red-400 mb-2">Access Restricted</h2>
        <p className="text-slate-400 text-sm mb-6">
          Your current role (<code className="text-amber-400 font-mono">{user?.role}</code>) does not
          possess sufficient privileges to view this section.
        </p>
        <Navigate to="/" replace />
      </div>
    );
  }

  return children;
}
