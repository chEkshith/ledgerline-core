import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import { ButtonLink, Card, EmptyState } from './ui';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return (
      <div className="mx-auto max-w-2xl py-10 animate-fadeIn">
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Access restricted"
            description={`Your current role (${user?.role || 'unknown'}) does not have permission to view this section.`}
            action={
              <ButtonLink to="/dashboard" variant="secondary" size="sm">
                Back to dashboard
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  return children;
}
