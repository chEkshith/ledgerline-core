import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import {
  Activity,
  ArrowLeftRight,
  ChevronRight,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';

function getPageMeta(pathname) {
  if (pathname === '/dashboard') return { section: 'Overview', title: 'Dashboard' };
  if (pathname.startsWith('/accounts/')) return { section: 'Banking', title: 'Account details' };
  if (pathname.startsWith('/accounts')) return { section: 'Banking', title: 'Accounts' };
  if (pathname.startsWith('/operations')) return { section: 'Banking', title: 'Move money' };
  if (pathname.startsWith('/transactions/')) return { section: 'Banking', title: 'Transaction details' };
  if (pathname.startsWith('/admin')) return { section: 'Administration', title: 'Admin console' };
  if (pathname.startsWith('/health')) return { section: 'System', title: 'Health' };
  return { section: 'LedgerLine', title: 'Workspace' };
}

function Brand({ compact = false }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
        <Landmark className="h-4 w-4" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-base font-bold tracking-tight text-ink">LedgerLine</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Ledger infrastructure
          </span>
        </span>
      )}
    </Link>
  );
}

function NavItem({ to, icon: Icon, label, active, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-brand-soft text-brand'
          : 'text-ink-soft hover:bg-slate-50 hover:text-ink'
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? 'text-brand' : 'text-slate-400 group-hover:text-ink-soft'}`} aria-hidden="true" />
      <span>{label}</span>
      {active && <ChevronRight className="ml-auto h-3.5 w-3.5 text-brand/70" aria-hidden="true" />}
    </Link>
  );
}

function SidebarContent({ onNavigate, onLogout }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();

  const isActive = (to, exact = false) =>
    exact ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`);

  const groups = [
    {
      label: 'Overview',
      items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
    },
    {
      label: 'Banking',
      items: [
        { to: '/accounts', label: 'Accounts', icon: Wallet },
        { to: '/operations', label: 'Move money', icon: ArrowLeftRight },
      ],
    },
    ...(isAdmin
      ? [
          {
            label: 'Administration',
            items: [{ to: '/admin', label: 'Admin console', icon: ShieldCheck }],
          },
        ]
      : []),
    {
      label: 'System',
      items: [{ to: '/health', label: 'Health', icon: Activity }],
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Primary">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  active={isActive(item.to, item.exact)}
                  onClick={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            Double-entry ledger
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Money movement with a ledger you can prove.
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold uppercase text-white">
            {(user?.email || 'LL').slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-ink">{user?.email}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{user?.role}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-danger"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = getPageMeta(location.pathname);

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  if (!isAuthenticated) return null;

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-surface lg:block">
        <SidebarContent onLogout={handleLogout} />
      </aside>

      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur lg:pl-64">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-sm lg:hidden"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="lg:hidden">
            <Brand compact />
          </div>

          <div className="hidden min-w-0 lg:block">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{meta.section}</div>
            <div className="truncate text-sm font-semibold text-ink">{meta.title}</div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/operations"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-ink shadow-sm transition-colors hover:bg-slate-50 sm:inline-flex"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              Move money
            </Link>

            <div className="hidden flex-col text-right leading-tight md:flex">
              <span className="max-w-[180px] truncate text-xs font-semibold text-ink">{user?.email}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{user?.role}</span>
            </div>

            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-bold uppercase text-white md:hidden">
              {(user?.email || 'LL').slice(0, 2)}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-slate-400 shadow-sm transition-colors hover:text-danger"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fadeIn"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface shadow-2xl animate-slideIn"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3.5 z-10 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="min-h-0 flex-1">
              <SidebarContent onNavigate={() => setMobileOpen(false)} onLogout={handleLogout} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
