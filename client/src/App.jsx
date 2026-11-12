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
    <div className="relative isolate flex min-h-screen flex-col bg-canvas text-ink">
      {showShell && (
        <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
          <div className="paper-grid absolute inset-0 opacity-40" />
          <div
            className="absolute inset-x-0 top-0 h-[520px]"
            style={{
              background:
                'radial-gradient(620px circle at 82% 0%, rgba(168,121,43,0.07), transparent 66%), radial-gradient(720px circle at 12% 0%, rgba(14,91,74,0.05), transparent 68%)',
            }}
          />
        </div>
      )}

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
          <footer className="border-t border-line bg-surface/70">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <span className="flex items-center gap-2 font-semibold text-ink-soft">
                <span className="h-1 w-4 rounded-full bg-brass" aria-hidden="true" />
                LedgerLine Core
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Integer paise arithmetic</span>
                <span className="hidden h-1 w-1 rounded-full bg-line-strong sm:block" aria-hidden="true" />
                <span>Double-entry reconciliation</span>
                <span className="hidden h-1 w-1 rounded-full bg-line-strong sm:block" aria-hidden="true" />
                <span>Idempotent money movement</span>
              </span>
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
