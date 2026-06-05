import { createSupabaseServer } from '@/lib/supabase-server';
import {
  overallScore,
  computeStreaks,
  dayKey,
  type ProblemAttempt,
} from '@/lib/scoring';
import { categoriesForTags, OTHER_CATEGORY } from '@/lib/topic-categories';
import { getQuotaState } from '@/lib/quota';

/** Solved/attempted counts for one canonical topic category. */
export type CategoryStat = {
  category: string;
  solved: number;
  attempted: number;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProgressRow = {
  id: string;
  problem_id: string;
  unseen_problem_id: string | null;
  status: 'attempted' | 'solved' | 'given_up';
  hints_used: number;
  tier1_calls: number;
  tier2_calls: number;
  time_spent_seconds: number;
  first_opened_at: string;
  solved_at: string | null;
  updated_at: string;
  competitive_problems: {
    id: string;
    title: string;
    difficulty: string | null;
    tags: string[] | null;
    external_id: string | null;
  } | null;
  unseen_problems: {
    id: string;
    title: string;
    difficulty: string | null;
    tags: string[] | null;
  } | null;
};

export type DifficultyBucket = { label: string; count: number };

export type ProfileData = {
  rows: ProgressRow[];
  score: number;
  streaks: { current: number; longest: number };
  topicStats: CategoryStat[];
  difficultyBuckets: DifficultyBucket[];
  solvedByDay: Record<string, number>; // YYYY-MM-DD -> solve count
  recentRows: ProgressRow[];
  totalSolved: number;
  totalAttempted: number;
  quota: { t1Remaining: number; t2Remaining: number; activeTier: string };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFF_BUCKETS = [
  { label: '≤1200', min: 0, max: 1201 },
  { label: '1201–1599', min: 1201, max: 1600 },
  { label: '1600–1999', min: 1600, max: 2000 },
  { label: '2000–2399', min: 2000, max: 2400 },
  { label: '2400+', min: 2400, max: Infinity },
] as const;

// ─── Main query ───────────────────────────────────────────────────────────────

/**
 * Fetches all user_progress rows joined with problem data, runs the scoring
 * helpers, and returns everything the Profile page widgets need.
 *
 * timeZone: IANA string (e.g. 'Asia/Kolkata'). Defaults to UTC. Used for
 * streak and calendar day boundaries. Pass from client header or user prefs.
 */
export async function fetchProfileData(
  userId: string,
  timeZone = 'UTC',
): Promise<ProfileData | null> {
  const db = await createSupabaseServer()
  const [progressResult, quota] = await Promise.all([
    db
      .from('user_progress')
      .select(
        `id, problem_id, unseen_problem_id, status, hints_used, tier1_calls, tier2_calls,
        time_spent_seconds, first_opened_at, solved_at, updated_at,
        competitive_problems(id, title, difficulty, tags, external_id),
        unseen_problems(id, title, difficulty, tags)`,
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    getQuotaState(userId),
  ]);

  if (progressResult.error) {
    console.error('[profile-queries]', progressResult.error.message);
    return null;
  }

  const rows = (progressResult.data ?? []) as unknown as ProgressRow[];

  // ── Scoring inputs ───────────────────────────────────────────────────────
  const attempts: ProblemAttempt[] = rows.map((r) => ({
    difficulty_rating: r.competitive_problems?.difficulty
      ? Number(r.competitive_problems.difficulty)
      : null,
    hints_used: r.hints_used,
    tier1_calls: r.tier1_calls,
    tier2_calls: r.tier2_calls,
    status: r.status,
    solved_at: r.solved_at,
  }));

  // ── Derived data ─────────────────────────────────────────────────────────
  const score = overallScore(attempts);
  const streaks = computeStreaks(attempts, timeZone);

  // Aggregate by canonical category. A problem counts toward every category it
  // maps to, so totals across categories can exceed the raw problem count.
  const catAcc = new Map<string, { attempted: number; solved: number }>();
  for (const row of rows) {
    const tags =
      row.competitive_problems?.tags ?? row.unseen_problems?.tags ?? [];
    for (const category of categoriesForTags(tags)) {
      const cur = catAcc.get(category) ?? { attempted: 0, solved: 0 };
      cur.attempted += 1;
      if (row.status === 'solved') cur.solved += 1;
      catAcc.set(category, cur);
    }
  }
  const topicStats: CategoryStat[] = [...catAcc.entries()]
    .map(([category, { attempted, solved }]) => ({ category, attempted, solved }))
    .filter((c) => c.attempted > 0)
    .sort((a, b) => {
      // 'Other' always last; otherwise most-solved first.
      if (a.category === OTHER_CATEGORY) return 1;
      if (b.category === OTHER_CATEGORY) return -1;
      return b.solved - a.solved;
    });

  const solvedRows = rows.filter((r) => r.status === 'solved');

  const difficultyBuckets: DifficultyBucket[] = DIFF_BUCKETS.map(({ label, min, max }) => ({
    label,
    count: solvedRows.filter((r) => {
      const d = r.competitive_problems?.difficulty
        ? Number(r.competitive_problems.difficulty)
        : null;
      return d !== null && !Number.isNaN(d) && d >= min && d < max;
    }).length,
  }));

  // Calendar: solved count per local calendar day
  const solvedByDay: Record<string, number> = {};
  for (const row of solvedRows) {
    if (row.solved_at) {
      const k = dayKey(row.solved_at, timeZone);
      solvedByDay[k] = (solvedByDay[k] ?? 0) + 1;
    }
  }

  return {
    rows,
    score,
    streaks,
    topicStats,
    difficultyBuckets,
    solvedByDay,
    recentRows: rows.slice(0, 10),
    totalSolved: solvedRows.length,
    totalAttempted: rows.filter((r) => r.status === 'attempted').length,
    quota: {
      t1Remaining: quota.t1Remaining,
      t2Remaining: quota.t2Remaining,
      activeTier: quota.activeTier,
    },
  };
}