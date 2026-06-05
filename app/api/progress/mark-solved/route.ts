import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isUuid } from '@/lib/progress';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  // requireUser returns { userId, db } OR { error } — check before destructuring
  const authResult = await requireUser();
  if ('error' in authResult) return authResult.error;
  const { userId } = authResult;

  const body = await req.json() as { problemId?: string; problem_id?: string; source?: string };
  const problemId = body.problemId ?? body.problem_id;
  const { source } = body;

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

  // 2. Update existing row if it exists; otherwise insert a new solved row.
  //    This avoids depending on a specific composite unique constraint shape.
  const payload = isUnseen
    ? { user_id: userId, unseen_problem_id: problemId, status: 'solved', solved_at: now, updated_at: now }
    : { user_id: userId, problem_id: problemId, status: 'solved', solved_at: now, updated_at: now };

  const existingFilter = isUnseen
    ? supabase.from('user_progress').update(payload).eq('user_id', userId).eq('unseen_problem_id', problemId)
    : supabase.from('user_progress').update(payload).eq('user_id', userId).eq('problem_id', problemId);

  const { data: updatedRows, error: updateError } = await existingFilter.select('id');

  if (updateError) {
    console.error('[mark-solved:update]', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  let error = null;
  if (!updatedRows || updatedRows.length === 0) {
    const insertResult = await supabase.from('user_progress').insert(payload);
    error = insertResult.error;
  }

  if (error) {
    console.error('[mark-solved]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}