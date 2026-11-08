import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Wallet,
  ArrowLeftRight,
  ShieldCheck,
  Activity,
  LogOut,
  User,
  Layers,
} from 'lucide-react';

export default function Navbar() {
  const { user, isAuthenticated, logout, isAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return null;

  const isActive = (path) => location.pathname === path;

  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center font-bold text-white text-base shadow-lg shadow-teal-500/20 group-hover:scale-105 transition-transform">
                LL
              </div>
              <div>
                <span className="font-bold text-lg text-white tracking-tight">LedgerLine</span>
                <span className="text-[10px] block uppercase tracking-widest text-teal-400 font-mono -mt-1">
                  Core Engine
                </span>
              </div>
            </Link>

            {/* Navigation links */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive('/')
                    ? 'bg-slate-800 text-teal-400'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Layers className="w-4 h-4" />
                Dashboard
              </Link>

              <Link
                to="/accounts"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive('/accounts') || location.pathname.startsWith('/accounts/')
                    ? 'bg-slate-800 text-teal-400'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Wallet className="w-4 h-4" />
                Accounts
              </Link>

              <Link
                to="/operations"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive('/operations')
                    ? 'bg-slate-800 text-teal-400'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                Move Money
              </Link>

              {isAdmin && (
                <Link
                  to="/admin"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                    isActive('/admin')
                      ? 'bg-slate-800 text-teal-400'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  Admin
                </Link>
              )}

              <Link
                to="/health"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive('/health')
                    ? 'bg-slate-800 text-teal-400'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Activity className="w-4 h-4" />
                Health
              </Link>
            </nav>
          </div>

          {/* User profile & logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-medium text-slate-200">{user?.email}</span>
              <span className="text-[11px] font-mono text-teal-400 uppercase tracking-wider">
                {user?.role}
              </span>
            </div>

            <div className="h-8 w-px bg-slate-800 hidden sm:block"></div>

            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
