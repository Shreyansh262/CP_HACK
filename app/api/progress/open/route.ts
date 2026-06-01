import { NextResponse } from 'next/server';
import { requireUser, isUuid } from '@/lib/progress';

/**
 * POST /api/progress/open
 * Body: { problem_id: uuid }
 *
 * Marks that the user opened a problem. Idempotent — if a row already exists,
 * leaves status/hints/solved_at untouched (we don't want re-opening a solved
 * problem to demote it back to 'attempted').
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;

  let body: { problem_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!isUuid(body.problem_id)) {
    return NextResponse.json({ error: 'invalid_problem_id' }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('user_progress')
    .upsert(
      {
        user_id: auth.userId,
        problem_id: body.problem_id,
        status: 'attempted',
      },
      {
        onConflict: 'user_id,problem_id',
        // Do not overwrite existing status / counters / solved_at on re-open.
        ignoreDuplicates: true,
      },
    );

  if (error) {
    console.error('[progress/open]', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}