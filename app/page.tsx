import Link from 'next/link';
import { createSupabaseServer, getAuthUser } from '@/lib/supabase-server';
import { computeStreaks, type ProblemAttempt } from '@/lib/scoring';
import type { ProblemListItem } from '@/lib/types';
import FilterForm from '@/components/FilterForm';
import UnseenProblemInput from '@/components/UnseenProblemInput';
import {
  CATEGORIES,
  ALL_MAPPED_TAGS,
  OTHER_CATEGORY,
  tagsForCategory,
} from '@/lib/topic-categories';
export const dynamic = 'force-dynamic';

/** PostgREST array literal with every element double-quoted (safe for tags
 *  with spaces/hyphens like "two pointers", "2-sat"). */
function pgArray(tags: string[]): string {
  return `{${tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(',')}}`;
}

const PAGE_SIZE = 50;

const DIFFICULTY_RANGES: Record<string, [number, number]> = {
  Easy: [0, 1299],
  Medium: [1300, 1799],
  Hard: [1800, 9999],
};

type ProgressStatus = {
  problem_id: string;
  status: 'attempted' | 'solved' | 'given_up';
  solved_at: string | null;
  hints_used: number;
  tier1_calls: number;
  tier2_calls: number;
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    cat?: string;
    difficulty?: string;
    page?: string;
  }>;
}) {
  const { q, cat, difficulty, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // User-scoped reads go through the SSR (anon-key) client so RLS applies.
  const db = await createSupabaseServer();
  const user = await getAuthUser();

  // ── Problem list query ─────────────────────────────────────────────────────
  let query = db
    .from('competitive_problems')
    .select('id, external_id, title, difficulty, tags', { count: 'exact' })
    .order('external_id', { ascending: true })
    .range(from, to);

  if (q) query = query.ilike('title', `%${q}%`);

  // Category filter. Mapped categories expand to their CF tags (overlaps).
  // "Other" = no tag maps to any category (not-overlaps the full mapped set).
  // Both selected → OR of the two conditions, all server-side so pagination +
  // count stay correct.
  const selectedCats = cat ? cat.split(',').filter(Boolean) : [];
  if (selectedCats.length) {
    const mapped = selectedCats.filter((c) => c !== OTHER_CATEGORY);
    const wantOther = selectedCats.includes(OTHER_CATEGORY);
    const conds: string[] = [];
    const unionTags = [...new Set(mapped.flatMap(tagsForCategory))];
    if (unionTags.length) conds.push(`tags.ov.${pgArray(unionTags)}`);
    if (wantOther) conds.push(`tags.not.ov.${pgArray(ALL_MAPPED_TAGS)}`);
    if (conds.length) query = query.or(conds.join(','));
  }

  if (difficulty && DIFFICULTY_RANGES[difficulty]) {
    const [min, max] = DIFFICULTY_RANGES[difficulty];
    query = query.gte('difficulty', min).lte('difficulty', max);
  }

  // ── Run problem + progress queries in parallel ─────────────────────────────
  const [problemsResult, progressResult] = await Promise.all([
    query,
    user
      ? db
          .from('user_progress')
          .select('problem_id, status, solved_at, hints_used, tier1_calls, tier2_calls')
          .eq('user_id', user.id)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const problems = (problemsResult.data ?? []) as ProblemListItem[];
  const totalCount = problemsResult.count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const progressRows = (progressResult.data ?? []) as ProgressStatus[];
  const statusByProblem: Record<string, string> = {};
  for (const r of progressRows) {
    statusByProblem[r.problem_id] = r.status;
  }

  // ── Dashboard stats for signed-in users ───────────────────────────────────
  let currentStreak = 0;
  let totalSolved = 0;

  if (user && progressRows.length > 0) {
    totalSolved = progressRows.filter((r) => r.status === 'solved').length;
    const attempts: ProblemAttempt[] = progressRows.map((r) => ({
      difficulty_rating: null,
      hints_used: r.hints_used,
      tier1_calls: r.tier1_calls,
      tier2_calls: r.tier2_calls,
      status: r.status,
      solved_at: r.solved_at,
    }));
    currentStreak = computeStreaks(attempts).current;
  }

  // ── Pagination params helper ───────────────────────────────────────────────
  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cat) params.set('cat', cat);
    if (difficulty) params.set('difficulty', difficulty);
    params.set('page', String(p));
    return `/?${params.toString()}`;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6">

      {/* ── Signed-in dashboard banner ── */}
      {user && (
        <div className="mb-6 flex items-center gap-6 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="flex flex-col">
            <span className="text-2xl font-bold tabular-nums text-zinc-100">
              {totalSolved}
            </span>
            <span className="text-xs text-zinc-500">Problems solved</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold tabular-nums text-orange-400">
              {currentStreak}
            </span>
            <span className="text-xs text-zinc-500">Day streak 🔥</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/profile"
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
            >
              Full profile →
            </Link>
          </div>
        </div>
      )}

      {/* ── Filter ── */}
      <div className="mb-4">
        <FilterForm
          // Remount when the URL filter changes (incl. browser back/forward) so
          // the form's local state can't drift from the rendered results.
          key={`${q ?? ''}|${cat ?? ''}|${difficulty ?? ''}`}
          categories={CATEGORIES}
          defaultQ={q ?? ''}
          defaultCats={selectedCats}
          defaultDifficulty={difficulty ?? ''}
        />
      </div>

      {/* ── Count + pagination info ── */}
      <div className="mb-3 flex items-center justify-between text-sm text-zinc-500">
        <span>
          {totalCount === 0
            ? 'No problems found'
            : `${from + 1}–${Math.min(to + 1, totalCount)} of ${totalCount} problems`}
        </span>
        {totalPages > 1 && (
          <span>
            Page {page} of {totalPages}
          </span>
        )}
      </div>
      <UnseenProblemInput />
      {/* ── Problem list ── */}
      <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {problems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            No problems match your filters.
          </div>
        ) : (
          problems.map((p) => {
            const status = statusByProblem[p.id];
            return (
              <Link
                key={p.id}
                href={`/problems/seen/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-zinc-900"
              >
                {/* Status badge */}
                <span className="w-4 shrink-0 text-center">
                  {status === 'solved' ? (
                    <span className="text-green-500 text-base">✓</span>
                  ) : status === 'attempted' ? (
                    <span className="text-yellow-600 text-base">·</span>
                  ) : null}
                </span>

                {/* ID + title */}
                <span className="w-16 shrink-0 text-zinc-500 tabular-nums">
                  {p.external_id ?? '—'}
                </span>
                <span className="flex-1 font-medium text-zinc-200">
                  {p.title}
                </span>

                {/* Difficulty */}
                <span
                  className={`shrink-0 text-sm font-medium ${Number(p.difficulty) <= 1299
                      ? 'text-green-500'
                      : Number(p.difficulty) <= 1799
                        ? 'text-yellow-500'
                        : 'text-red-500'
                    }`}
                >
                  {p.difficulty ?? '—'}
                </span>

                {/* Tags */}
                <span className="hidden w-56 shrink-0 truncate text-right text-xs text-zinc-600 sm:block">
                  {[...new Set(p.tags ?? [])].slice(0, 3).join(', ')}
                </span>
              </Link>
            );
          })
        )}
      </div>

      {/* ── Pagination controls ── */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
            >
              ← Prev
            </Link>
          )}

          {/* Page number buttons (show at most 7) */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (p) =>
                p === 1 ||
                p === totalPages ||
                Math.abs(p - page) <= 2,
            )
            .reduce<(number | '...')[]>((acc, p, idx, arr) => {
              if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) {
                acc.push('...');
              }
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-1 text-zinc-600">
                  …
                </span>
              ) : (
                <Link
                  key={p}
                  href={pageUrl(p as number)}
                  className={`rounded-md border px-3 py-2 text-sm ${p === page
                      ? 'border-zinc-400 bg-zinc-800 text-zinc-100'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                >
                  {p}
                </Link>
              ),
            )}

          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Next →
            </Link>
          )}
        </div>
      )}

      {/* ── Anon CTA ── */}
      {!user && (
        <p className="mt-6 text-center text-sm text-zinc-600">
          <Link href="/auth" className="text-zinc-400 underline hover:text-zinc-200">
            Sign in
          </Link>{' '}
          to unlock AI-powered hints and track your progress.
        </p>
      )}
    </div>
  );
}