import { useEffect, useState } from 'react';

// Per-session editor state (language + code) that survives in-app navigation —
// e.g. opening your profile and coming back — but is intentionally dropped when
// the tab/window closes. Backed by sessionStorage, keyed per problem.

type Lang = 'cpp' | 'python';

export function useSessionCode(cacheKey: string, starters: Record<Lang, string>) {
  const [language, setLanguage] = useState<Lang>('cpp');
  const [code, setCode] = useState<string>(starters.cpp);
  // Gate writes until the one-time restore has run, so the initial starter
  // value can't clobber a cached solution. State (not a ref) so the persist
  // effect below reads `false` on the first commit.
  const [hydrated, setHydrated] = useState(false);

  // Restore once on mount. We intentionally write state from this effect rather
  // than lazy-initialising from sessionStorage: these views are server-rendered,
  // so the first client render must match the server's (starter) output to stay
  // hydration-safe. The cached value is applied right after mount — before the
  // (heavy, ssr:false) Monaco editor loads, so there's no visible flash.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const saved = JSON.parse(raw) as { code?: string; language?: Lang };
        if (saved.language === 'cpp' || saved.language === 'python') {
          setLanguage(saved.language);
        }
        if (typeof saved.code === 'string') setCode(saved.code);
      }
    } catch {
      // Corrupt entry or storage unavailable (private mode quota) — ignore.
    }
    setHydrated(true);
  }, [cacheKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist on every change, once restored.
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ code, language }));
    } catch {
      // Storage full or blocked — caching is best-effort.
    }
  }, [hydrated, cacheKey, code, language]);

  // Switching language loads that language's starter (existing behaviour).
  const switchLanguage = (lang: Lang) => {
    setLanguage(lang);
    setCode(starters[lang] ?? '');
  };

  return { language, code, setCode, switchLanguage };
}
