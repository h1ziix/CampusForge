'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useClientReady } from '@/lib/use-client-ready';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem('campusforge-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>('light');
  const mounted = useClientReady();
  const [initialized, setInitialized] = React.useState(false);

  if (mounted && !initialized) {
    setInitialized(true);
    setTheme(getInitialTheme());
  }

  React.useEffect(() => {
    if (mounted) applyTheme(theme);
  }, [mounted, theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem('campusforge-theme', next);
  };

  const isDark = mounted && theme === 'dark';
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-accent hover:text-foreground hover:shadow-md active:translate-y-0"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
