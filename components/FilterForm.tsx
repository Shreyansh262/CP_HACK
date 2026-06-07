'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const DIFFICULTY_BUCKETS = [
  { label: 'Easy', min: 0, max: 1299 },
  { label: 'Medium', min: 1300, max: 1799 },
  { label: 'Hard', min: 1800, max: 9999 },
];

export default function FilterForm({
  categories,
  defaultQ,
  defaultCats,
  defaultDifficulty,
}: {
  categories: string[];
  defaultQ: string;
  defaultCats: string[];
  defaultDifficulty: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(defaultQ);
  const [selectedCats, setSelectedCats] = useState<string[]>(defaultCats);
  const [difficulty, setDifficulty] = useState(defaultDifficulty); // 'Easy'|'Medium'|'Hard'|''
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function toggleCat(c: string) {
    setSelectedCats((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  function apply() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (selectedCats.length) params.set('cat', selectedCats.join(','));
    if (difficulty) params.set('difficulty', difficulty);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : '/');
    setOpen(false);
  }

  function clearAll() {
    setQ('');
    setSelectedCats([]);
    setDifficulty('');
    router.push('/');
    setOpen(false);
  }

  const activeCount = selectedCats.length + (difficulty ? 1 : 0);

  return (
    <div className="mb-6 space-y-2">
      {/* Search row */}
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          placeholder="Search title…"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />

        {/* Filter dropdown trigger */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
              open || activeCount > 0
                ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 3.5A.5.5 0 0 1 2 3h12a.5.5 0 0 1 .354.854L10 7.707V13.5a.5.5 0 0 1-.777.416l-3-2A.5.5 0 0 1 6 11.5V7.707L1.646 3.854A.5.5 0 0 1 1.5 3.5z" />
            </svg>
            Filters
            {activeCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-[14px] font-bold text-zinc-900">
                {activeCount}
              </span>
            )}
          </button>

          {/* Dropdown panel */}
          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
              {/* Difficulty */}
              <div className="border-b border-zinc-800 p-4">
                <p className="mb-2 text-[14px] font-semibold uppercase tracking-wider text-zinc-500">
                  Difficulty
                </p>
                <div className="flex gap-2">
                  {DIFFICULTY_BUCKETS.map((b) => (
                    <button
                      key={b.label}
                      onClick={() =>
                        setDifficulty((d) => (d === b.label ? '' : b.label))
                      }
                      className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                        difficulty === b.label
                          ? b.label === 'Easy'
                            ? 'border-emerald-400 bg-emerald-100 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300'
                            : b.label === 'Medium'
                            ? 'border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-300'
                            : 'border-red-400 bg-red-100 text-red-800 dark:border-red-600 dark:bg-red-900/50 dark:text-red-300'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div className="p-4">
                <p className="mb-2 text-[14px] font-semibold uppercase tracking-wider text-zinc-500">
                  Category
                </p>
                <div className="max-h-52 overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-1">
                    {categories.map((c) => (
                      <label
                        key={c}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCats.includes(c)}
                          onChange={() => toggleCat(c)}
                          className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-zinc-100"
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
                <button
                  onClick={clearAll}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Clear all
                </button>
                <button
                  onClick={apply}
                  className="rounded-md bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Search apply */}
        <button
          onClick={apply}
          className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Search
        </button>
      </div>

      {/* Active filter chips */}
      {(selectedCats.length > 0 || difficulty) && (
        <div className="flex flex-wrap gap-1.5">
          {difficulty && (
            <span className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[14px] text-zinc-300">
              {difficulty}
              <button
                onClick={() => { setDifficulty(''); apply(); }}
                className="ml-0.5 text-zinc-500 hover:text-zinc-200"
              >×</button>
            </span>
          )}
          {selectedCats.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[14px] text-zinc-300"
            >
              {c}
              <button
                onClick={() => { toggleCat(c); apply(); }}
                className="ml-0.5 text-zinc-500 hover:text-zinc-200"
              >×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}