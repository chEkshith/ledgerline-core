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
      className={`group relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border shadow-sm transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 ${
        onDark
          ? 'border-white/12 bg-white/5 text-[#f8f5ed] hover:bg-white/10 focus-visible:ring-emerald-300'
          : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-paper focus-visible:ring-brand'
      }`}
    >
      <span
        className="absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-out"
        style={{ transform: isDark ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.4)', opacity: isDark ? 1 : 0 }}
        aria-hidden="true"
      >
        <Moon className="h-4 w-4" />
      </span>
      <span
        className="absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-out"
        style={{ transform: isDark ? 'rotate(-90deg) scale(0.4)' : 'rotate(0deg) scale(1)', opacity: isDark ? 0 : 1 }}
        aria-hidden="true"
      >
        <Sun className="h-4 w-4" />
      </span>
    </button>
  );
}
