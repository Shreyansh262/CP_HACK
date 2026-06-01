import { NextResponse } from 'next/server';
import { requireUser, isUuid } from '@/lib/progress';

/**
 * POST /api/progress/mark-solved
 * Body: { problem_id: uuid }
 *
 * User clicks "I solved it". Sets status='solved' and solved_at=now() if not
 * already solved. Idempotent — clicking it twice doesn't bump solved_at.
 *
 * Phase 5 will additionally auto-call this when code execution against samples
 * all-passes.
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

  // Ensure a row exists (rare case: user solves without ever firing /open).
  const ensure = await auth.admin
    .from('user_progress')
    .upsert(
      {
        user_id: auth.userId,
        problem_id: body.problem_id,
        status: 'solved',
        solved_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,problem_id', ignoreDuplicates: true },
    );

  if (ensure.error) {
    console.error('[progress/mark-solved:ensure]', ensure.error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Promote existing rows. Filter on status != 'solved' so we don't bump solved_at.
  const promote = await auth.admin
    .from('user_progress')
    .update({ status: 'solved', solved_at: new Date().toISOString() })
    .eq('user_id', auth.userId)
    .eq('problem_id', body.problem_id)
    .neq('status', 'solved')
    .select('solved_at')
    .maybeSingle();

  if (promote.error) {
    console.error('[progress/mark-solved:promote]', promote.error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, newly_solved: promote.data !== null });
}