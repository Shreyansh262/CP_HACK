'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

// The theme lives on <html data-theme> (seeded before paint by the inline script
// in layout.tsx). We read it as an external store so there's no setState-in-effect
// and SSR stays consistent. The 'themechange' event is dispatched on toggle.
function subscribe(callback: () => void) {
  window.addEventListener('themechange', callback);
  return () => window.removeEventListener('themechange', callback);
}
function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
function getServerSnapshot(): Theme {
  return 'dark'; // matches the SSR default on <html data-theme="dark">
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const root = document.documentElement;
    // Read the live attribute (not React state) so a click always flips the
    // actual current theme, even if the store hasn't re-synced after hydration.
    const current: Theme = root.dataset.theme === 'light' ? 'light' : 'dark';
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    root.style.colorScheme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* ignore (private mode etc.) */
    }
    window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  };

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      suppressHydrationWarning
      className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
    >
      {theme === 'dark' ? (
        // Sun — tap to switch to light
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // Moon — tap to switch to dark
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
