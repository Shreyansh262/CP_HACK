import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

/**
 * Resolve the authenticated user for a progress route.
 *
 * KEY CHANGE from original: returns the SSR client (user JWT) for writes,
 * NOT the service-role admin client. Supabase RLS is designed for this pattern:
 * the user's JWT is in the cookie, auth.uid() matches user_id in policies,
 * and writes succeed without needing service_role bypass.
 */
export async function requireUser() {
  const db = await createSupabaseServer();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }

  return { userId: user.id, db };
}

/** UUID v4-ish shape check (Supabase always returns v4). */
export function isUuid(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}