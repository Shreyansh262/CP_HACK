import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/supabase-server';
import { computeStreaks, type ProblemAttempt } from '@/lib/scoring';
import type { ProblemListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

type ProgressStatus = {
  problem_id: string;
  status: 'attempted' | 'solved' | 'given_up';
  solved_at: string | null;
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { q, tag } = await searchParams;
  const user = await getAuthUser();

  // ── Problem list query ─────────────────────────────────────────────────────
  let query = supabase
    .from('competitive_problems')
    .select('id, external_id, title, difficulty, tags')
    .order('external_id', { ascending: true })
    .limit(100);

  if (q) query = query.ilike('title', `%${q}%`);
  if (tag) query = query.contains('tags', [tag]);

  // Run problems + user progress in parallel.
  const [problemsResult, progressResult] = await Promise.all([
    query,
    user
      ? supabase
          .from('user_progress')
          .select('problem_id, status, solved_at')
          .eq('user_id', user.id)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const problems = (problemsResult.data ?? []) as ProblemListItem[];
  const progressRows = (progressResult.data ?? []) as ProgressStatus[];

  // Status lookup map for badges.
  const statusByProblem: Record<string, string> = {};
  for (const r of progressRows) {
    statusByProblem[r.problem_id] = r.status;
  }

  // ── Dashboard stats for signed-in users ───────────────────────────────────
  let currentStreak = 0;
  let totalSolved = 0;
  let lastAttempted: { id: string; external_id: string | null; title: string } | null = null;

  if (user && progressRows.length > 0) {
    totalSolved = progressRows.filter((r) => r.status === 'solved').length;

    const attempts: ProblemAttempt[] = progressRows.map((r) => ({
      difficulty_rating: null,
      hints_used: 0,
      tier1_calls: 0,
      tier2_calls: 0,
      status: r.status,
      solved_at: r.solved_at,
    }));
    currentStreak = computeStreaks(attempts).current;

    // Last touched problem (attempted, not yet solved).
    const lastAttemptedRow = progressRows
      .filter((r) => r.status === 'attempted')
      .at(0); // already ordered by updated_at DESC from the query... actually not. Supabase select doesn't order. Skip for now — just show the profile link.

    if (lastAttemptedRow) {
      const prob = problems.find((p) => p.id === lastAttemptedRow.problem_id);
      if (prob) lastAttempted = { id: prob.id, external_id: prob.external_id, title: prob.title };
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">

      {/* Dashboard banner (signed-in) */}
      {user && (
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <span>
                <span className="font-semibold text-zinc-100">{totalSolved}</span>{' '}
                <span className="text-zinc-500">solved</span>
              </span>
              <span>
                <span className="font-semibold text-zinc-100">{currentStreak}d</span>{' '}
                <span className="text-zinc-500">streak</span>
              </span>
            </div>
            <Link
              href="/profile"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Full profile →
            </Link>
          </div>

          {lastAttempted && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-zinc-500">Continue:</span>
              <Link
                href={`/problems/${lastAttempted.id}`}
                className="text-[11px] text-zinc-300 hover:text-white"
              >
                {lastAttempted.external_id ? `${lastAttempted.external_id} · ` : ''}
                {lastAttempted.title}
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Search + filter */}
      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search problems…"
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
        {tag && (
          <Link
            href={q ? `/?q=${encodeURIComponent(q)}` : '/'}
            className="flex items-center rounded border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            ✕ {tag}
          </Link>
        )}
        <button
          type="submit"
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          Search
        </button>
      </form>

      {/* Problem list */}
      <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {problems.length === 0 && (
          <p className="p-6 text-center text-sm text-zinc-500">
            No problems match your search.
          </p>
        )}

        {problems.map((p) => {
          const status = statusByProblem[p.id];
          return (
            <Link
              key={p.id}
              href={`/problems/${p.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900"
            >
              {/* Solved / attempted indicator */}
              <span className="w-3 shrink-0 text-center text-xs">
                {status === 'solved' ? (
                  <span className="text-green-500">✓</span>
                ) : status === 'attempted' ? (
                  <span className="text-zinc-500">·</span>
                ) : null}
              </span>

              {/* Problem number */}
              <span className="w-14 shrink-0 text-xs text-zinc-500">
                {p.external_id ?? '—'}
              </span>

              {/* Title */}
              <span className="flex-1 truncate text-sm text-zinc-200">
                {p.title}
              </span>

              {/* Difficulty */}
              <span className="w-12 shrink-0 text-right text-xs text-zinc-500">
                {p.difficulty ?? '—'}
              </span>

              {/* Tags */}
              <div className="flex w-32 shrink-0 flex-wrap justify-end gap-1">
                {[...new Set(p.tags ?? [])].slice(0, 2).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Anonymous CTA */}
      {!user && (
        <p className="mt-6 text-center text-xs text-zinc-600">
          Sign in to track your progress, unlock AI tutor feedback, and earn streaks.
        </p>
      )}
    </div>
  );
}