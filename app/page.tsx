import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { ProblemListItem } from '@/lib/types';
import FilterForm from '@/components/FilterForm';

export const dynamic = 'force-dynamic';

const DIFFICULTY_RANGES: Record<string, [number, number]> = {
  Easy: [0, 1299],
  Medium: [1300, 1799],
  Hard: [1800, 9999],
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tags?: string; difficulty?: string }>;
}) {
  const { q, tags: tagsParam, difficulty } = await searchParams;
  const selectedTags = tagsParam ? tagsParam.split(',').filter(Boolean) : [];

  // ── Fetch distinct tags for the filter panel ──────────────────────────────
  const { data: tagRows } = await supabase
    .from('competitive_problems')
    .select('tags');
  const allTags = [
    ...new Set((tagRows ?? []).flatMap((r) => r.tags ?? [])),
  ].sort() as string[];

  // ── Build filtered problems query ─────────────────────────────────────────
  let query = supabase
    .from('competitive_problems')
    .select('id, external_id, title, difficulty, tags')
    .order('external_id', { ascending: true })
    .limit(200);

  if (q) query = query.ilike('title', `%${q}%`);
  // OR match: show problems that have any of the selected tags
  if (selectedTags.length) query = (query as any).overlaps('tags', selectedTags);

  const { data, error } = await query;
  let problems = (data ?? []) as ProblemListItem[];

  // Difficulty filter is JS-side (difficulty col is varchar, avoids cast issues)
  if (difficulty && DIFFICULTY_RANGES[difficulty]) {
    const [min, max] = DIFFICULTY_RANGES[difficulty];
    problems = problems.filter((p) => {
      const n = parseInt(p.difficulty ?? '0', 10);
      return !isNaN(n) && n >= min && n <= max;
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">AI Coding Tutor</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Progressive hints, never full solutions. Pick a problem to begin.
        </p>
      </header>

      <FilterForm
        allTags={allTags}
        defaultQ={q ?? ''}
        defaultTags={selectedTags}
        defaultDifficulty={difficulty ?? ''}
      />

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          DB error: {error.message}
        </div>
      )}

      <div className="mb-3 text-xs text-zinc-500">
        {problems.length} problem{problems.length !== 1 ? 's' : ''}
      </div>

      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {problems.map((p) => (
          <li key={p.id}>
            <Link
              href={`/problems/${p.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-zinc-900"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {p.external_id && (
                    <span className="mr-2 text-zinc-500">{p.external_id}</span>
                  )}
                  {p.title}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {[...new Set(p.tags ?? [])].slice(0, 5).map((t: string) => (
                    <span
                      key={t}
                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <span className="ml-4 shrink-0 text-xs text-zinc-500">
                {p.difficulty ?? '—'}
              </span>
            </Link>
          </li>
        ))}
        {problems.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-zinc-500">
            No problems match your filters.
          </li>
        )}
      </ul>

      <footer className="mt-10 text-xs text-zinc-500">
        Problems sourced from{' '}
        <a
          className="underline hover:text-zinc-300"
          href="https://huggingface.co/datasets/open-r1/codeforces"
        >
          open-r1/codeforces
        </a>{' '}
        (ODC-By 4.0).
      </footer>
    </main>
  );
}