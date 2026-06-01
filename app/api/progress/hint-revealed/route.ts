import { NextResponse } from 'next/server';
import { requireUser, isUuid } from '@/lib/progress';

/**
 * POST /api/progress/hint-revealed
 * Body: { problem_id: uuid, level: 1 | 2 | 3 }
 *
 * Records that a hint was revealed. We store hints_used as the MAX level seen
 * (revealing level 3 implies levels 1 and 2 were already accessible), so the
 * field stays a clean "depth" metric for the scoring formula. Re-revealing a
 * lower level on a return visit never decrements.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;

  let body: { problem_id?: string; level?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!isUuid(body.problem_id)) {
    return NextResponse.json({ error: 'invalid_problem_id' }, { status: 400 });
  }
  if (!Number.isInteger(body.level) || body.level! < 1 || body.level! > 3) {
    return NextResponse.json({ error: 'invalid_level' }, { status: 400 });
  }

  // Step 1: ensure a row exists. ignoreDuplicates=true → no overwrite if present.
  const ensure = await auth.admin
    .from('user_progress')
    .upsert(
      {
        user_id: auth.userId,
        problem_id: body.problem_id,
        status: 'attempted',
        hints_used: body.level,
      },
      { onConflict: 'user_id,problem_id', ignoreDuplicates: true },
    );

  if (ensure.error) {
    console.error('[progress/hint-revealed:ensure]', ensure.error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Step 2: bump hints_used to body.level ONLY if current is lower.
  // The .lt() filter makes this a no-op when current >= level.
  const bump = await auth.admin
    .from('user_progress')
    .update({ hints_used: body.level })
    .eq('user_id', auth.userId)
    .eq('problem_id', body.problem_id)
    .lt('hints_used', body.level!)
    .select('hints_used')
    .maybeSingle();

  if (bump.error) {
    console.error('[progress/hint-revealed:bump]', bump.error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // If bump matched a row, use its value; otherwise the existing value was already >= level.
  const final = bump.data?.hints_used ?? body.level!;
  return NextResponse.json({ ok: true, hints_used: final });
}