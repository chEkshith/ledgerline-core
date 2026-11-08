import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => api.getStoredUser());
  const [token, setToken] = useState(() => api.getStoredToken());
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Handle automatic logout when session expires (401 from API)
  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
      setToken(null);
      setAuthError('Your session has expired. Please log in again.');
    }

    window.addEventListener('ledgerline:session_expired', handleSessionExpired);
    return () => {
      window.removeEventListener('ledgerline:session_expired', handleSessionExpired);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const data = await api.login(email, password);
      setUser(data.user);
      setToken(data.token);
      return data;
    } catch (err) {
      setAuthError(err.message || 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (email, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const data = await api.register(email, password);
      setUser(data.user);
      setToken(data.token);
      return data;
    } catch (err) {
      setAuthError(err.message || 'Registration failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    api.clearAuthStorage();
    setUser(null);
    setToken(null);
    setAuthError(null);
  }, []);

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    authError,
    setAuthError,
    login,
    register,
    logout,
    isAdmin: user?.role === 'admin',
    isAuditor: user?.role === 'auditor',
    isCustomer: user?.role === 'customer',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
