import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { ProblemListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { q, tag } = await searchParams;

  let query = supabase
    .from('competitive_problems')
    .select('id, external_id, title, difficulty, tags')
    .order('external_id', { ascending: true })
    .limit(100);

  if (q) query = query.ilike('title', `%${q}%`);
  if (tag) query = query.contains('tags', [tag]);

  const { data, error } = await query;
  const problems = (data ?? []) as ProblemListItem[];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">AI Coding Tutor</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Progressive hints, never full solutions. Pick a problem to begin.
        </p>
      </header>

      <form className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search title…"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <input
          name="tag"
          defaultValue={tag ?? ''}
          placeholder="Tag (e.g. dp, greedy)"
          className="w-56 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <button className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white">
          Filter
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          DB error: {error.message}
        </div>
      )}

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
                  {(p.tags ?? []).slice(0, 5).map((t: string) => (
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
            No problems match.
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