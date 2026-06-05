/**
 * Performance scoring — Phase 4.
 *
 * Transparent formula so the user can always reason about why a score changed.
 * Numbers are starting points; tune after real usage data. This is the single
 * place to edit them.
 *
 * See Part 2 §16.2.
 */

export interface ProblemAttempt {
  /** Codeforces-style rating, e.g. 1200, 1800. Falsy → treated as 1000. */
  difficulty_rating: number | null;
  /** 0..3 — how many stored hints were revealed. */
  hints_used: number;
  /** Quick Review calls used on this problem. */
  tier1_calls: number;
  /** Deep Analysis calls used on this problem. */
  tier2_calls: number;
  /** Only 'solved' attempts contribute to overall_score. */
  status: 'attempted' | 'solved' | 'given_up';
  /** ISO timestamp; used to bound to last 30 days. */
  solved_at: string | null;
}

// ---------- Tunable constants (the ONE place to edit the formula) ----------

/** Rating that maps to a full base contribution of 1.0. Set below the CF top
 *  (~3500) so mid/hard solves earn a healthy base — leniency knob. */
const MAX_RATING = 3250;
/** Rating used when a problem has no difficulty recorded. */
const DEFAULT_RATING = 1100;
/** Each revealed hint shaves this fraction off a full problem. */
const HINT_PENALTY = 0.04;
/** Each Quick Review (Tier 1) call penalty. */
const T1_PENALTY = 0.015;
/** Each Deep Analysis (Tier 2) call penalty — costs more than Quick. */
const T2_PENALTY = 0.05;
/** Scales one problem's net contribution into "points". ~10–11 clean medium
 *  solves approach the cap. */
const POINTS_PER_PROBLEM = 16;
/** Overall score is clamped to [FLOOR, SCORE_CAP]. */
const SCORE_CAP = 100;
const FLOOR = 0;

// ---------- Per-problem points ----------

/**
 * Net points for one solved problem. Returns 0 for non-solved attempts so
 * callers can sum across mixed arrays. CAN be negative: heavy hint + AI use on
 * an easy problem makes the penalties exceed the base, so a sloppy solve drags
 * the 30-day total down rather than merely adding little.
 */
export function problemScore(attempt: ProblemAttempt): number {
  if (attempt.status !== 'solved') return 0;
  const rating = attempt.difficulty_rating ?? DEFAULT_RATING;

  const base = rating / MAX_RATING; // 0..1, rewards harder problems
  const hintPen = HINT_PENALTY * attempt.hints_used;
  const aiPen = T1_PENALTY * attempt.tier1_calls + T2_PENALTY * attempt.tier2_calls;

  const rawContribution = base - hintPen - aiPen; // may be negative
  return rawContribution * POINTS_PER_PROBLEM;
}

// ---------- Aggregate score ----------

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Normalized 0..100 score: sum of per-problem points for solves in the last 30
 * days, clamped to [FLOOR, SCORE_CAP]. Bounded (not an unbounded sum) and can
 * go down across the window when problems are solved with heavy assistance.
 * `now` is injectable for testing; defaults to wall clock.
 */
export function overallScore(
  attempts: ProblemAttempt[],
  now: Date = new Date(),
): number {
  const cutoff = now.getTime() - THIRTY_DAYS_MS;
  let total = 0;
  for (const a of attempts) {
    if (a.status !== 'solved' || !a.solved_at) continue;
    const t = new Date(a.solved_at).getTime();
    if (Number.isNaN(t) || t < cutoff) continue;
    total += problemScore(a);
  }
  return Math.round(Math.max(FLOOR, Math.min(SCORE_CAP, total)));
}

// ---------- Streaks ----------

/**
 * Convert an ISO timestamp to a YYYY-MM-DD key in the given IANA timezone.
 * Defaults to UTC; pass the user's browser tz for streak math that respects
 * their local midnight (see Part 2 §21.5).
 */
export function dayKey(iso: string, timeZone = 'UTC'): string {
  const d = new Date(iso);
  // en-CA gives YYYY-MM-DD; reliable cross-locale.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function dayKeyFromDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function prevDayKey(key: string): string {
  // key is YYYY-MM-DD; arithmetic in UTC is fine because we only care about
  // the calendar-day delta, not the wall-clock instant.
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export interface StreakResult {
  current: number;
  longest: number;
}

/**
 * Current and longest streak of consecutive days with ≥1 solved problem.
 * "Current" is allowed to break only when today AND yesterday are both empty
 * (so a streak survives until the user misses two consecutive days? — no,
 * standard definition: current streak ends when the most recent day with a
 * solve is older than yesterday). We use the standard definition.
 */
export function computeStreaks(
  attempts: ProblemAttempt[],
  timeZone = 'UTC',
  now: Date = new Date(),
): StreakResult {
  const solvedDays = new Set<string>();
  for (const a of attempts) {
    if (a.status === 'solved' && a.solved_at) {
      solvedDays.add(dayKey(a.solved_at, timeZone));
    }
  }
  if (solvedDays.size === 0) return { current: 0, longest: 0 };

  const sorted = [...solvedDays].sort(); // ascending YYYY-MM-DD

  // Longest streak: walk sorted days, count consecutive runs.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (prevDayKey(sorted[i]) === sorted[i - 1]) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // Current streak: walk back from today.
  const todayKey = dayKeyFromDate(now, timeZone);
  const yesterdayKey = prevDayKey(todayKey);
  let cursor: string;
  if (solvedDays.has(todayKey)) cursor = todayKey;
  else if (solvedDays.has(yesterdayKey)) cursor = yesterdayKey;
  else return { current: 0, longest };

  let current = 0;
  while (solvedDays.has(cursor)) {
    current += 1;
    cursor = prevDayKey(cursor);
  }

  return { current, longest };
}

// ---------- Topic strength ----------

export interface TopicStat {
  tag: string;
  attempted: number;
  solved: number;
  /** 0..1; null when attempted=0 (caller decides how to render). */
  rate: number | null;
}

/**
 * Per-tag solved/attempted breakdown. `tagsByProblemId` maps a problem id to
 * its tag array; callers usually build this from a join on competitive_problems.
 */
export function topicStrength(
  attempts: Array<{ problem_id: string; status: ProblemAttempt['status'] }>,
  tagsByProblemId: Record<string, string[]>,
): TopicStat[] {
  const acc = new Map<string, { attempted: number; solved: number }>();
  for (const a of attempts) {
    const tags = tagsByProblemId[a.problem_id];
    if (!tags) continue;
    for (const rawTag of tags) {
      const tag = rawTag.trim();
      if (!tag) continue;
      const cur = acc.get(tag) ?? { attempted: 0, solved: 0 };
      cur.attempted += 1;
      if (a.status === 'solved') cur.solved += 1;
      acc.set(tag, cur);
    }
  }
  return [...acc.entries()]
    .map(([tag, { attempted, solved }]) => ({
      tag,
      attempted,
      solved,
      rate: attempted > 0 ? solved / attempted : null,
    }))
    .sort((a, b) => {
      // Weakest first by Laplace-smoothed rate (solved+1)/(attempted+2). The
      // old `rate * (attempted<3 ? 2 : 1)` hack did nothing at rate 0, so a
      // single 0/1 attempt ranked as the weakest topic. Smoothing pulls
      // low-sample tags toward neutral (0.5) so they don't dominate.
      const aSmooth = (a.solved + 1) / (a.attempted + 2);
      const bSmooth = (b.solved + 1) / (b.attempted + 2);
      return aSmooth - bSmooth;
    });
}