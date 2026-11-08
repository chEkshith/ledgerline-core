import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import Operations from './pages/Operations';
import TransactionDetail from './pages/TransactionDetail';
import Admin from './pages/Admin';
import Health from './pages/Health';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected Authenticated Routes */}
              <Route
                path="/"
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

              {/* Administrator Only Route */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Admin />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500 font-mono">
            LedgerLine Core • Zero Floating-Point Arithmetic • Continuous Ledger Reconciliation
          </footer>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
