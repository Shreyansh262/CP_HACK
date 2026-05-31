import { Redis } from '@upstash/redis';

// ─── Configurable allocation constants ───────────────────────────────────────
// Adjust these without touching the logic.

/** Deep Analysis (3.5 Flash) calls per user per day. */
export const TIER2_USER_DAILY = 5;
/** Quick Review (Flash-Lite) calls per user per day. */
export const TIER1_USER_DAILY = 20;
/** Project-wide T2 backstop — 2 under the 20 RPD hard cap. */
export const TIER2_GLOBAL_CAP = 18;
/** Project-wide T1 backstop — under the 500 RPD hard cap. */
export const TIER1_GLOBAL_CAP = 480;

// ─── Redis client ─────────────────────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

async function getCount(key: string): Promise<number> {
  const val = await redis.get<number>(key);
  return val ?? 0;
}

/**
 * Atomic increment with TTL set only on the first write.
 * Keys auto-expire at UTC midnight.
 */
async function increment(key: string): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, secondsUntilMidnightUTC());
  }
  return count;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type QuotaState = {
  t1Remaining: number;
  t2Remaining: number;
  /** The tier we CAN use right now (after applying all constraints). */
  activeTier: 'deep' | 'quick' | 'zero';
  /** Human-readable reason for a downgrade/zero state. */
  reason?: string;
};

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Read all four counters in parallel and compute remaining quotas.
 * This is the single source of truth for the quota badge.
 */
export async function getQuotaState(userId: string): Promise<QuotaState> {
  const day = todayUTC();

  const [userT2, userT1, globalT2, globalT1] = await Promise.all([
    getCount(`quota:u:${userId}:t2:${day}`),
    getCount(`quota:u:${userId}:t1:${day}`),
    getCount(`quota:global:t2:${day}`),
    getCount(`quota:global:t1:${day}`),
  ]);

  // Remaining = min(user headroom, global headroom)
  const t2Remaining = Math.max(
    0,
    Math.min(TIER2_USER_DAILY - userT2, TIER2_GLOBAL_CAP - globalT2)
  );
  const t1Remaining = Math.max(
    0,
    Math.min(TIER1_USER_DAILY - userT1, TIER1_GLOBAL_CAP - globalT1)
  );

  if (t2Remaining > 0) {
    return { t1Remaining, t2Remaining, activeTier: 'deep' };
  }

  if (t1Remaining > 0) {
    const reason =
      userT2 >= TIER2_USER_DAILY
        ? 'Your Deep Analysis quota is used up for today.'
        : 'Deep Analysis is globally busy today — using Quick Review instead.';
    return { t1Remaining, t2Remaining: 0, activeTier: 'quick', reason };
  }

  return {
    t1Remaining: 0,
    t2Remaining: 0,
    activeTier: 'zero',
    reason: 'All AI tokens used for today. Come back tomorrow.',
  };
}

export async function incrementT1(userId: string): Promise<void> {
  const day = todayUTC();
  await Promise.all([
    increment(`quota:u:${userId}:t1:${day}`),
    increment(`quota:global:t1:${day}`),
  ]);
}

export async function incrementT2(userId: string): Promise<void> {
  const day = todayUTC();
  await Promise.all([
    increment(`quota:u:${userId}:t2:${day}`),
    increment(`quota:global:t2:${day}`),
  ]);
}

/**
 * Three-level fallback chain (§3.1 of build plan):
 *   Tier 2  →  Tier 1  →  Zero AI
 *
 * Returns the effective tier to use and the quota snapshot.
 */
export async function resolveTier(
  userId: string,
  requested: 'quick' | 'deep'
): Promise<{
  effectiveTier: 'quick' | 'deep' | 'zero';
  quotaState: QuotaState;
  downgradeReason?: string;
}> {
  const quota = await getQuotaState(userId);

  if (requested === 'deep') {
    if (quota.t2Remaining > 0) {
      return { effectiveTier: 'deep', quotaState: quota };
    }
    if (quota.t1Remaining > 0) {
      return {
        effectiveTier: 'quick',
        quotaState: quota,
        downgradeReason:
          quota.reason ?? 'Deep Analysis quota used — switching to Quick Review.',
      };
    }
    return { effectiveTier: 'zero', quotaState: quota };
  }

  // Requested 'quick'
  if (quota.t1Remaining > 0) {
    return { effectiveTier: 'quick', quotaState: quota };
  }
  return { effectiveTier: 'zero', quotaState: quota };
}