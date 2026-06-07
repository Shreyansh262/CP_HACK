'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UnseenProblemInput() {
  const [url, setUrl]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const router = useRouter();

  async function handlePaste() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/unseen/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json() as { problem?: { id: string }; error?: string };

      if (!res.ok || !data.problem) {
        setError(data.error ?? 'Could not parse the problem. Check the URL and try again.');
        return;
      }

      router.push(`/problems/unseen/${data.problem.id}`);
    } catch {
      setError('Network error — please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="mb-2 text-sm font-medium text-zinc-300">
        Solve any Codeforces problem
      </p>
      <p className="mb-3 text-xs text-zinc-500">
        Paste a problem URL to open it in the tutor IDE
      </p>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handlePaste()}
          placeholder="https://codeforces.com/problemset/problem/1700/A"
          disabled={loading}
          className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm
                     text-zinc-200 placeholder:text-zinc-600
                     focus:border-zinc-500 focus:outline-none
                     disabled:opacity-50"
        />
        <button
          onClick={handlePaste}
          disabled={loading || !url.trim()}
          className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300
                     hover:border-zinc-500 hover:text-zinc-100
                     disabled:cursor-not-allowed disabled:opacity-40
                     transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Fetching…
            </span>
          ) : 'Open'}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p>
      )}

      <p className="mt-2 text-[13px] text-zinc-600">
        Supports: codeforces.com/problemset/problem/… · codeforces.com/contest/…/problem/…
      </p>
    </div>
  );
}