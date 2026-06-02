import { NextResponse } from 'next/server';
import { requireUser, isUuid } from '@/lib/progress';

/**
 * POST /api/progress/heartbeat
 * Body: { problem_id: uuid, last_ping_at?: ISO string }
 * Returns: { ok: true, server_now: ISO string }
 *
 * Client sends last_ping_at (the server_now from the previous response).
 * Server computes delta = now - last_ping_at, clamps to [0, 35]s, increments
 * time_spent_seconds. Client stores returned server_now for the next ping.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;

  let body: { problem_id?: string; last_ping_at?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!isUuid(body.problem_id)) {
    return NextResponse.json({ error: 'invalid_problem_id' }, { status: 400 });
  }

  const serverNow = new Date();

  // Ensure row exists
  const { error: ensureError } = await auth.db
    .from('user_progress')
    .upsert(
      { user_id: auth.userId, problem_id: body.problem_id, status: 'attempted' },
      { onConflict: 'user_id,problem_id', ignoreDuplicates: true },
    );

  if (ensureError) {
    console.error('[progress/heartbeat:ensure]', ensureError);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Compute clamped delta
  let deltaSeconds = 0;
  if (body.last_ping_at) {
    const last = new Date(body.last_ping_at);
    if (!isNaN(last.getTime())) {
      deltaSeconds = Math.min(
        35,
        Math.max(0, Math.floor((serverNow.getTime() - last.getTime()) / 1000)),
      );
    }
  }

  // Increment time_spent_seconds via RPC (atomic)
  if (deltaSeconds > 0) {
    const { error: rpcError } = await auth.db.rpc('increment_time_spent', {
      p_user_id: auth.userId,
      p_problem_id: body.problem_id,
      p_seconds: deltaSeconds,
    });

    if (rpcError) {
      console.error('[progress/heartbeat:rpc]', rpcError);
      // Non-fatal — return server_now so client can continue pinging
    }
  }

  return NextResponse.json({ ok: true, server_now: serverNow.toISOString() });
}