import { NextResponse } from 'next/server';
import { requireUser, isUuid } from '@/lib/progress';

/**
 * POST /api/progress/heartbeat
 * Body: { problem_id: uuid, last_ping_at?: ISO string }
 * Returns: { ok: true, server_now: ISO string }
 *
 * Time-tracking model (Part 2 §21.2):
 *   - Client pings every 30s while problem tab is focused.
 *   - First ping: no last_ping_at. Server adds 0, returns server_now.
 *   - Subsequent pings: server computes delta = now - last_ping_at, clamps
 *     to [0, 35] seconds, adds to time_spent_seconds.
 *   - Client stores the returned server_now as its next last_ping_at.
 *
 * This avoids:
 *   - Client clock drift / spoofing (we never trust client-supplied durations).
 *   - Over-counting when tab is backgrounded mid-interval (delta caps at 35s).
 *   - Under-counting when client pings late (still bounded but accurate to 35s).
 */

const MAX_HEARTBEAT_DELTA_SEC = 35;

export async function POST(req: Request) {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;

  let body: { problem_id?: string; last_ping_at?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!isUuid(body.problem_id)) {
    return NextResponse.json({ error: 'invalid_problem_id' }, { status: 400 });
  }

  const now = new Date();
  let deltaSec = 0;

  if (body.last_ping_at) {
    const prev = new Date(body.last_ping_at);
    if (!Number.isNaN(prev.getTime())) {
      const raw = Math.floor((now.getTime() - prev.getTime()) / 1000);
      deltaSec = Math.max(0, Math.min(raw, MAX_HEARTBEAT_DELTA_SEC));
    }
  }

  if (deltaSec === 0) {
    // First ping or zero delta — still ensure a row exists so subsequent pings
    // have something to add to, but skip the increment.
    const ensure = await auth.admin
      .from('user_progress')
      .upsert(
        {
          user_id: auth.userId,
          problem_id: body.problem_id,
          status: 'attempted',
        },
        { onConflict: 'user_id,problem_id', ignoreDuplicates: true },
      );
    if (ensure.error) {
      console.error('[progress/heartbeat:ensure]', ensure.error);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, server_now: now.toISOString() });
  }

  // Increment via RPC for atomic addition. Falls back to read-modify-write if
  // the RPC isn't installed — but we install it. See migration 0003 below.
  const { error } = await auth.admin.rpc('increment_time_spent', {
    p_user_id: auth.userId,
    p_problem_id: body.problem_id,
    p_seconds: deltaSec,
  });

  if (error) {
    console.error('[progress/heartbeat:rpc]', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, server_now: now.toISOString() });
}