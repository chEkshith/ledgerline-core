import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'theme';

function getInitialTheme() {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export default function ThemeToggle({ variant = 'light' }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const isDark = theme === 'dark';
  const onDark = variant === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      /* ignore storage failures */
    }
  }, [isDark, theme]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border px-1 shadow-sm transition-colors duration-300 ease-in-out ${
        onDark
          ? 'border-white/10 bg-white/5 hover:bg-white/10'
          : 'border-line bg-slate-100 hover:bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-between px-2 ${
          onDark ? 'text-white/40' : 'text-slate-400'
        }`}
        aria-hidden="true"
      >
        <Sun className="h-3.5 w-3.5" />
        <Moon className="h-3.5 w-3.5" />
      </span>
      <span
        className={`relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-transform duration-300 ease-in-out ${
          onDark ? 'border-white/15 bg-[#07111f] text-white' : 'border-line bg-surface text-ink'
        }`}
        style={{ transform: isDark ? 'translateX(1.75rem)' : 'translateX(0)' }}
      >
        <span
          className="inline-flex transition-transform duration-300 ease-in-out"
          style={{ transform: isDark ? 'rotate(360deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </span>
      </span>
    </button>
  );
}
