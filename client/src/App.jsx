import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider } from './components/ui';

import Login from './pages/Login';
import Register from './pages/Register';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import Operations from './pages/Operations';
import TransactionDetail from './pages/TransactionDetail';
import Admin from './pages/Admin';
import Health from './pages/Health';

function AppFrame() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const isLandingPage = location.pathname === '/';
  const showShell = isAuthenticated && !isAuthPage && !isLandingPage;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      {showShell && <Navbar />}

      <div className={`flex flex-1 flex-col ${showShell ? 'lg:pl-64' : ''}`}>
        <main
          className={
            showShell
              ? 'mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8'
              : 'flex flex-1 flex-col'
          }
        >
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route
              path="/"
              element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Landing />}
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/accounts"
              element={
                <ProtectedRoute>
                  <Accounts />
                </ProtectedRoute>
              }
            />

            <Route
              path="/accounts/:id"
              element={
                <ProtectedRoute>
                  <AccountDetail />
                </ProtectedRoute>
              }
            />

            <Route
              path="/operations"
              element={
                <ProtectedRoute>
                  <Operations />
                </ProtectedRoute>
              }
            />

            <Route
              path="/transactions/:id"
              element={
                <ProtectedRoute>
                  <TransactionDetail />
                </ProtectedRoute>
              }
            />

            <Route
              path="/health"
              element={
                <ProtectedRoute>
                  <Health />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Admin />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {showShell && (
          <footer className="border-t border-line bg-surface/60">
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <span className="font-semibold text-ink-soft">LedgerLine Core</span>
              <span>Integer paise arithmetic · Double-entry reconciliation · Idempotent money movement</span>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppFrame />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
