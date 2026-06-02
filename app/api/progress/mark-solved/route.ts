import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isUuid } from '@/lib/progress';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  // requireUser returns { userId, db } OR { error } — check before destructuring
  const authResult = await requireUser();
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult;

  const body = await req.json() as { problemId?: string; source?: string };
  const { problemId, source } = body;

  if (!problemId || !isUuid(problemId)) {
    return NextResponse.json({ error: 'Invalid problemId' }, { status: 400 });
  }

  const isUnseen = source === 'unseen';
  const conflictCol = isUnseen ? 'unseen_problem_id' : 'problem_id';

  // 1. Check if already solved — preserve the original solved_at (idempotent)
  const { data: existing } = await supabase
    .from('user_progress')
    .select('id, status, solved_at')
    .eq('user_id', userId)
    .eq(conflictCol, problemId)
    .maybeSingle();

  if (existing?.status === 'solved') {
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();

  // 2. Upsert — only send the relevant FK column (other defaults to NULL in DB).
  //    Avoids the TypeScript null-assignability issue with Supabase generated types.
  const { error } = isUnseen
    ? await supabase
        .from('user_progress')
        .upsert(
          { user_id: userId, unseen_problem_id: problemId, status: 'solved', solved_at: now, updated_at: now },
          { onConflict: 'user_id,unseen_problem_id' },
        )
    : await supabase
        .from('user_progress')
        .upsert(
          { user_id: userId, problem_id: problemId, status: 'solved', solved_at: now, updated_at: now },
          { onConflict: 'user_id,problem_id' },
        );

  if (error) {
    console.error('[mark-solved]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}