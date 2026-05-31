import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getQuotaState } from '@/lib/quota';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json(
      { t1Remaining: 0, t2Remaining: 0, activeTier: 'zero' },
      { status: 200 }
    );
  }

  const quota = await getQuotaState(user.id);
  return NextResponse.json(quota);
}