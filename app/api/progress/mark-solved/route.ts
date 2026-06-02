import { NextResponse } from 'next/server';
import { requireUser, isUuid } from '@/lib/progress';

/**
 * POST /api/progress/mark-solved
 * Body: { problem_id: uuid }
 *
 * Sets status='solved' and solved_at=now() if not already solved.
 * Idempotent — clicking twice doesn't change solved_at.
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

  // Ensure row exists (user solved without ever opening via the app)
  await auth.db
    .from('user_progress')
    .upsert(
      { user_id: auth.userId, problem_id: body.problem_id, status: 'attempted' },
      { onConflict: 'user_id,problem_id', ignoreDuplicates: true },
    );

  // Promote to solved only if not already solved (preserves original solved_at)
  const { data, error } = await auth.db
    .from('user_progress')
    .update({
      status: 'solved',
      solved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', auth.userId)
    .eq('problem_id', body.problem_id)
    .neq('status', 'solved')
    .select('solved_at')
    .maybeSingle();

  if (error) {
    console.error('[progress/mark-solved]', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, newly_solved: data !== null });
}